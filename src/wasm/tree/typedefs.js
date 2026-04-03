'use strict';

/**
 * Shared tree-level aliases to keep Closure typings consistent across the
 * schema, traversal kernel, and pass runner.
 */

/** @typedef {!BinaryenExpressionInfo} */
Wasm2Lang.Wasm.Tree.ExpressionInfo;

/**
 * Describes a loop optimization applied by the LoopSimplificationPass.
 * Stored in PassMetadata so backends can dispatch on structured data
 * instead of parsing label prefixes.
 *
 * @typedef {{
 *   simplifiedLoopKind: string,
 *   needsLabel: boolean,
 *   conditionPtr: number
 * }}
 */
Wasm2Lang.Wasm.Tree.LoopPlan;

/**
 * Describes a block-loop fusion detected by BlockLoopFusionPass.
 * fusionVariant is 'a' (block wraps loop) or 'b' (loop wraps block).
 *
 * @typedef {{
 *   fusionVariant: string
 * }}
 */
Wasm2Lang.Wasm.Tree.BlockFusionPlan;

/**
 * @typedef {{
 *   passFuncName: (string|void),
 *   passFuncPtr: (number|void),
 *   passTreeModule: (!BinaryenModule|void),
 *   bodyReplaced: (boolean|void),
 *   dropConstEliminations: (number|void),
 *   localGetCounts: (!Object<string, number>|void),
 *   localInitFoldPtrs: (!Object<string, boolean>|void),
 *   localInitOverrides: (!Object<string, number>|void),
 *   loopPlans: (!Object<string, !Wasm2Lang.Wasm.Tree.LoopPlan>|void),
 *   fusedBlocks: (!Object<string, !Wasm2Lang.Wasm.Tree.BlockFusionPlan>|void),
 *   switchDispatchNames: (!Object<string, boolean>|void),
 *   rootSwitchNames: (!Object<string, boolean>|void)
 * }}
 */
Wasm2Lang.Wasm.Tree.PassMetadata;

/**
 * @typedef {{
 *   edgePropertyName: string,
 *   edgeTraversalKind: !Wasm2Lang.Wasm.Tree.NodeSchema.EdgeKind,
 *   setter: (function(number, number, number): void|void)
 * }}
 */
Wasm2Lang.Wasm.Tree.EdgeSpec;

/**
 * @typedef {!Array<!Wasm2Lang.Wasm.Tree.EdgeSpec>}
 */
Wasm2Lang.Wasm.Tree.EdgeSpecList;

/**
 * @typedef {!Object<number, !Wasm2Lang.Wasm.Tree.EdgeSpecList>}
 */
Wasm2Lang.Wasm.Tree.ExpressionEdgeSpecMap;

/**
 * Child edge tuple: [key, index, kind, expressionPointer, setter].
 * The setter has signature (parentPtr, listIndex, childPtr) and is carried
 * from the EdgeSpec so the traversal kernel can apply replacements without
 * maintaining a parallel dispatch table.
 * @typedef {!Array<(string|number|function(number, number, number): void)>}
 */
Wasm2Lang.Wasm.Tree.ChildEdge;

/**
 * @typedef {!Array<!Wasm2Lang.Wasm.Tree.ChildEdge>}
 */
Wasm2Lang.Wasm.Tree.ChildEdgeList;

/**
 * @typedef {!Array<!Wasm2Lang.Wasm.Tree.ExpressionInfo>}
 */
Wasm2Lang.Wasm.Tree.ExpressionAncestorList;

/**
 * @typedef {{
 *   binaryen: !Binaryen,
 *   treeModule: !BinaryenModule,
 *   functionInfo: (?BinaryenFunctionInfo|void),
 *   treeMetadata: (!Wasm2Lang.Wasm.Tree.PassMetadata|void),
 *   ancestors: (!Wasm2Lang.Wasm.Tree.ExpressionAncestorList|void)
 * }}
 */
Wasm2Lang.Wasm.Tree.TraversalContext;

