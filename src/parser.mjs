/** Parses unicodeset string to an AST */
import fsPromises from "fs/promises";
import * as character_names from "./unidata/character_names.mjs";
import * as properties from "./unidata/properties.mjs";
import { Grammars } from 'ebnf';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const grammar = (await fsPromises.readFile(__dirname+"/unicode_set.ebnf")).toString();
const EBNF_AST = new Grammars.W3C.Parser(grammar, {debug:false});
/** Map from grammar operators to RangeGroup operations
 * @private
 */
const setOpsReadable = {
	"+": "union",
	"&": "intersect",
	"-": "difference",
	"~": "symmetricDifference"
};
/** These parsers take the AST output from ebnf lib and turn it into a more usable form;
 * Additionally, they do some validation for stuff that isn't handled easily by the raw grammar
 * @private
 */
const parsers = {
	root: async (ast) => {
		const child = ast.children[0];
		return await parsers[child.type](child);
	},
	// escape sequences to string
	quoted: async (ast) => {
		let t = ast.text;
		if (t.length === 1){
			// escape code substitutions
			switch (t){
				case 'a': t = '\x07'; break;
				case 'b': t = '\x08'; break;
				case 't': t = '\x09'; break;
				case 'n': t = '\x0A'; break;
				case 'v': t = '\x0B'; break;
				case 'f': t = '\x0C'; break;
				case 'r': t = '\x0D'; break;
				case '\\': t = '\x5C'; break;
				// else take character literally
			}
		}
		else{
			const named = t[0] == "N";
			// get portion inside brackets
			const bracket = t.indexOf('{',1);
			if (bracket !== -1)
				t = t.substring(bracket+1, t.length-1);
			// exclude prefix
			else t = t.substring(1);
			// named unicode character
			if (named){
				await character_names.load();
				const name = t;
				t = character_names.get(name);
				if (t === null)
					throw Error("Unknown unicode character name: "+name);
			}
			// bracketed list of codepoints
			else if (bracket !== -1)
				t = String.fromCodePoint(...t.trim().split(/\s+/g).map(s => parseInt(s, 16)));
			// single codepoint
			else t = String.fromCodePoint(parseInt(t.replace(/\s+/g, ""), 16));
		}
		return t;
	},
	// property group
	prop: async (ast) => {
		const c = ast.children;
		let invert = false;
		let name = "";
		let value = "";
		for (const ci of c){
			let ct = ci.text;
			switch (ci.type){
				case "propName":
					name = ct;
					break;
				case "propNegateP":
					if (ct !== "P")
						break;
					// fallthrough
				case "propNegate":
				case "propNotEqual":
					invert = !invert;
					break;
				case "posixName":
				case "perlName": {
					// quoted value
					if (ci.children.length)
						ct = await parsers.quoted(ci.children[0])
					name += ct;
					break;
				}
				case "posixValue":
				case "perlValue": {
					// quoted value
					if (ci.children.length)
						ct = await parsers.quoted(ci.children[0])
					value += ct;
					break;
				}
			}
		}
		await properties.load();
		const group = await properties.get(name, value);
		// binary property value of n/no/f/false is inverted
		if (group.invert)
			invert = !invert;
		return {
			type: "property",
			invert, op: "union", group: group.group,
			name, value
		};
	},
	// character/string sequences (e.g. a group)
	seq: async (ast) => {
		const c = ast.children;
		let invert = false;
		let items = [];
		// group is unioned by default with left-to-right precedence; &/- are intersection/subtract,
		// and are handled by seqSetOps instead
		for (const ci of c){
			switch (ci.type){
				case "invertSeq":
					invert = !invert;
					break;
				case "charRange":
				case "stringRange": {
					let range = await parsers._range_generic(ci);
					let obj;
					// single
					if (range.length === 1){
						// trim off "Range"
						const prefix = ci.type.substring(0, ci.type.length-5)
						obj = {
							type: prefix,
							value: prefix === "char" ? Array.from(range[0]) : range
						};
					}
					// range
					else obj = {type: ci.type, value: [range]}
					// merge matching enumerated types
					const prev = items.at(-1);
					if (prev && obj.type === prev.type){
						if (obj.type !== "empty")
							prev.value.push(...obj.value);
						break;
					}
					obj.op = "union";
					obj.invert = false;
					items.push(obj);
				} break;
				case "seqSetOps": {
					for await (const obj of parsers.seqSetOps(ci))
						items.push(obj);
				} break;
			}
		}
		let obj;
		if (items.length > 1)
			obj = {type: "group", invert, op: "union", value: items};
		// only one item
		else if (items.length === 1){
			obj = items[0];
			if (invert)
				obj.invert = !obj.invert;
		}
		// empty set
		else obj = {type: "empty", invert, op: "union"};
		return obj;
	},
	// generator for items in a group, with explicit set operations
	seqSetOps: async function* (ast){
		const c = ast.children;
		let op = "union"; // first set op is union, rest are explicit
		for (const ci of c){
			switch (ci.type){
				case "root": {
					const obj = await parsers.root(ci);
					obj.op = op;
					yield obj;
					op = "union";
				} break;
				case "setOp":
					op = setOpsReadable[ci.text];
					break;
			}
		}
	},
	// extract list of characters (for charRange/stringRange)
	_range_generic: async (ast) => {
		const c = ast.children;
		let range = [];
		let builder = "";
		for (const ci of c){
			switch (ci.type){
				case "rangeSep":
					range.push(builder);
					builder = "";
					break;
				case "char":
				case "char_str": {
					let ct = ci.text;
					// quoted
					if (ci.children.length)
						ct = await parsers.quoted(ci.children[0])
					builder += ct;
				} break;
			}
		}
		validate_range: if (builder){
			if (range.length && builder !== range[0]){
				// validate range
				const a = Array.from(range[0]).map(v => v.codePointAt(0));
				const b = Array.from(builder).map(v => v.codePointAt(0));
				// simplifies things, and its also part of the original spec
				if (ast.type === "charRange" && (a.length > 1 || b.length > 1))
					throw Error("More than one codepoint in character literal (\\x{...} or \\u{...}) is not allowed for character ranges");
				if (a.length < b.length)
					throw Error("Start length must be >= end length for string ranges");
				if (!a.length)
					throw Error("String ranges cannot be empty");
				// b specifies the suffix of a; convert to full string
				if (a.length > b.length){
					b.splice(0,0,a.slice(0,a.length-b.length));
					builder = String.fromCodePoint(...b);
					if (builder === range[0])
						break validate_range;
				}
				// start/end are normalized to same length, and are not equal;
				// all a's values must be <= b's
				for (let i=0; i<a.length; i++){
					if (a[i] > b[i])
						throw Error("Start characters must all be <= end characters for string ranges");
				}
			}
			range.push(builder);
		}
		return range;
	}
};

