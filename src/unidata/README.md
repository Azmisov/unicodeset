UNIDATA file formats;
- the files were pulled from https://www.unicode.org/Public/UCD/latest/ucd/
- current latest is 15.0; you can grab newer version of the *.txt files and it should just work

ArabicShaping.txt:
	code point; name; Joining_Type; Joining_Group
BidiBrackets.txt:
	code point; Bidi_Paired_Bracket; Bidi_Paired_Bracket_Type
BidiMirroring.txt:
	(Bidi_Mirroring_Glyph of eachother)
	Bidi_Mirrored=Yes, except for some that are commented at bottom, which don't have glpyhs, but do mirror
	code_point_1; code_point_2
Blocks.txt:
	(default is No_Block, if not specified in this file)
	start..end; block name
CJKRadicals.txt:
	(kRSUnicode)
	radical number; radical code point; CJK unified ideagraph code point
CaseFolding.txt:
	(Case_Folding)
	(if not listed in file, value = C + map to itself)
	code point; status; mapping; # name
DerivedAge.txt:
	(Age)
...

So decided this was going to be a lot of work. I'm using node-unicode library to support most
properties now, but in the future we could go through and process some of these raw files if
we want to get additional property support.

I will still use the raw files to get property name/values and character names.

TODO:
https://util.unicode.org/UnicodeJsps/character.jsp?a=261F
https://github.com/unicode-org/unicodetools/tree/main
We could run offline and generate all properties to create an alternative node-unicode library that
is more comprehensive than that one. They recommend *not* using the data in that repo, but I feel
like it is going to be much less error prone than data you tried to parse/extract yourselves. The
data files are not very machine friendly to be honest.