/**
 * @typedef {{
 *   binaryen: !Binaryen,
 *   treeModule: !BinaryenModule,
 *   functionInfo: ?BinaryenFunctionInfo,
 *   treeMetadata: !Wasm2Lang.Wasm.Tree.PassMetadata,
 *   parentExpression: ?Wasm2Lang.Wasm.Tree.ExpressionInfo,
 *   edge: ?Wasm2Lang.Wasm.Tree.ChildEdge,
 *   ancestors: !Wasm2Lang.Wasm.Tree.ExpressionAncestorList,
 *   expression: !Wasm2Lang.Wasm.Tree.ExpressionInfo,
 *   expressionPointer: number
 * }}
 */
Wasm2Lang.Wasm.Tree.TraversalNodeContext;

/**
 * @typedef {{
 *   decisionAction: string,
 *   expressionPointer: (*|void),
 *   decisionValue: (*|void)
 * }}
 */
Wasm2Lang.Wasm.Tree.TraversalDecision;

/**
 * @typedef {{
 *   decisionAction: (string|void),
 *   expressionPointer: (*|void),
 *   decisionValue: (*|void)
 * }}
 */
Wasm2Lang.Wasm.Tree.TraversalDecisionInput;

/**
 * @typedef {{
 *   child: !Wasm2Lang.Wasm.Tree.ChildEdge,
 *   childTraversalResult: *
 * }}
 */
Wasm2Lang.Wasm.Tree.TraversalChildResult;

/**
 * @typedef {!Array<!Wasm2Lang.Wasm.Tree.TraversalChildResult>}
 */
Wasm2Lang.Wasm.Tree.TraversalChildResultList;

/**
 * @typedef {function(!Wasm2Lang.Wasm.Tree.TraversalNodeContext): (?Wasm2Lang.Wasm.Tree.TraversalDecisionInput|void)}
 */
Wasm2Lang.Wasm.Tree.TraversalEnterCallback;

/**
 * @typedef {function(!Wasm2Lang.Wasm.Tree.TraversalNodeContext, !Wasm2Lang.Wasm.Tree.TraversalChildResultList=): (?Wasm2Lang.Wasm.Tree.TraversalDecisionInput|void)}
 */
Wasm2Lang.Wasm.Tree.TraversalLeaveCallback;

/**
 * @typedef {{
 *   enter: (!Wasm2Lang.Wasm.Tree.TraversalEnterCallback|void),
 *   leave: (!Wasm2Lang.Wasm.Tree.TraversalLeaveCallback|void)
 * }}
 */
Wasm2Lang.Wasm.Tree.TraversalVisitor;

/**
 * @typedef {function(?Wasm2Lang.Wasm.Tree.ExpressionInfo, ?Wasm2Lang.Wasm.Tree.ChildEdge, number): *}
 */
Wasm2Lang.Wasm.Tree.TraversalWalkInnerFn;

/**
 * @typedef {function(!BinaryenFunctionInfo, !Wasm2Lang.Wasm.Tree.PassMetadata): void}
 */
Wasm2Lang.Wasm.Tree.PassFunctionHook;

/**
 * @typedef {function(!BinaryenModule): void}
 */
Wasm2Lang.Wasm.Tree.PassModuleHook;

/**
 * @typedef {{
 *   passName: string,
 *   phase: string,
 *   createVisitor: function(!Wasm2Lang.Wasm.Tree.PassMetadata): !Wasm2Lang.Wasm.Tree.TraversalVisitor,
 *   validateModule: (!Wasm2Lang.Wasm.Tree.PassModuleHook|void),
 *   onFunctionEnter: (!Wasm2Lang.Wasm.Tree.PassFunctionHook|void),
 *   onFunctionLeave: (!Wasm2Lang.Wasm.Tree.PassFunctionHook|void)
 * }}
 */
Wasm2Lang.Wasm.Tree.Pass;

/**
 * @typedef {!Array<!Wasm2Lang.Wasm.Tree.Pass>}
 */
Wasm2Lang.Wasm.Tree.PassList;

/**
 * @typedef {{
 *   functionCount: number,
 *   processedCount: number,
 *   functions: !Array<!Wasm2Lang.Wasm.Tree.PassMetadata>
 * }}
 */
Wasm2Lang.Wasm.Tree.PassRunResult;
