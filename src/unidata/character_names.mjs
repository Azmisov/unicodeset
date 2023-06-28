/** Those proivded by @unicode package don't appear to give all names, hence the additional parsing
 * of the unidata raw text file
 */
import * as unidata from "./unidata.mjs";

let names = null; // {name -> character}
let name_conflicts = {}; // {name -> [character, ...]}

/** Add name-codepoint association to our index */
function associate(name, cp){
	const s = String.fromCodePoint(cp);
	if (name in name_conflicts)
		name_conflicts[name].push(s);
	else if (name in names){
		const s_other = names[name];
		// probalby doesn't occur; but just in case
		if (s_other == s)
			return;
		name_conflicts[name] = [s_other, s];
	}
	else names[name] = s;
}

/** Load the character name/alias data */
export async function load(){
	if (names !== null)
		return;
	names = {};
	// @unicode package has some of the files pre-parsed
	const canonical_module = await import('@unicode/unicode-15.0.0/Names/index.js');
	for (const [cp,name] of canonical_module.default)
		associate(unidata.normalize(name), cp);
	const maps = await Promise.all([
		'@unicode/unicode-15.0.0/Names/Abbreviation/index.js',
		'@unicode/unicode-15.0.0/Names/Alternate/index.js',
		'@unicode/unicode-15.0.0/Names/Control/index.js',
		'@unicode/unicode-15.0.0/Names/Correction/index.js',
		'@unicode/unicode-15.0.0/Names/Figment/index.js'
	]);
	for (const map_module of maps){
		const map = map_module.default
		for (const cp_str in map){
			const cp = parseInt(cp_str);
			for (const name of map[cp_str])
				associate(unidata.normalize(name), cp);
		}
	}
	// UNIDATA unicode character names are not included in @unicode it seems
	// https://www.unicode.org/L2/L1999/UnicodeData.html
	for await (const cols of unidata.reader("UnicodeData.txt")){
		const name = cols[1];
		// only include alphanumeric
		if (/[^a-zA-Z0-9-\s]/.test(name)){
			// console.log("excluding name:", name);
			continue;
		}
		associate(name, parseInt(cols[0],16));
	}
	// can log for debugging purposes
	name_conflicts = null;
}

/** Get codepoint for a given name, or null if there is no known codepoint association. This
 * normalizes the name prior to lookup using {@link unidata#normalize}
 */
export function get(name){
	if (names === null)
		throw Error("must call load first to load the character name/alias data");
	name = unidata.normalize(name);
	return names[name] ?? null;
}