/** Evaluates a parsed AST as a RangeGroup */
import { RangeGroup, StringRange, UnicodeNormType, UnicodeHelpers } from "range-group";

/** Configurable constants for group evaluation
 * @typedef {object} EvaluateOptions
 * @prop {number} rebuild_threshold Threshold for `RangeGroup.ranges.length` where union op is
 * 	faster than rebuilding
 * @prop {number} string_range_1d_max Maximum 1D ranges that we allow to be generated from a single
 *  multidimensional (ND) string range. This is used to guard against unintended, huge memory usage.
 *  The `StringRange.toRanges1d` method used enumerates all string range dimensions except the last,
 *  which could yield many ranges, dependeing on the length of the string.
 * @memberof UnicodeSet
 */

/** Options to configure group evaluation
 * @name UnicodeSet.options
 * @type {EvaluateOptions}
 */
const options = {
	// this is just a guess, not determined emperically
	rebuild_threshold: 3,
	string_range_1d_max: 12
};

/** A lazy group is a wrapper around `RangeGroup` of type `UnicodeNormType`. It implements some
 * batch operations and lazy evaluation to optimize evaluating an expression. Only when it is needed
 * will the value be converted to a `RangeGroup`
 */
class LazyGroup{
	/** Copying set operation names
	 * @private
	 */
	static copyOps = {
		union: "toUnioned",
		intersect: "toIntersected",
		difference: "toDifferenced",
		symmetricDifference: "toSymmetricDifferenced"
	};
	/** Create a new LazyGroup
	 * @param {Range[] | RangeGroup} ranges initial value for {@link #ranges}; can be a `RangeGroup`
	 *  (greedy) or list of ranges ({@link #lazy}); if a `RangeGroup`, it is considered
	 *  {@link #readonly} to start
	 */
	constructor(ranges){
		/** Ranges, possibly not converted to a group yet
		 * @type {Range[] | RangeGroup}
		 */
		this.ranges = ranges;
		/** Indicates value came from unicode property lookup, so shouldn't be modified
		 * @type {boolean}
		 */
		this.readonly = ranges instanceof RangeGroup;
		/** Whether ranges have been converted to RangeGroup already
		 * @type {boolean}
		 */
		this.lazy = !this.readonly;
	}
	/** Copy the values (shallow) from other to `this`
	 * @param {LazyGroup} other
	 */
	copy(other){
		this.ranges = other.ranges;
		this.readonly = other.readonly;
		this.lazy = other.lazy;
	}
	/** Get size of range group
	 * @returns {number}
	 */
	size(){
		// keep empty set lazy if possible
		if (this.isEmpty())
			return 0;
		return this.get().size();
	}
	/** Check if range group is empty
	 * @returns {boolean}
	 */
	isEmpty(){
		// assume each range's end >= start, so no empty ranges
		return this.lazy ? !this.ranges.length : this.ranges.isEmpty();
	}
	/** Greedily evaluate the `RangeGroup` and return it
	 * @param {boolean} writable whether we need the range group to be writable; will make
	 * 	a copy if necessary
	 * @returns {RangeGroup}
	 */
	get(writable=false){
		// eval if not already
		if (this.lazy){
			this.ranges = new RangeGroup(this.ranges, {type: UnicodeNormType, normalize: true});
			this.lazy = false;
		}
		if (writable && this.readonly){
			this.ranges = this.ranges.copy();
			this.readonly = false;
		}
		return this.ranges;
	}
	/** Compute complement/inverse of the group */
	complement(){
		this.readonly = false;
		// empty range is trivial
		if (this.isEmpty()){
			this.ranges = [{start:'\u{0}',end:'\u{10FFFF}'}];
			this.lazy = true;
			return;
		}
		const base = this.get();
		const len = base.ranges.length;
		// extract prefixes to do complement on strings
		const prefixes = [];
		for (let i=len-1; i>=0; --i){
			const str = base.ranges[i].start;
			const last_len = UnicodeHelpers.utf16Length(UnicodeHelpers.lastCodepoint(str));
			// string with a prefix
			if (last_len != str.length){
				const prefix = str.slice(0, -last_len);
				if (prefix !== prefixes.at(-1))
					prefixes.push(prefix);
			}				
			// all remaining are single codepoints
			else{
				prefixes.push("");
				break;
			}
		}
		// construct universal set
		const uranges = prefixes.map(v => {
			return {start: v+'\u{0}', end: v+'\u{10FFFF}'};
		});
		this.ranges = new RangeGroup(uranges, {type: UnicodeNormType});
		this.ranges.difference(base);
	}
	/** Perform binary set operation
	 * @param {string} op operation to perform; one of `union`, `difference`, `intersect`, or
	 * 	`symmetricDifference`
	 * @param {LazyGroup} other other operand of the operation
	 */
	binaryOp(op, other){
		/* optimization for empty set
			empty&b, a&empty = empty
			empty+b, a+empty = b/a
			empty~b, a~empty = b/a
			empty-b = empty
			a-empty = a
		*/
		const a_empty = this.isEmpty();
		const b_empty = other.isEmpty();
		if (a_empty || b_empty){
			if (a_empty !== b_empty){
				const c_empty = op === "intersect" || op === "difference" && a_empty;
				if (c_empty !== a_empty)
					this.copy(other);
			}
			return;
		}
		// optimization for lazy unions;
		lazy_union: if (op === "union"){
			const args = [this, other];
			for (let i=0; i<2; i++){
				const o = args[i];
				let r = o.ranges;
				// okay to discard the RangeGroup and make lazy again?
				if (!o.lazy){
					r = r.ranges;
					if (r.length >= options.rebuild_threshold)
						break lazy_union;
				}
				args[i] = r;
			}
			const [a,b] = args;
			// copy if it came from readonly RangeGroup
			if (this.readonly){
				this.readonly = false;
				a = Array.from(a);
			}
			a.push(...b);
			this.ranges = a;
			this.lazy = true;
			return;
		}
		// readonly needs to be copied
		if (this.readonly){
			this.readonly = false;
			op = LazyGroup.copyOps[op];
		}	
		this.ranges = this.get()[op](other.get());
	}
	/** Perform batch set operation; the operation will have left-to-right operator precedence
	 * @param {string} op operation to perform; one of `union`, `difference`, `intersect`, or
	 * 	`symmetricDifference`
	 * @param {LazyGroup[]} groups groups to operate on
	 * @returns {LazyGroup} output of operation; it is the same as `groups[0]`, modified in-place
	 */
	static batch(op, groups){
		/* Optimizations and set identities:
			a+b: can be combined lazily, making use of RangeGroup.normalize;
				won't work with inversion: !a+!b != !(a+b)
			union/intersect/symmetric diff are associative+commutative:
				union: can rearrange abitrarily to group lazy evals together
				intersect: evaluating smallest to largest could help, as intersect will stay small
					(possibly empty)
				symmetric diff: evaluating smallest to largest could help, since each individual
					op is equivalent to union(a,b) - intersect(a,b). If intersection is empty,
					its just a union, which is a fast splice
			(a-b)-c = a-(b+c): can do lazy eval of b+c
				doesn't work for symmetric difference though

			Some others like DeMorgan's laws, identities with complement, etc. They
			seem too complicated to detect to be worth it.
		*/
		// no need to perform op
		if (groups.length == 1)
			return groups[0];
		switch (op){
			case "difference": {
				const base = groups.shift();
				// merge indices 1+ w/ union
				const other = LazyGroup.batch("union", groups);
				base.binaryOp(op, other);
				return base;
			}
			case "union":
				// binaryOp is optimized for combining two lazy groups
				groups.sort((a,b) => b.lazy-a.lazy);
				break;
			case "intersect":
			case "symmetricDifference":
				// process smallest to largest
				groups.sort((a,b) => Math.sign(a.size() - b.size()));
				break;
		}
		const base = groups[0];
		for (let i=1; i<groups.length; i++)
			base.binaryOp(op, groups[i]);
		return base;
	}
}

