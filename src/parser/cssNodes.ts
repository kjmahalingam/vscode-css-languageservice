/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/// <summary>
/// Nodes for the css 2.1 specification. See for reference:
/// http://www.w3.org/TR/CSS21/grammar.html#grammar
/// </summary>

export enum NodeType {
	Undefined,
	Identifier,
	Stylesheet,
	Ruleset,
	Selector,
	SimpleSelector,
	SelectorInterpolation,
	SelectorCombinator,
	SelectorCombinatorParent,
	SelectorCombinatorSibling,
	SelectorCombinatorAllSiblings,
	SelectorCombinatorShadowPiercingDescendant,
	Page,
	PageBoxMarginBox,
	ClassSelector,
	IdentifierSelector,
	ElementNameSelector,
	PseudoSelector,
	AttributeSelector,
	Declaration,
	Declarations,
	Property,
	Expression,
	BinaryExpression,
	Term,
	Operator,
	Value,
	StringLiteral,
	URILiteral,
	EscapedValue,
	Function,
	NumericValue,
	HexColorValue,
	MixinDeclaration,
	MixinReference,
	VariableName,
	VariableDeclaration,
	Prio,
	Interpolation,
	NestedProperties,
	ExtendsReference,
	SelectorPlaceholder,
	Debug,
	If,
	Else,
	For,
	Each,
	While,
	MixinContent,
	Media,
	Keyframe,
	FontFace,
	Import,
	Namespace,
	Invocation,
	FunctionDeclaration,
	ReturnStatement,
	MediaQuery,
	FunctionParameter,
	FunctionArgument,
	KeyframeSelector,
	ViewPort,
	Document,
	AtApplyRule,
	CustomPropertyDeclaration,
	CustomPropertySet,
	ListEntry,
	Supports,
	SupportsCondition,
	NamespacePrefix,
	GridLine,
	Plugin,
	UnknownAtRule,
}

export enum ReferenceType {
	Mixin,
	Rule,
	Variable,
	Function,
	Keyframe,
	Unknown
}



export function getNodeAtOffset(node: Node, offset: number): Node | null {

	let candidate: Node | null = null;
	if (!node || offset < node.offset || offset > node.end) {
		return null;
	}

	// Find the shortest node at the position
	node.accept((node) => {
		if (node.offset === -1 && node.length === -1) {
			return true;
		}
		if (node.offset <= offset && node.end >= offset) {
			if (!candidate) {
				candidate = node;
			} else if (node.length <= candidate.length) {
				candidate = node;
			}
			return true;
		}
		return false;
	});
	return candidate;
}

export function getNodePath(node: Node, offset: number): Node[] {

	let candidate = getNodeAtOffset(node, offset);
	let path: Node[] = [];

	while (candidate) {
		path.unshift(candidate);
		candidate = candidate.parent;
	}

	return path;
}

export function getParentDeclaration(node: Node): Declaration | null {
	let decl = <Declaration>node.findParent(NodeType.Declaration);
	if (decl && decl.getValue() && decl.getValue().encloses(node)) {
		return decl;
	}
	return null;
}

export interface ITextProvider {
	(offset: number, length: number): string;
}


export class Node {

	public parent: Node | null;

	public offset: number;
	public length: number;
	public get end() { return this.offset + this.length; }

	public options: { [name: string]: any; } | undefined;

	public textProvider: ITextProvider | undefined; // only set on the root node

	private children: Node[] | undefined;
	private issues: IMarker[] | undefined;

	private nodeType: NodeType | undefined;

	constructor(offset: number = -1, len: number = -1, nodeType?: NodeType) {
		this.parent = null;
		this.offset = offset;
		this.length = len;
		if (nodeType) {
			this.nodeType = nodeType;
		}
	}

	public set type(type: NodeType) {
		this.nodeType = type;
	}

	public get type(): NodeType {
		return this.nodeType || NodeType.Undefined;
	}

