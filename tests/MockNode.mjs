import * as properties from "../src/unidata/properties.mjs";

// Helper for succinctly defining parser AST nodes
export default class N{
	constructor(type){
		this.type = type;
		this.invert = false;
		this.op = "union";
	}
	/** empty node */
	static E(){ return new N("empty"); }
	/** group node */
	static G(...nodes){
		const n = new N("group");
		n.value = nodes;
		return n;
	}
	/** char node */
	static C(chars){
		const n = new N("char");
		n.value = Array.from(chars);
		return n;
	}
	/** char range node
	 * @param {string} ranges separate ranges with space
	 * 	e.g. "se se se"
	 */
	static CR(ranges){
		const n = new N("charRange");
		n.value = ranges.split(" ").map(v => Array.from(v));
		return n;
	}
	/** string node */
	static S(...strings){
		const n = new N("string");
		n.value = strings;
		return n;
	}
	/** string range node
	 * @param ranges tuples of strings
	 */
	static SR(...ranges){
		const n = new N("stringRange");
		n.value = ranges;
		return n;
	}
	/** property node
	 * @param ranges tuples of strings
	 */
	static async P(name, value){
		const n = new N("property");
		await properties.load();
		// don't modify inverse automatically
		n.group = (await properties.get(name, value)).group;
		return n;
	}
	/** Invert the node */
	i(){
		this.invert = true;
		return this;
	}
	/** Set union op */
	U(){
		this.op = "union";
		return this;
	}
	/** Set intersect op */
	I(){
		this.op = "intersect";
		return this;
	}
	/** Set difference op */
	D(){
		this.op = "difference";
		return this;
	}
	/** Set symmetricDifference op */
	S(){
		this.op = "symmetricDifference";
		return this;
	}
}