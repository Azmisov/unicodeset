# unicodeset

TODO:
- bug: interpreting strings incorrectly
- ast -> range group
- add the other unicode props supported by node-unicode
- validate length
- test surrogates are working
- mention lazy loadin of unicode props
- mention only nodejs support
- additional usage/documentation
- publish

# UnicodeSet syntax

## Overview

A UnicodeSet is a string syntax to succinctly define a set of unicode characters (single codepoints)
and strings (multiple codepoints). It is somewhat similar to regular expressions. The formal
specification of a UnicodeSet can be [found
here](https://www.unicode.org/reports/tr35/tr35.html#Unicode_Sets), though I will aim to provide a
clearer description here. I have also made some small, backwards compatible enhancements for this
implementation. If you prefer, you can read the `unicode_set.ebnf` file to see the formal grammar
this implementation uses. The ICU has a C++/Java implementation, with further [usage information
documented here](https://unicode-org.github.io/icu/userguide/strings/unicodeset.html); while
helpful, their implementation will differ slightly from this one. Also useful to you may be the
[online UnicodeSet utility](https://util.unicode.org/UnicodeJsps/list-unicodeset.jsp).

There are three ways to define a **set** for a UnicodeSet:

1. [Enumerated](#1-enumerated): An enumerated list of characters/strings
2. [Named](#2-named): A set given by all the characters that match a unicode property
3. [Composed](#3-composed): A set composed of the union, difference, intersection, or symmetric
   difference of several other sets

A set is surrounded with brackets, e.g. `[a-zXYZ]`, `[:letter:]`, or `[[:letter:]-[abc]]`. The
exception is #2, which permits an alternative perl-like syntax, e.g. `\p{letter}`. Except where
mentioned below, whitespace is permitted anywhere in the UnicodeSet string to help with readability.

For types #1 and #2, you use character literals to specify the characters, strings, property names,
or property values inside the set. The following formats can be used:

| Format | Example | Description
| --- | --- | ---
| `\x{h…h}`<br> `\u{h…h}` | `"\\u{Af7}"` | Specifies a list of codepoints, each made of 1-6 hex (`[a-fA-F0-9]`) digits. Separate each individual codepoint with whitespace. Each codepoint cannot go beyond 10FFFF.<br><br>When used for character ranges (in an enumerated set), only one codepoint is allowed in the list.
| `\xhh` | `"\\xF2"` | Codepoint given by exactly 2 hex digits. *Whitespace is not permitted inside this literal.*
| `\uhhhh` | `"\\uAb8f"` | Codepoint given by exactly 4 hex digits. *Whitespace is not permitted inside this literal.*
| `\U00hhhhhh` | `"\\U0010F2Ac"` | Codepoint given by exactly 8 hex digits. Cannot go beyond 10FFFF. *Whitespace is not permitted inside this literal.*
| `\N{name}` | `"\\N{katakana letter mu}"` | A character with a specific name. Names may only include alphanumeric, underscore, hyphen, and space characters. The list of names used for this library has been extracted from the [raw unicode source](https://www.unicode.org/Public/UCD/latest/ucd/), excluding Unihan. The [node-unicode 15.0](https://github.com/node-unicode/unicode-15.0.0) library is used for name aliases. This may not be comprehensive. Following the [unicode matching rules](https://www.unicode.org/reports/tr44/#Matching_Rules), whitespace, underscores, medial hyphens, and casing are all insignificant for the character name.
| `\a` | `"\\a"` | U+0007 (BEL / ALERT)
| `\b` | `"\\b"` | U+0008 (BACKSPACE)
| `\t` | `"\\t"` | U+0009 (TAB / CHARACTER TABULATION)
| `\n` | `"\\n"` | U+000A (LINE FEED)
| `\v` | `"\\v"` | U+000B (LINE TABULATION)
| `\f` | `"\\f"` | U+000C (FORM FEED)
| `\r` | `"\\r"` | U+000D (CARRIAGE RETURN)
| `\\` | `"\\\\"` | U+005C (BACKSLASH / REVERSE SOLIDUS)
| `\character`<br>`character` | `"\\ "`<br>`"A"` | Treats the character literally. A number of characters are part of the UnicodeSet grammar, so need to be preceded by a backslash to be treated literally. Whitespace (`Pattern_White_space` unicode property) and backslash `\` are globally reserved. Other reserved characters are context dependent, so are listed in the [sections below](#Details). You may escape other characters besides these, but it is not necessary.<br><br>Note that UTF-32 codepoints are treated as the atomic character units. In JavaScript string characters are UTF-16, so a single UTF-32 codepoint could span two characters (the surrogate pairs).<br><br>In JavaScript, you may also use traditional escape codes, e.g. `"\xFF \uE6DB \251 \u{2fE04}"`. However, the reserved characters mentioned above will still need a preceding backslash; for example, with whitespace: `"\\\n"`.

For JavaScript string literals, you may consider using raw strings to avoid the double backslashes:
```js
String.raw`\xFF` // same as "\\xFF"
```

The three syntax types are described in more detail below

## #1 Enumerated

Characters can be listed individually: `[abcXYZ0123]`.

Use a hyphen to indicate a range of characters: `[a-z]`. The first character's codepoint
must be less than or equal to the second.

A string (multiple codepoints) is specified in curly braces: `[{str5}]`.

Use a hyphen to indicate a range of strings: `[{str0}-{str5}]`. If the first string is longer, it
indicates a shared prefix, e.g. `[{str0}-{5}]` is equivalent to `[{str0}-{str5}]`. However, the same
does not apply in reverse: the second string must not be longer than the first. Ignoring any shared
prefix, the corresponding codepoints from the first string must all be less than or equal to the
codepoints of the second string. You can think of a string range as a nested character range. For
example, the string range `[{ab}-{cd}]` is equivalent to `[{ab}{ac}{ad}{bb}{bc}{bd}{cb}{cc}{cd}]`.

*Limitation: UnicodeSets are greedily evaluated as a
[RangeGroup](https://azmisov.github.io/range-group/RangeGroup.html). As string ranges are
technically multi-dimensional ranges, they are converted to one-dimensional ones via enumeration
(see [toRanges1d](https://azmisov.github.io/range-group/StringRange.html#.toRanges1d)). For most
cases this should be fine, but in others the memory requirements may be prohibitive.*

The various definitions can be combined in a single set by concatenating them. The set will be the
union of each: `[abc A-Z {foo} {str0}-{str5}]`. Note that whitespace can be inserted anywhere for
readability.

You can *invert* a set by prefixing a hyphen `-` or caret `^`: `[^xyz]`, `[-A-Z0-9]`.

*Limitation: When inverting strings and string ranges, they are treated as one-dimensional. That
means we only invert the final codepoint in the string, leaving the remaining codepoints (the
prefix) unchanged.*

A set can be empty. The inverted empty set (`[-]` or similar) has special meaning, indicating a
range of all characters, equivalent to `[\u{0}-\u{10FFFF}]`; it doesn't include all strings.

**Reserved characters**:
- A hyphen `-` or caret `^` that appears as the first non-whitespace character
- Inside a string range, a closing curly brace `}`
- Outside a string range, a hyphen `-`, opening curly brace `}`, or closing bracket `]`

## #2 Named

Most, but not all unicode properties are supported. The list of property names and values has been
extracted from the [raw unicode source](https://www.unicode.org/Public/UCD/latest/ucd/). Property
values for some are not as easily extracted, so are not included. For the actual codepoints, this
library is using the data provided by the [node-unicode
15.0](https://github.com/node-unicode/unicode-15.0.0) library. This library has pretty comprehensive
support, but some of the less common like numeric properties are not included. An error will be
thrown if a unicode property is unknown, or there is no codepoint data available for it. Feel free
to submit a pull request with additional unicode property support if you find it lacking.

Following the [unicode matching rules](https://www.unicode.org/reports/tr44/#Matching_Rules),
whitespace, underscores, medial hyphens, and casing are all insignificant for the property names and
values.

There are two forms allowed:
1. Posix style: `[:general_category=letter:]`. *Whitespace is not allowed between the colon and bracket.*
2. Perl style: `\p{general_category=letter}`

For binary properties the value defaults to `true` if not given: `[:whitespace:]` is equivalent to
`[:whitespace=true:]`.

You may also omit the property name, which will default to `general_category` (first priority) or
`script` (second priority): `[:letter:]`, `[:latin:]`

In all other cases, both property name and value must be provided.

You can *invert* the set:
- You can prefix with a caret `^`: `[:^letter:]` or `\p{^letter}`
- You can use a not-equal character `≠`: `[:gc≠letter:]`.
- For Perl style, you can use a capital `P`: `\P{letter}`
- For binary properties, inverting is equivalent to negating the property value: `[:wspace=false:]`
  is equivalent to `[:^wspace:]`.

While not recommended, you can combine invert syntaxes for double negation (two inverts cancel
eachother): `[:^wspace≠false:]`.

**Reserved characters**:
- As the first character, a caret `^`.
- For property names, equal `=` and not-equal `≠`
- For Posix style, a colon `:`
- For Perl style, a closing curly brace `}`

These should not be a big concern, as they're not valid characters for a unicode property name
anyways.

## #3 Composed

Combine sets with a *set operator*: `[[a-z] & [a-f] - [bc] + [0-9]]`. Set operations
have left-to-right operator precedence. You can nest multiple composed sets to perform grouping
and control the operator precedence more explicitly.

Four set operations are allowed:
- Union, `+` operator; also the default if no operator character is used: `[[abc][cde]]` or
  `[[abc]+[cde]]` are equivalent to `[abcde]`
- Difference, `-` operator: `[[abc]-[cde]]` is equivalent to `[ab]`
- Intersection, `&` operator: `[[abc]&[cde]` is equivalent to `[c]`
- Symmetric difference, `~` operator: `[[abc]~[cde]]` is equivalent to `[abde]`

As with the [Enumerated](#1-enumerated) syntax, a composed set can be inverted by prefixing with
a hyphen `-` or caret `^`: `[^[abc] & [cde]]`.