	public getTextProvider(): ITextProvider {
		let node: Node | null = this;
		while (node && !node.textProvider) {
			node = node.parent;
		}
		if (node) {
			return node.textProvider!;
		}
		return () => { return 'unknown'; };
	}

	public getText(): string {
		return this.getTextProvider()(this.offset, this.length);
	}

	public matches(str: string): boolean {
		return this.length === str.length && this.getTextProvider()(this.offset, this.length) === str;
	}

	public startsWith(str: string): boolean {
		return this.length >= str.length && this.getTextProvider()(this.offset, str.length) === str;
	}

	public endsWith(str: string): boolean {
		return this.length >= str.length && this.getTextProvider()(this.end - str.length, str.length) === str;
	}

	public accept(visitor: IVisitorFunction): void {
		if (visitor(this) && this.children) {
			for (let child of this.children) {
				child.accept(visitor);
			}
		}
	}

	public acceptVisitor(visitor: IVisitor): void {
		this.accept(visitor.visitNode.bind(visitor));
	}

	public adoptChild(node: Node, index: number = -1): Node {
		if (node.parent && node.parent.children) {
			let idx = node.parent.children.indexOf(node);
			if (idx >= 0) {
				node.parent.children.splice(idx, 1);
			}
		}
		node.parent = this;
		let children = this.children;
		if (!children) {
			children = this.children = [];
		}
		if (index !== -1) {
			children.splice(index, 0, node);
		} else {
			children.push(node);
		}
		return node;
	}

	public attachTo(parent: Node, index: number = -1): Node {
		if (parent) {
			parent.adoptChild(this, index);
		}
		return this;
	}

	public collectIssues(results: any[]): void {
		if (this.issues) {
			results.push.apply(results, this.issues);
		}
	}

	public addIssue(issue: IMarker): void {
		if (!this.issues) {
			this.issues = [];
		}
		this.issues.push(issue);
	}

	public hasIssue(rule: IRule): boolean {
		return Array.isArray(this.issues) && this.issues.some(i => i.getRule() === rule);
	}

	public isErroneous(recursive: boolean = false): boolean {
		if (this.issues && this.issues.length > 0) {
			return true;
		}
		return recursive && Array.isArray(this.children) && this.children.some(c => c.isErroneous(true));
	}

	public setNode(field: keyof this, node: Node, index: number = -1): boolean {
		if (node) {
			node.attachTo(this, index);
			(<any>this)[field] = node;
			return true;
		}
		return false;
	}

	public addChild(node: Node): boolean {
		if (node) {
			if (!this.children) {
				this.children = [];
			}
			node.attachTo(this);
			this.updateOffsetAndLength(node);
			return true;
		}
		return false;
	}

	private updateOffsetAndLength(node: Node): void {
		if (node.offset < this.offset || this.offset === -1) {
			this.offset = node.offset;
		}
		let nodeEnd = node.end;
		if ((nodeEnd > this.end) || this.length === -1) {
			this.length = nodeEnd - this.offset;
		}
	}

	public hasChildren(): boolean {
		return this.children && this.children.length > 0;
	}

	public getChildren(): Node[] {
		return this.children ? this.children.slice(0) : [];
	}

	public getChild(index: number): Node {
		if (this.children && index < this.children.length) {
			return this.children[index];
		}
		return null;
	}

	public addChildren(nodes: Node[]): void {
		for (let node of nodes) {
			this.addChild(node);
		}
	}

	public findFirstChildBeforeOffset(offset: number): Node {
		if (this.children) {
			let current: Node = null;
			for (let i = this.children.length - 1; i >= 0; i--) {
				// iterate until we find a child that has a start offset smaller than the input offset
				current = this.children[i];
				if (current.offset <= offset) {
					return current;
				}
			}
		}
		return null;
	}

