import UnicodeSet from "../src/unicodeset.mjs";
import N from "./MockNode.mjs";

// good patterns
const good = [
	// format {i: 1+ input strings, o: expected mock AST node output}
	//*
	{
		i:"[abcdefga-z0-9{abc}{def}{x}-{y}{pw}-{z}]",
		o:N.G(N.C("abcdefg"),N.CR("az 09"),N.S("abc","def"),N.SR(["x","y"],["pw","pz"]))
	},
	{i:"[😀-😆]", o:N.CR("😀😆")},
	{i:"[[]-[a-z]]", o:N.G(N.E(), N.CR("az").D())},
	{i:"[[ ^ ]-[a-z]]", o:N.G(N.E().i(), N.CR("az").D())},
	{i:"[abcdefg]", o:N.C("abcdefg")},
	{
		i:["[\\N{katakana letter mu}]", " [  \\N { k a t akana let  ter MU  }  ]  "],
		o:N.C("ム")
	},
	{i:"[\\u { 1 a f f 0 }]", o:N.C("\x01\x0a\x0f\x0f\x00")},
	{i:"[  \\x2D  ]", o:N.C("\x2D")},
	{i:[
		"[:General_Category=Letter:]",
		"\\p{General_Category=Letter}",
		" \\p {  G e neral_Cate gor y =Le   tter }  ",
		"[:Letter:]",
		"[:L:]"
	], o:await N.P("gc","letter")},
	{i:[
		" [:Wh-ite-s pa_ce:]",
		" [:  Whitespace =  true :] ",
		" [:^wspace=false:]",
		"\\p{^wspace=false}",
		"\\p{wsp a ce = t ru e  }",
		"\\P{^wspace≠false}",
		"[-[^\\P{^wspace≠false}]]"
	], o:await N.P("wspace")},
	{i:[
		"[:wspace=false:]",
		"\\p{wspace=false}",
		" [: w space≠true:]",
		"\\p{wspace ≠ tru e}",
		" [: ^ wspace=true:]  ",
		" \\p  {^  wspace=true} ",
		" \\P { wspace=true}  ",		
		"[:^wspace≠false:]",
		"\\p{^wspace≠false}",
		"\\P{wspace≠false}",
		"\\P{^ws p a ce≠true}",
		"\\P{^wspace=fals e}",
		"[^\\P{^wspace≠false}]"
	], o:((await N.P("wspace"))).i()},
	{i:"[[:letter:] & [a-z]]", o:N.G(await N.P("letter"), N.CR("az").I())},
	{i: [
		"[[:letter:] [:number:]]",
		"[[:letter:]+[:number:]]",
	], o:N.G(await N.P("letter"), (await N.P("number")).U())},
	{i:"[[:letter:] - [a-z]]", o:N.G(await N.P("letter"), N.CR("az").D())},
	{i:"[-[:letter:] - [a-z]]", o:N.G(await N.P("letter"), N.CR("az").D()).i()},
	{i:"[^[a-z]]", o:N.CR("az").i()},
	{i:"[[xyz][abc]]", o:N.G(N.C("xyz"),N.C("abc"))},
	{i:"[[[:letter:] [xyz]][abc]]", o:N.G(await N.P("letter"), N.C("xyz"),N.C("abc"))},
	{i:"[-[[:letter:] [xyz]][abc]]", o:N.G(await N.P("letter"), N.C("xyz"),N.C("abc")).i()},
	{i:"[[-[:letter:][xyz]][abc]]", o:N.G(N.G(await N.P("letter"), N.C("xyz")).i(),N.C("abc"))},
	{i: [
		"[{👦🏻}-{👦🏿}]",
		"[{👦🏻}-{\\u{1F3FF}}]",
	], o:N.SR(["👦🏻","👦🏿"])},
	{i: "[\\u{  20 \n   20\t 20  20  }]", o:N.C("    ")},
	{i: "[\\r\\n\\v\\f\\a\\b\\t]", o:N.C("\r\n\v\f\x07\b\t")},
	{i: "[x\\u{61 2019 62}y]", o:N.C("xa’by")},
	{i:"[[a-z]&[abc]]", o:N.G(N.CR("az"), N.C("abc").I())},
	{i:"[[a-z] ~ [abc]]", o:N.G(N.CR("az"), N.C("abc").S())},
	{i:"[{ab}-{👦🏿}]", o:N.SR(["ab","👦🏿"])},
	{i:"[a]", o:N.C("a")},
	{i:"[a-z]", o:N.CR("az")},
	{i:"[^a-z]", o:N.CR("az").i()},
	{i:"[\\^a-z]", o:N.G(N.C("^"), N.CR("az"))},
	{
		i: "[\x09\x0a\x0b\x0c\x0d\x20\x85\u200E\u200F\u2028\u2029\u3000\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2008\u2009\u200A\u205F\xA0\u2007\u202F]",
		o:N.C("\u3000\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2008\u2009\u200A\u205F\xA0\u2007\u202F")
	},
	{i:"[{abc}-{}{xyz}-{xyz}x-xz-z]",o:N.G(N.S("abc","xyz"), N.C("xz"))},
	{i:"[x^[\\p{-[]}]",o:N.G(N.C("x^[p"), N.S("-[]"))}
	//*/
];

