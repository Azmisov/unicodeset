import {parse} from "../src/parser.mjs";
import { lazyEvaluate } from "../src/eval.mjs";

const cases = [
	/*
	"[[]-[a-z]]",
	//*/
	"[[ ^ ]-[a-z]]",
	//*
	// "[a-\\u{a b c d e f}]", // invalid
	"[abcdefg]",
	"[abcdefga-z0-9{abc}{def}{x}-{y}{w}-{z}]",
	"[\\N{katakana letter mu}]",
	" [  \\N { k a t akana let  ter MU  }  ]  ",
	"[\\u { 1 a f f 0 }]",
	"[  \\x2D  ]",
	[
		"[:General_Category=Letter:]",
		"\\p{General_Category=Letter}",
		" \\p {  G e neral_Cate gor y =Le   tter }  ",
		"[:Letter:]"
	],
	[
		"[:Wh-ite-s pa_ce:]",
		"[:Whitespace=true:]",
	],
	"[:wspace=false:]",
	"[:^wspace=false:]",
	"[:^wspace≠false:]",
	[
		"[[:letter:] [:number:]]",
		"[[:letter:]+[:number:]]",
	],
	"[[:letter:] & [a-z]]",
	"[[:letter:] - [a-z]]",
	"[-[:letter:] - [a-z]]",
	
	[
		"[^a-z]",
		"[[\\x{0}-\\x{10FFFF}]-[X]]"
	],
	[
		"[[:letter:]-[a-z]-[\u0100-\u01FF]]",
		"[[[:letter:]-[a-z]]-[\u0100-\u01FF]]"
	],
	[
		"[[ace][bdf] - [abc][def]]",
		"[[[[ace] [bdf]] - [abc]] [def]]",
		"[[[abcdef] - [abc]] [def]]",
		"[[def] [def]]",
		"[def]"
	],
	[
		// "[[:Lu:]-A]", // illegal
		"[[:Lu:]-[A]]", // proper
	],
	"[a]",
	"[a-z]",
	"[^a-z]",
	"[[pat1][pat2]]",
	"[[pat1]&[pat2]]",
	"[[pat1]-[pat2]]",
	"[a {ab} {ac}]",
	"[x\\u{61 2019 62}y]",
	"[{ax}-{bz}]",
	"[:Lu:]",
	"[:L:]",
	"[{ab}-{ad}]",
	"[{ab}-{d}]",
	"[{ab}-{cd}]",
	[
		"[{👦🏻}-{👦🏿}]",
		"[{👦🏻}-{\\u{1F3FF}}]",
	]
	//*/
];

function* iterate_cases(){
	for (let top_case of cases){
		if (Array.isArray(top_case))
			for (let sub_case of top_case)
				yield sub_case;
		else yield top_case;
	}
}
for (const c of iterate_cases()){
	console.log(c);
	const ast = await parse(c);
	console.dir(ast, {depth:null});
	const lg = await lazyEvaluate(ast);
	console.dir(lg, {depth:null});
}