	public findChildAtOffset(offset: number, goDeep: boolean): Node {
		let current: Node = this.findFirstChildBeforeOffset(offset);
		if (current && current.end >= offset) {
			if (goDeep) {
				return current.findChildAtOffset(offset, true) || current;
			}
			return current;
		}
		return null;
	}

	public encloses(candidate: Node): boolean {
		return this.offset <= candidate.offset && this.offset + this.length >= candidate.offset + candidate.length;
	}

	public getParent(): Node {
		let result = this.parent;
		while (result instanceof Nodelist) {
			result = result.parent;
		}
		return result;
	}

	public findParent(type: NodeType): Node {
		let result: Node = this;
		while (result && result.type !== type) {
			result = result.parent;
		}
		return result;
	}

	public setData(key: string, value: any): void {
		if (!this.options) {
			this.options = {};
		}
		this.options[key] = value;
	}

	public getData(key: string): any {
		if (!this.options || !this.options.hasOwnProperty(key)) {
			return null;
		}
		return this.options[key];
	}
}

export class Nodelist extends Node {
	private _nodeList: void; // workaround for https://github.com/Microsoft/TypeScript/issues/12083

	constructor(parent: Node, index: number = -1) {
		super(-1, -1);
		this.attachTo(parent, index);
		this.offset = -1;
		this.length = -1;
	}
}


export class Identifier extends Node {

	public referenceTypes: ReferenceType[];
	public isCustomProperty = false;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Identifier;
	}

	public containsInterpolation(): boolean {
		return this.hasChildren();
	}
}

export class Stylesheet extends Node {

	private name: string;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Stylesheet;
	}

	public setName(value: string): void {
		this.name = value;
	}

}

export class Declarations extends Node {
	private _declarations: void; // workaround for https://github.com/Microsoft/TypeScript/issues/18276

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Declarations;
	}
}

export class BodyDeclaration extends Node {

	public declarations: Declarations | undefined;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public getDeclarations(): Declarations | undefined {
		return this.declarations;
	}

	public setDeclarations(decls: Declarations): boolean {
		return this.setNode('declarations', decls);
	}

}

export class RuleSet extends BodyDeclaration {

	private selectors: Nodelist;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Ruleset;
	}

	public getSelectors(): Nodelist {
		if (!this.selectors) {
			this.selectors = new Nodelist(this);
		}
		return this.selectors;
	}

	public isNested(): boolean {
		return !!this.parent && this.parent.findParent(NodeType.Declarations) !== null;
	}
}

export class Selector extends Node {

	private _selector: void; // workaround for https://github.com/Microsoft/TypeScript/issues/12083

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Selector;
	}

}

export class SimpleSelector extends Node {

	private _simpleSelector: void; // workaround for https://github.com/Microsoft/TypeScript/issues/12083

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.SimpleSelector;
	}
}

export class AtApplyRule extends Node {

	public identifier: Identifier | undefined;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.AtApplyRule;
	}

	public setIdentifier(node: Identifier): boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Identifier | undefined {
		return this.identifier;
	}

	public getName(): string {
		return this.identifier ? this.identifier.getText() : '';
	}
}

export abstract class AbstractDeclaration extends Node {

	// positions for code assist
	public colonPosition: number | undefined;
	public semicolonPosition: number | undefined; // semicolon following the declaration

	constructor(offset: number, length: number) {
		super(offset, length);
	}
}

export class CustomPropertyDeclaration extends AbstractDeclaration {
	public property: Property;
	public value: Expression;
	public propertySet: CustomPropertySet;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.CustomPropertyDeclaration;
	}

	public setProperty(node: Property): boolean {
		return this.setNode('property', node);
	}

	public getProperty(): Property {
		return this.property;
	}

	public setValue(value: Expression): boolean {
		return this.setNode('value', value);
	}

	public getValue(): Expression {
		return this.value;
	}

	public setPropertySet(value: CustomPropertySet): boolean {
		return this.setNode('propertySet', value);
	}

	public getPropertySet(): CustomPropertySet {
		return this.propertySet;
	}
}