/** Iterate test cases above
 * @yields input output tuple
 */
function* iterate_cases(){
	for (const o of good){
		let i = o.i;
		if (!Array.isArray(i))
			i = [i];
		for (const input of i)
			yield [input, o.o];
	}
}

test.each(Array.from(iterate_cases()))("parse good %s", async (i, o) => {
	let a;
	try {
		a = await UnicodeSet.parse(i);
	} catch(err){
		// for debugging
		console.dir(err, {depth:Infinity});
		throw err;
	}
	expect(a).toMatchObject(o);
});

test.each([
	// format: [pattern, exception message substring or regex]
	//*
	["abc", "[ denoting set start"],
	["[]  x", "end-of-string"],
	["[abc", "] to end"],
	["[[abc]/[x-z]]", "set operator, set operand"],
	["\\m{}", "p or P"],
	["[\\u{}-z]", "exactly one"],
	["[a-\\u{a f}]", "exactly one"],
	["[a -\\x{}]", "exactly one"],
	["[^-]", "starting character or string"],
	["[{abc}-x", "end of string"],
	["[{x}-{xz}]", "length >= end length"],
	["[{x}--]", "end of string range"],
	["[{x", "} to end string"],
	["[x--]", "end of character range"],
	["[\\", "quoted character"],
	["[\\u{}-{abc}", "end of character range"],
	["[\\xF]", "1 hex digits to complete"],
	["[\\x]", "2 hex digits or a hex list"],
	["[\\uF]", "3 hex digits to complete"],
	["[\\u]", "4 hex digits or a hex list"],
	["[\\UFFFFFFFF]", "<= 10FFFF"],
	["[\\UF]", "7 hex digits to complete"],
	["[\\U{", "8 hex digits for"],
	["[\\u{FFFFFF}]", "<= 10FFFF"],
	["[\\u{  FFFFFF}]", "<= 10FFFF"],
	["[\\u{ buttcheek }]", "only whitespace and hex"],
	["[\\N {}]", "Unknown unicode character"],
	["[\\N {]}]", "Unknown unicode character"],
	["[\\N blah}]", "{ to start"],
	["[\\N {blah]", "} to end"],
	["[[:letter:]-A]", "[ denoting set start"],
	["[z-a]", "start to be <= end"],
	["[{xyz}-{a}]", "start character 'z' to be <= end character 'a'"],
	["[:buttcheek:]", "binary property name, or General"],
	["[:General_Category:]", "is not a binary property"],
	["[:blk:]", "value is required"],
	["[:buttcheek=foo:]", "Unknown/invalid unicode property name"],
	["[:bmg=x:]", "Unknown/invalid value"],
	["[:ea=a:]", "No RangeGroup"],
	["[:lu:[", "] to end the property"],
	["\\P letter}", "{ to enclose"],
	["\\p{ \\x{}  =letter}}", "property name"],
	["\\p{gc= \\u{}  }}", "property value"],
	["\\p{gc=l ", "remainder"],
	["[[a-z]&[abc]", "] to end composed"]
	//*/
	
])("parse bad %s", async (i, msg) => {
	// expect.toThrow doesn't seem to work with async
	try {
		await UnicodeSet.parse(i);
		// didn't throw?
		expect("no error was thrown").toBe("error to be thrown");
	} catch(err){
		expect(err.message).toMatch(msg);
	}
});

// TODO: automate eval tests