/** Takes an AST as generated from {@link UnicodeSet.parse} and evaluates
 * it into a lazily evaluated group
 * @name UnicodeSet.lazyEvaluate
 * @function
 * @param {object} node AST node to evaluate
 * @returns {Promise<LazyGroup>}
 */
async function lazyEvaluate(node){
	let invert = node.invert;
	let group;
	switch (node.type){
		case "group": {
			// we evaluate in batch, each batch a contiguous list of sets w/ same binary op
			let operands = [];
			let op = null;
			function flush(){
				if (operands.length > 1)
					operands = [LazyGroup.batch(op, operands)];
			}
			for (const child of node.value){
				const cop = child.op;
				if (cop !== op){
					flush();
					op = cop;
				}				
				operands.push(await lazyEvaluate(child));
			}
			flush();
			group = operands[0];
		} break;
		case "property":
			group = await node.group.get();
			break;
		case "string":
		case "char":
			group = node.value.map(v => {
				return {start:v, end:v};
			});
			break;
		case "charRange":
			group = node.value.map(v => {
				return {start:v[0], end:v[1]};
			});
			break;
		case "stringRange": {
			// RangeGroup doesn't support multidimensional ranges, so we transform to marginal ones
			group = [];
			for (const [start,end] of node.value){
				const r = {start, end};
				if (StringRange.size(r, false) > options.string_range_1d_max)
					throw new Error(
						`The ND string range {${start}}-{${end}} when converted to `+
						`1D would exceed the maximum of ${options.string_range_1d_max} ranges`
					);
				group.push(...StringRange.toRanges1d(r));
			}
		} break;
		case "empty":
			group = [];
			break;
	}
	if (!(group instanceof LazyGroup))
		group = new LazyGroup(group);
	// simple double inverts will have been resolved during parsing already;
	// so can eval complement immediately without losing out
	if (invert)
		group.complement();
	return group;
}

/** Takes an AST as generated from {@link UnicodeSet.parse} and evaluates as a `RangeGroup`
 * @name UnicodeSet.evaluate
 * @function
 * @param {object} node AST node to evaluate
 * @returns {Promise<RangeGroup>}
 */
async function evaluate(node){
	return (await lazyEvaluate(node)).get(true);
}

export { LazyGroup, evaluate, lazyEvaluate, options };