export class CustomPropertySet extends BodyDeclaration {
	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.CustomPropertySet;
	}
}

export class Declaration extends AbstractDeclaration {

	public property: Property;
	public value: Expression;
	public nestedProprties: NestedProperties;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Declaration;
	}

	public setProperty(node: Property): boolean {
		return this.setNode('property', node);
	}

	public getProperty(): Property {
		return this.property;
	}

	public getFullPropertyName(): string {
		let propertyName = this.property ? this.property.getName() : 'unknown';
		if (this.parent instanceof Declarations && this.parent.getParent() instanceof NestedProperties) {
			let parentDecl = this.parent.getParent().getParent();
			if (parentDecl instanceof Declaration) {
				return (<Declaration>parentDecl).getFullPropertyName() + propertyName;
			}
		}
		return propertyName;
	}

	public getNonPrefixedPropertyName(): string {
		let propertyName = this.getFullPropertyName();
		if (propertyName && propertyName.charAt(0) === '-') {
			let vendorPrefixEnd = propertyName.indexOf('-', 1);
			if (vendorPrefixEnd !== -1) {
				return propertyName.substring(vendorPrefixEnd + 1);
			}
		}
		return propertyName;
	}

	public setValue(value: Expression): boolean {
		return this.setNode('value', value);
	}

	public getValue(): Expression {
		return this.value;
	}

	public setNestedProperties(value: NestedProperties): boolean {
		return this.setNode('nestedProprties', value);
	}

	public getNestedProperties(): NestedProperties {
		return this.nestedProprties;
	}
}

export class Property extends Node {

	public identifier: Identifier;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Property;
	}

	public setIdentifier(value: Identifier): boolean {
		return this.setNode('identifier', value);
	}

	public getIdentifier(): Identifier {
		return this.identifier;
	}

	public getName(): string {
		return this.getText();
	}

	public isCustomProperty(): boolean {
		return this.identifier.isCustomProperty;
	}
}

export class Invocation extends Node {

	private arguments: Nodelist;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Invocation;
	}

	public getArguments(): Nodelist {
		if (!this.arguments) {
			this.arguments = new Nodelist(this);
		}
		return this.arguments;
	}
}

export class Function extends Invocation {

	public identifier: Identifier;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Function;
	}

	public setIdentifier(node: Identifier): boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Identifier {
		return this.identifier;
	}

	public getName(): string {
		return this.identifier ? this.identifier.getText() : '';
	}

}

export class FunctionParameter extends Node {

	public identifier: Node;
	public defaultValue: Node;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.FunctionParameter;
	}

	public setIdentifier(node: Node): boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Node {
		return this.identifier;
	}

	public getName(): string {
		return this.identifier ? this.identifier.getText() : '';
	}

	public setDefaultValue(node: Node): boolean {
		return this.setNode('defaultValue', node, 0);
	}

	public getDefaultValue(): Node {
		return this.defaultValue;
	}
}

export class FunctionArgument extends Node {

	public identifier: Node;
	public value: Node;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.FunctionArgument;
	}

	public setIdentifier(node: Node): boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Node {
		return this.identifier;
	}

	public getName(): string {
		return this.identifier ? this.identifier.getText() : '';
	}

	public setValue(node: Node): boolean {
		return this.setNode('value', node, 0);
	}

	public getValue(): Node {
		return this.value;
	}
}

export class IfStatement extends BodyDeclaration {
	public expression: Expression;
	public elseClause: BodyDeclaration;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.If;
	}

	public setExpression(node: Expression): boolean {
		return this.setNode('expression', node, 0);
	}

	public setElseClause(elseClause: BodyDeclaration): boolean {
		return this.setNode('elseClause', elseClause);
	}
}

export class ForStatement extends BodyDeclaration {
	public variable: Variable;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.For;
	}

	public setVariable(node: Variable): boolean {
		return this.setNode('variable', node, 0);
	}
}

