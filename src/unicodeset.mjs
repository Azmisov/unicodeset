import { RangeGroup, UnicodeHelpers } from "range-group";
import * as unidata from "./unidata/properties.mjs";
import * as properties from "./unidata/properties.mjs";
import * as characters from "./unidata/characters.mjs";
import { CharacterStream, Parser, parse } from "./parse.mjs";
import { LazyGroup, evaluate, lazyEvaluate, options } from "./eval.mjs";

/** This is added as a method on the `RangeGroup` prototype. This will add ranges from the
 * `RangeGroup` to a `regenerate` object, excluding string ranges. This can be used to generate a
 * RegExp matching the characters of the group. Note that the `regenerate` library is not included
 * as a dependency.
 * @name addRegenerate
 * @param {regenerate} obj a regenerate object to add the ranges to
 * @returns {regenerate} reference to `obj` for chaining
 */
RangeGroup.prototype.addRegenerate = function(obj){
	for (const r of this.ranges){
		// discard strings
		const s = r.start;
		if (s.length > 2 || s.length === 2 && UnicodeHelpers.utf16Length(s.codePointAt(0)) === 1)
			continue;
		obj.addRange(s, r.end);
	}
	return obj;
}

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