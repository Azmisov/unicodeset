/** Holds data for unicode character names and aliases. Most of the data comes from the raw unicode
 * source files, with supplementary names and aliases coming from the `node-unicode` library
 * @namespace characters
 */
import * as unidata from "./unidata.mjs";

let names = null; // {name -> character}
let name_conflicts = {}; // {name -> [character, ...]}

/** Add a character name to codepoint association to the index
 * @param {string} name name or alias for this character
 * @param {number} cp codepoint to associate with `name`
 * @memberof characters
 */
function associate(name, cp){
	const s = String.fromCodePoint(cp);
	if (name in name_conflicts)
		name_conflicts[name].push(s);
	else if (name in names){
		const s_other = names[name];
		// duplicate?
		if (s_other == s)
			return;
		name_conflicts[name] = [s_other, s];
	}
	else names[name] = s;
}

/** Load the character name/alias data
 * @memberof characters
 */
async function load(){
	if (names !== null)
		return;
	names = {};
	// @unicode package has some of the files pre-parsed
	const canonical_module = await import('@unicode/unicode-15.0.0/Names/index.js');
	for (const [cp,name] of canonical_module.default)
		associate(unidata.normalize(name), cp);
	const maps = await Promise.all([
		import('@unicode/unicode-15.0.0/Names/Abbreviation/index.js'),
		import('@unicode/unicode-15.0.0/Names/Alternate/index.js'),
		import('@unicode/unicode-15.0.0/Names/Control/index.js'),
		import('@unicode/unicode-15.0.0/Names/Correction/index.js'),
		import('@unicode/unicode-15.0.0/Names/Figment/index.js')
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
	// console.dir(name_conflicts, {depth: null});
	name_conflicts = null;
}

/** Get character for a given name, or null if there is no known character association. This
 * normalizes the name prior to lookup using {@link unidata#normalize}. You must call
 * {@link characters#load} before to load the dataset.
 * @param {string} name name whose character you want to lookup
 * @returns {string} character associated
 * @memberof characters
 */
function get(name){
	if (names === null)
		throw Error("Must call load first to load the character name/alias data");
	const norm = unidata.normalize(name);
	const mapped = names[norm]
	if (!mapped)
		throw Error("Unknown unicode character name/alias: "+name);
	return mapped;
}

export { associate, load, get };