export class EachStatement extends BodyDeclaration {
	public variables: Nodelist;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Each;
	}

	public getVariables(): Nodelist {
		if (!this.variables) {
			this.variables = new Nodelist(this);
		}
		return this.variables;
	}
}

export class WhileStatement extends BodyDeclaration {
	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.While;
	}
}

export class ElseStatement extends BodyDeclaration {
	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Else;
	}
}

export class FunctionDeclaration extends BodyDeclaration {
	public identifier: Identifier;
	public parameters: Nodelist;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.FunctionDeclaration;
	}

	public setIdentifier(node: Identifier): boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Identifier {
		return this.identifier;
	}

	public getName(): string {
		return this.identifier ? this.identifier.getText() : '';
	}

	public getParameters(): Nodelist {
		if (!this.parameters) {
			this.parameters = new Nodelist(this);
		}
		return this.parameters;
	}
}

export class ViewPort extends BodyDeclaration {
	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.ViewPort;
	}
}

export class FontFace extends BodyDeclaration {
	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.FontFace;
	}

}

export class NestedProperties extends BodyDeclaration {
	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.NestedProperties;
	}
}

export class Keyframe extends BodyDeclaration {

	public keyword: Node;
	public identifier: Identifier;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Keyframe;
	}

	public setKeyword(keyword: Node): boolean {
		return this.setNode('keyword', keyword, 0);
	}

	public getKeyword(): Node {
		return this.keyword;
	}

	public setIdentifier(node: Node): boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Node {
		return this.identifier;
	}

	public getName(): string {
		return this.identifier ? this.identifier.getText() : '';
	}
}

export class KeyframeSelector extends BodyDeclaration {
	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.KeyframeSelector;
	}
}

export class Import extends Node {

	private medialist: Node;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Import;
	}

	public setMedialist(node: Node): boolean {
		if (node) {
			node.attachTo(this);
			this.medialist = node;
			return true;
		}
		return false;
	}
}

export class Namespace extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Namespace;
	}

}

export class Media extends BodyDeclaration {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Media;
	}
}

export class Supports extends BodyDeclaration {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Supports;
	}
}


export class Document extends BodyDeclaration {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Document;
	}
}

export class Medialist extends Node {
	private mediums: Nodelist;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public getMediums(): Nodelist {
		if (!this.mediums) {
			this.mediums = new Nodelist(this);
		}
		return this.mediums;
	}
}

export class MediaQuery extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.MediaQuery;
	}
}

export class SupportsCondition extends Node {

	public lParent: number;
	public rParent: number;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.SupportsCondition;
	}
}


export class Page extends BodyDeclaration {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Page;
	}

}

export class PageBoxMarginBox extends BodyDeclaration {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.PageBoxMarginBox;
	}

}

export class Expression extends Node {

	private _expression: void; // workaround for https://github.com/Microsoft/TypeScript/issues/12083

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Expression;
	}
}

export class BinaryExpression extends Node {

	public left: Node;
	public right: Node;
	public operator: Node;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.BinaryExpression;
	}

	public setLeft(left: Node): boolean {
		return this.setNode('left', left);
	}

	public getLeft(): Node {
		return this.left;
	}

	public setRight(right: Node): boolean {
		return this.setNode('right', right);
	}

	public getRight(): Node {
		return this.right;
	}

	public setOperator(value: Node): boolean {
		return this.setNode('operator', value);
	}

	public getOperator(): Node {
		return this.operator;
	}
}

export class Term extends Node {

	public operator: Node;
	public expression: Node;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Term;
	}

	public setOperator(value: Node): boolean {
		return this.setNode('operator', value);
	}

	public getOperator(): Node {
		return this.operator;
	}

	public setExpression(value: Node): boolean {
		return this.setNode('expression', value);
	}

	public getExpression(): Node {
		return this.expression;
	}
}

export class AttributeSelector extends Node {

