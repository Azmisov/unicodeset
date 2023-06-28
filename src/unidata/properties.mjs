import * as unidata from "./unidata.mjs";
import { RangeGroup, UnicodeNormType } from "range-group";
import unicode_index from "@unicode/unicode-15.0.0";

let loaded = false;
const names = {
	// name -> shorthand_name
	shorthand: {},
	// shorthand_name -> { value -> shorthand_value }
	values: {},
	// shorthand_name -> { value -> Codepoints }
	codepoints: {}
};

/** Handles lazy loading RangeGroup data */
class Codepoints{
	constructor(path){
		this.path = path;
		this.group = null;
	}
	/** Get range group for these codepoints
	 * @returns {RangeGroup}
	 */
	async get(){
		// lazy load
		if (this.group === null){
			const ranges = (await import(`@unicode/unicode-15.0.0/${this.path}/ranges.js`)).default;
			let r = this.group = new RangeGroup(ranges.map(r => {
				return {
					start: String.fromCodePoint(r.begin),
					// node-unicode uses exclusive end; can normalize directly
					end: String.fromCodePoint(r.end-1)
				};
			}), {type:UnicodeNormType});
			r.selfUnion();
		}
		return this.group;
	}
}

/** Lazily load the index of property names and values. The individual unicode codepoints for
 * each are lazily loaded as they are needed
 */
export async function load(){
	// already loaded?
	if (loaded)
		return;
	for await (const name of unidata.reader("PropertyAliases.txt")){
		const short = name[0];
		names.values[short] = {};
		for (const n of name)
			names.shorthand[n] = short;
	}
	// Note, a bunch of these actually have @missing annotations, which is problematic; seems manual
	// coding is the only way to handle those, perhaps requiring additional supplemental unidata
	// files; I'll add manual logic to defer to the @unicode library where appropriate
	for await (const value of unidata.reader("PropertyValueAliases.txt")){
		const name = value[0];
		const p = names.values[name];
		const short = value[1];
		for (let i=1; i<value.length; i++)
			p[value[i]] = short;
	}
	// Automatically map property names/values to those in @unicode lib
	const unknown = [];
	for (const l1 in unicode_index){
		// these are for character name aliases
		if (l1 === "Names")
			continue;
		const l2_lst = unicode_index[l1];
		// currently just empty for bidi mirroring glyph; we'll skip it
		if (!l2_lst.length)
			continue;
		const l1_norm = unidata.normalize(l1);
		// first is usually the property name, but could be a category of properties instead
		const l1_name = l1_norm in names.shorthand;
		if (l1_name)
			names.codepoints[l1_norm] = {};
		// property value or binary property
		for (const l2 of l2_lst){
			const l2_norm = unidata.normalize(l2);
			const path = l1+"/"+l2;
			let prop, val;
			// property value
			if (l1_name){
				prop = l1_norm;
				val = l2_norm;
			}
			// binary property
			else if (!(l2_norm in names.shorthand)){
				unknown.push(path);
				continue;
			}
			else{
				prop = l2_norm;
				val = 'y';
			}
			prop = names.shorthand[prop];
			let sval = names.values[prop][val];
			unknown: if (sval === undefined){
				// use @unicode's script extensions / case folding
				if (prop === "scx" || prop === "cf"){
					names.values[prop][val] = val;
					sval = val;
					break unknown;
				}
				unknown.push(path);
				continue;
			}
			val = sval;
			// good match; add codepoint lookup structure
			let cvals = names.codepoints[prop];
			if (cvals === undefined)
				cvals = names.codepoints[prop] = {};
			cvals[val] = new Codepoints(path);
			// console.log("match:", prop, val, path);
		}
	}
	// can log unknown array for debugging purposes
	loaded = true;
}

/** Fetch a range group given by the unicode property name-value pair. This will throw an error
 * if the name-value pair is unknown.
 * @param {string} name property name, or if `value` is ommitted, it can be the property value
 * 	for General Category or Script properties
 * @param {?string} value property value; this can be blank, if `name` is a property value for
 *  General Category or Script properties, as mentioned above; otherwise, it defaults to "true",
 *  which will be a valid value for binary properties, but error for others
 * @returns {Promise<{group: Codepoints, invert: boolean}>}
 */
export async function get(name, value){
	if (!loaded)
		throw Error("must call load first to load the property name/values data");
	let name_norm = unidata.normalize(name);
	let value_norm;
	validate: {
		// verify its a known name-value pair
		if (value){
			value_norm = unidata.normalize(value);
			name_norm = names.shorthand[name_norm];
			if (!name_norm)
				throw Error("Unknown/invalid unicode property name: "+name);
			value_norm = names.values[name_norm][value_norm];
			if (!name_norm)
				throw Error(`Unknown/invalid value for unicode property '${name}': ${value}`);
			break validate;
		}
		// resolve the missing value
		// from whitespace example given in spec, we always check for a binary category first
		const name_short = names.shorthand[name_norm];
		if (name_short){
			name_norm = name_short;
			value = "true";
			// verify its a binary property
			value_norm = names.values[name_norm][value];
			if (!value_norm)
				throw Error(`Property name '${name}' is not a binary property, so its property value is required`);
			break validate;
		}
		// if not a valid category, we allow a value for General_Category or Script properties
		else{
			const fallback = ["gc","sc"];
			for (const category of fallback){
				const value_short = names.values[category][name_norm];
				// found a match in this category!
				if (value_short){
					value = name;
					value_norm = value_short;
					name_norm = category;
					break validate;
				}
			}
			throw Error("Unknown/invalid unicode binary property name, or GeneralCategory/Script property value: "+name);
		}		
	}
	// binary properties can be inverted
	let invert = false;
	if (value_norm === 'n' && 'true' in names.values[name_norm]){
		invert = true;
		value_norm = 'y';
	}
	// name/value_norm are validated; check if we have a group for it
	const group = names.codepoints[name_norm]?.[value_norm];
	if (!group)
		throw Error(`No RangeGroup available for ${name}=${value}`);
	return {group, invert};
}