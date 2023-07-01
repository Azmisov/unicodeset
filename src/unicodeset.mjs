import * as unidata from "./unidata/properties.mjs";
import * as properties from "./unidata/properties.mjs";
import * as characters from "./unidata/characters.mjs";
import { CharacterStream, Parser, parse } from "./parse.mjs";
import { LazyGroup, evaluate, lazyEvaluate, options } from "./eval.mjs";

/** This does not need to be called with `new`. Parses and evaluates a UnicodeSet string as a
 * `RangeGroup`. This is an async function as it will lazily load the unicode character name and
 * property data as it is needed.
 * @param {string} pattern pattern defining the unicode set
 * @returns {Promise<RangeGroup>}
 * @class
 */
async function UnicodeSet(pattern){
	// can invoke with new, but won't construct anything
	return evaluate(await parse(pattern));
}
UnicodeSet.parse = parse;
UnicodeSet.evaluate = evaluate;
UnicodeSet.lazyEvaluate = lazyEvaluate;
UnicodeSet.options = options;

const Codepoints = properties.Codepoints
export {
	UnicodeSet as default, LazyGroup, Codepoints, CharacterStream, Parser,
	unidata, properties, characters
};