	public namespacePrefix: Node;
	public identifier: Identifier;
	public operator: Operator;
	public value: BinaryExpression;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.AttributeSelector;
	}

	public setNamespacePrefix(value: Node): boolean {
		return this.setNode('namespacePrefix', value);
	}

	public getNamespacePrefix(): Node {
		return this.namespacePrefix;
	}

	public setIdentifier(value: Identifier): boolean {
		return this.setNode('identifier', value);
	}

	public getIdentifier(): Identifier {
		return this.identifier;
	}

	public setOperator(operator: Operator): boolean {
		return this.setNode('operator', operator);
	}

	public getOperator(): Operator {
		return this.operator;
	}

	public setValue(value: BinaryExpression): boolean {
		return this.setNode('value', value);
	}

	public getValue(): BinaryExpression {
		return this.value;
	}
}

export class Operator extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Operator;
	}

}

export class HexColorValue extends Node {
	private _hexColorValue: void; // workaround for https://github.com/Microsoft/TypeScript/issues/18276

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.HexColorValue;
	}

}

export class NumericValue extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.NumericValue;
	}

	public getValue(): { value: string; unit: string } {
		let raw = this.getText();
		let unitIdx = 0,
			code: number,
			_dot = '.'.charCodeAt(0),
			_0 = '0'.charCodeAt(0),
			_9 = '9'.charCodeAt(0);

		for (let i = 0, len = raw.length; i < len; i++) {
			code = raw.charCodeAt(i);
			if (!(_0 <= code && code <= _9 || code === _dot)) {
				break;
			}
			unitIdx += 1;
		}
		return {
			value: raw.substring(0, unitIdx),
			unit: unitIdx < raw.length ? raw.substring(unitIdx) : undefined
		};
	}
}

export class VariableDeclaration extends AbstractDeclaration {

	private variable: Variable;
	private value: Node;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.VariableDeclaration;
	}

	public setVariable(node: Variable): boolean {
		if (node) {
			node.attachTo(this);
			this.variable = node;
			return true;
		}
		return false;
	}

	public getVariable(): Variable {
		return this.variable;
	}

	public getName(): string {
		return this.variable ? this.variable.getName() : '';
	}

	public setValue(node: Node): boolean {
		if (node) {
			node.attachTo(this);
			this.value = node;
			return true;
		}
		return false;
	}

	public getValue(): Node {
		return this.value;
	}
}

export class Interpolation extends Node {

	private _interpolations: void; // workaround for https://github.com/Microsoft/TypeScript/issues/18276

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Interpolation;
	}
}

export class Variable extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.VariableName;
	}

	public getName(): string {
		return this.getText();
	}

}

export class ExtendsReference extends Node {
	private selectors: Nodelist;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.ExtendsReference;
	}

	public getSelectors(): Nodelist {
		if (!this.selectors) {
			this.selectors = new Nodelist(this);
		}
		return this.selectors;
	}
}


export class MixinReference extends Node {
	public namespaces: Nodelist;
	public identifier: Identifier;
	private arguments: Nodelist;
	public content: BodyDeclaration;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.MixinReference;
	}

	public getNamespaces(): Nodelist {
		if (!this.namespaces) {
			this.namespaces = new Nodelist(this);
		}
		return this.namespaces;
	}

	public setIdentifier(node: Identifier): boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Identifier {
		return this.identifier;
	}

	public getName(): string {
		return this.identifier ? this.identifier.getText() : '';
	}

	public getArguments(): Nodelist {
		if (!this.arguments) {
			this.arguments = new Nodelist(this);
		}
		return this.arguments;
	}

	public setContent(node: BodyDeclaration): boolean {
		return this.setNode('content', node);
	}

	public getContent(): BodyDeclaration {
		return this.content;
	}
}

export class MixinDeclaration extends BodyDeclaration {

