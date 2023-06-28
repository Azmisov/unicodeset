// Dataset: https://www.unicode.org/Public/UCD/latest/ucd/
import fsPromises from "fs/promises";
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Normalize unicode property names for string comparison, as described in
 * https://www.unicode.org/reports/tr44/#Matching_Rules
 * @param {string} str string to normalize
 * @returns {string} normalized string
 */
export function normalize(str){
	let nstr = "";
	let state = 0; // 1 = alphanumeric; 2 = pending hyphen
	for (let i=0; i<str.length; i++){
		let c = str.charAt(i);
		if (/[a-zA-Z0-9]/.test(c)){
			state = 1;
			nstr += c;
		}
		else{
			// non-medial hyphen okay
			if (state == 2)
				nstr += '-';
			// 2: strip whitespace/underscore
			if (!/[\s_]/.test(c)){
				// 1: remove medial hyphens (between two alphanumeric chars)
				if (c == '-' && state == 1){
					state = 2;
					continue;
				}
				nstr += c;
			}
			state = 0;
		}
	}
	// non-medial hyphen okay
	if (state == 2)
		nstr += '-';
	// 3: to lower case
	nstr = nstr.toLowerCase();
	// exception for "HANGUL JUNGSEONG O-E"
	if (nstr === "hanguljungseongoe" && /O-E/i.test(str))
		nstr = "hanguljungseongo-e"
	return nstr;
}

/** Read a UNIDATA text file
 * @yields lines from the file, each an array of normalized text columns
 */
export async function* reader(name){
	const lines = (await fsPromises.readFile(__dirname+"/"+name)).toString().split("\n");
	for (let line of lines){
		// strip comments
		line = line.replace(/#.*/g,"").trim();
		// split and normalize
		if (line)
			yield line.split(';').map(normalize);
	}
}