import regenerate from "regenerate";
import UnicodeSet from "../src/unicodeset.mjs";
import { RangeGroup, UnicodeNormType } from "range-group";
RangeGroup.default_type = UnicodeNormType;

test.each([
	// format: [pattern string, RangeGroup args]
	//*
	["[a-z]", ['a','z']],
	["[[abcd][cdef]]", ["a","f"]],
	["[[abcd]+[cdef]]", [["a","f"]]],
	["[[abcd]~[cdef]]", [["a","b"],["e","f"]]],
	["[[abcd]&[cdef]]", [["c","d"]]],
	["[[abcd]-[cdef]]", [["a","b"]]],
	["[[:ascii:]-[\x00-/]]", [["0","\x7F"]]],
	["[[:ascii:]~[\x00-/]]", [["0","\x7F"]]],
	["[[:ascii:]&[\x00-/]]", [["\x00","/"]]],
	["[[]-[0]]", []],
	["[[][0]]", ["0","0"]],
	["[[]&[0]]", []],
	["[[]~[0]]", ["0","0"]],
	["[[0]-[]]", ["0","0"]],
	["[[0][]]", ["0","0"]],
	["[[0]&[]]", []],
	["[[0]~[]]", ["0","0"]],
	["[[][]]", []],
	["[[]-[]]", []],
	["[[]~[]]", []],
	["[[]&[]]", []],
	["[-]", ["\x00","\u{10FFFF}"]],
	["[-\x00-Z]",["[","\u{10FFFF}"]],
	["[[a-z]-[a-d]-[e-f]]", ["g","z"]],
	["[[ace][bdf] - [abc][def]]", ["d","f"]],
	["[[[[ace] [bdf]] - [abc]] [def]]", ["d","f"]],
	["[[[abcdef] - [abc]] [def]]", ["d","f"]],
	["[{ax}-{bz}]", [["ax","az"],["bx","bz"]]],
	["[{abc}]", ["abc","abc"]],
	["[^{prefix\x00}-{prefix/}]", ["prefix0","prefix\u{10FFFF}"]],
	["[[:ascii:]]", ["\x00","\x7F"]],
	//*/
	["[[a-e]~[c-k]~[g-m]~[j-p]]",[["a","b"],["f","f"],["j","k"],["n","p"]]]
])("eval good %s", async (i, o) => {
	const g = await UnicodeSet(i);
	expect(g.isEqual(new RangeGroup(o))).toBe(true);
});

test.each([
	// format: [pattern string, error substring / regex]
	["[{aaa}-{zzz}]", "when converted to 1D would exceed"]
])("eval bad %s", async (i, msg) => {
	// expect.toThrow doesn't seem to work with async
	try {
		await UnicodeSet(i);
		// didn't throw?
		expect("no error was thrown").toBe("error to be thrown");
	} catch(err){
		expect(err.message).toMatch(msg);
	}
});

test("regenerate", async () => {
	const re = (await UnicodeSet("[[abcd] & [bcd]]"))
  		.addRegenerate(regenerate())
  		.toString();
	expect(re).toEqual("[b-d]");
});