	public identifier: Identifier;
	private parameters: Nodelist;
	private guard: LessGuard;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.MixinDeclaration;
	}

	public setIdentifier(node: Identifier): boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Identifier {
		return this.identifier;
	}

	public getName(): string {
		return this.identifier ? this.identifier.getText() : '';
	}

	public getParameters(): Nodelist {
		if (!this.parameters) {
			this.parameters = new Nodelist(this);
		}
		return this.parameters;
	}

	public setGuard(node: LessGuard): boolean {
		if (node) {
			node.attachTo(this);
			this.guard = node;
		}
		return false;
	}
}

export class UnknownAtRule extends BodyDeclaration {
	public atRuleName: string;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.UnknownAtRule;
	}

	public setAtRuleName(atRuleName: string) {
		this.atRuleName = atRuleName;
	}
	public getAtRuleName(atRuleName: string) {
		return this.atRuleName;
	}
}

export class ListEntry extends Node {

	public key?: Node;
	public value: Node;

	public get type(): NodeType {
		return NodeType.ListEntry;
	}

	public setKey(node: Node): boolean {
		return this.setNode('key', node, 0);
	}

	public setValue(node: Node): boolean {
		return this.setNode('value', node, 1);
	}
}

export class LessGuard extends Node {

	public isNegated: boolean;
	private conditions: Nodelist;

	public getConditions(): Nodelist {
		if (!this.conditions) {
			this.conditions = new Nodelist(this);
		}
		return this.conditions;
	}
}

export class GuardCondition extends Node {

	public variable: Node;
	public isEquals: boolean;
	public isGreater: boolean;
	public isEqualsGreater: boolean;
	public isLess: boolean;
	public isEqualsLess: boolean;

	public setVariable(node: Node): boolean {
		return this.setNode('variable', node);
	}
}

export interface IRule {
	id: string;
	message: string;
}


export enum Level {
	Ignore = 1,
	Warning = 2,
	Error = 4
}

export interface IMarker {
	getNode(): Node;
	getMessage(): string;
	getOffset(): number;
	getLength(): number;
	getRule(): IRule;
	getLevel(): Level;
}

export class Marker implements IMarker {

	private node: Node;
	private rule: IRule;
	private level: Level;
	private message: string;
	private offset: number;
	private length: number;

	constructor(node: Node, rule: IRule, level: Level, message?: string, offset: number = node.offset, length: number = node.length) {
		this.node = node;
		this.rule = rule;
		this.level = level;
		this.message = message || rule.message;
		this.offset = offset;
		this.length = length;
	}

	public getRule(): IRule {
		return this.rule;
	}

	public getLevel(): Level {
		return this.level;
	}

	public getOffset(): number {
		return this.offset;
	}

	public getLength(): number {
		return this.length;
	}

	public getNode(): Node {
		return this.node;
	}

	public getMessage(): string {
		return this.message;
	}
}

export interface IVisitor {
	visitNode: (node: Node) => boolean;
}