/** Parses a UnicodeSet string and transforms it into an abstract syntax tree (AST).
 * Every AST node is a plain object, each representing a set on its own. All nodes have keys:
 * - `type`: the node type; depending on the type, there could be additional keys
 * - `invert`: whether we should take the invert of the set
 * - `op`: set operation to use when combining with a previous item in the group
 * 
 * For individual types:
 * - `group`: `value` gives an ordered list of children sets (also AST nodes) to be combined
 * 	 via set operations
 * - `all`: represents all characters
 * - `char`: `value` gives a list of single characters
 * - `charRange`: `value` gives a list of tuples representing start/end characters
 * - `string`: `value` gives a list of strings
 * - `stringRange`: `value` gives a list of tuples representing start/end characters
 * - `property`: `group` gives a `Codepoints` object; use the async `get` method to retrieve a
 * 		`RangeGroup` for the set; `name` and `value` are also available, which give the original
 * 		unicode property name/value before lookup
 * - `empty`: no additional keys; this represents a possibly inverted empty set
 * 
 * @param {string} str input string to be parsed
 * @returns {Promise<object>} the parsed AST
 */
export async function parse(str){
	const ast = EBNF_AST.getAST(str, "root");
	// probably a bug in ebnf lib? you can enable debug:true mode to see more details
	if (!ast)
		throw Error("Invalid UnicodeSet string (no details available)");
	if (ast.errors?.length)
		throw ast.errors[0];
	return await parsers.root(ast);
}