export interface IVisitorFunction {
	(node: Node): boolean;
}
/*
export class DefaultVisitor implements IVisitor {

	public visitNode(node:Node):boolean {
		switch (node.type) {
			case NodeType.Stylesheet:
				return this.visitStylesheet(<Stylesheet> node);
			case NodeType.FontFace:
				return this.visitFontFace(<FontFace> node);
			case NodeType.Ruleset:
				return this.visitRuleSet(<RuleSet> node);
			case NodeType.Selector:
				return this.visitSelector(<Selector> node);
			case NodeType.SimpleSelector:
				return this.visitSimpleSelector(<SimpleSelector> node);
			case NodeType.Declaration:
				return this.visitDeclaration(<Declaration> node);
			case NodeType.Function:
				return this.visitFunction(<Function> node);
			case NodeType.FunctionDeclaration:
				return this.visitFunctionDeclaration(<FunctionDeclaration> node);
			case NodeType.FunctionParameter:
				return this.visitFunctionParameter(<FunctionParameter> node);
			case NodeType.FunctionArgument:
				return this.visitFunctionArgument(<FunctionArgument> node);
			case NodeType.Term:
				return this.visitTerm(<Term> node);
			case NodeType.Declaration:
				return this.visitExpression(<Expression> node);
			case NodeType.NumericValue:
				return this.visitNumericValue(<NumericValue> node);
			case NodeType.Page:
				return this.visitPage(<Page> node);
			case NodeType.PageBoxMarginBox:
				return this.visitPageBoxMarginBox(<PageBoxMarginBox> node);
			case NodeType.Property:
				return this.visitProperty(<Property> node);
			case NodeType.NumericValue:
				return this.visitNodelist(<Nodelist> node);
			case NodeType.Import:
				return this.visitImport(<Import> node);
			case NodeType.Namespace:
				return this.visitNamespace(<Namespace> node);
			case NodeType.Keyframe:
				return this.visitKeyframe(<Keyframe> node);
			case NodeType.KeyframeSelector:
				return this.visitKeyframeSelector(<KeyframeSelector> node);
			case NodeType.MixinDeclaration:
				return this.visitMixinDeclaration(<MixinDeclaration> node);
			case NodeType.MixinReference:
				return this.visitMixinReference(<MixinReference> node);
			case NodeType.Variable:
				return this.visitVariable(<Variable> node);
			case NodeType.VariableDeclaration:
				return this.visitVariableDeclaration(<VariableDeclaration> node);
		}
		return this.visitUnknownNode(node);
	}

	public visitFontFace(node:FontFace):boolean {
		return true;
	}

	public visitKeyframe(node:Keyframe):boolean {
		return true;
	}

	public visitKeyframeSelector(node:KeyframeSelector):boolean {
		return true;
	}

	public visitStylesheet(node:Stylesheet):boolean {
		return true;
	}

	public visitProperty(Node:Property):boolean {
		return true;
	}

	public visitRuleSet(node:RuleSet):boolean {
		return true;
	}

	public visitSelector(node:Selector):boolean {
		return true;
	}

	public visitSimpleSelector(node:SimpleSelector):boolean {
		return true;
	}

	public visitDeclaration(node:Declaration):boolean {
		return true;
	}

	public visitFunction(node:Function):boolean {
		return true;
	}

	public visitFunctionDeclaration(node:FunctionDeclaration):boolean {
		return true;
	}

	public visitInvocation(node:Invocation):boolean {
		return true;
	}

	public visitTerm(node:Term):boolean {
		return true;
	}

	public visitImport(node:Import):boolean {
		return true;
	}

	public visitNamespace(node:Namespace):boolean {
		return true;
	}

	public visitExpression(node:Expression):boolean {
		return true;
	}

	public visitNumericValue(node:NumericValue):boolean {
		return true;
	}

	public visitPage(node:Page):boolean {
		return true;
	}

	public visitPageBoxMarginBox(node:PageBoxMarginBox):boolean {
		return true;
	}

	public visitNodelist(node:Nodelist):boolean {
		return true;
	}

	public visitVariableDeclaration(node:VariableDeclaration):boolean {
		return true;
	}

	public visitVariable(node:Variable):boolean {
		return true;
	}

	public visitMixinDeclaration(node:MixinDeclaration):boolean {
		return true;
	}

	public visitMixinReference(node:MixinReference):boolean {
		return true;
	}

	public visitUnknownNode(node:Node):boolean {
		return true;
	}
}
*/
export class ParseErrorCollector implements IVisitor {

	static entries(node: Node): IMarker[] {
		let visitor = new ParseErrorCollector();
		node.acceptVisitor(visitor);
		return visitor.entries;
	}

	public entries: IMarker[];

	constructor() {
		this.entries = [];
	}

	public visitNode(node: Node): boolean {

		if (node.isErroneous()) {
			node.collectIssues(this.entries);
		}
		return true;
	}
}

