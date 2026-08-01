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
 * Describes an if-else recovery detected by IfElseRecoveryPass.
 * chainLength is the number of consecutive if-then-break patterns recovered.
 * labelRemoved is true when the block label was stripped (no remaining refs).
 *
 * @typedef {{
 *   chainLength: number,
 *   labelRemoved: boolean
 * }}
 */
Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan;

/**
 * Describes a block-guard elision detected by BlockGuardElisionPass.
 * labelRemoved is true when the block label was stripped (no remaining refs).
 *
 * @typedef {{
 *   labelRemoved: boolean
 * }}
 */
Wasm2Lang.Wasm.Tree.BlockGuardElisionPlan;

/**
 * Semantic control outcome for one Binaryen expression. The summary records
 * whether normal completion is impossible, whether execution may leave the
 * function, and which enclosing labels may receive a branch.
 *
 * @typedef {{
 *   isTerminal: boolean,
 *   mayExitFunction: boolean,
 *   branchTargets: !Array<string>
 * }}
 */
Wasm2Lang.Wasm.Tree.ControlFlowSummary;

/** @typedef {!Object<string, !Wasm2Lang.Wasm.Tree.ControlFlowSummary>} */
Wasm2Lang.Wasm.Tree.FunctionControlFlowSummaryIndex;

/** @typedef {!Object<string, !Wasm2Lang.Wasm.Tree.FunctionControlFlowSummaryIndex>} */
Wasm2Lang.Wasm.Tree.ControlFlowSummaryIndex;

/**
 * Side channel attached to a fresh empty child-result array when codegen has
 * deliberately skipped a block or loop subtree.
 *
 * @typedef {{
 *   w2lSkippedControlSummary: (!Wasm2Lang.Wasm.Tree.ControlFlowSummary|undefined)
 * }}
 */
Wasm2Lang.Wasm.Tree.SkippedControlSummaryCarrier;

/**
 * @typedef {{
 *   passFuncName: (string|void),
 *   passFuncPtr: (number|void),
 *   passTreeModule: (!BinaryenModule|void),
 *   bodyReplaced: (boolean|void),
 *   localGetCounts: (!Object<string, number>|void),
 *   localInitOverrides: (!Object<string, *>|void),
 *   _localInitZeroFoldSet: (!Object<number, boolean>|void),
 *   loopPlans: (!Object<string, !Wasm2Lang.Wasm.Tree.LoopPlan>|void),
 *   fusedBlocks: (!Object<string, !Wasm2Lang.Wasm.Tree.BlockFusionPlan>|void),
 *   switchDispatchNames: (!Object<string, boolean>|void),
 *   rootSwitchNames: (!Object<string, boolean>|void),
 *   ifElseRecoveries: (!Object<string, !Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan>|void),
 *   blockGuardElisions: (!Object<string, !Wasm2Lang.Wasm.Tree.BlockGuardElisionPlan>|void),
 *   redundantBlockRemovals: (!Object<string, boolean>|void)
 * }}
 */
Wasm2Lang.Wasm.Tree.PassMetadata;

/**
 * @typedef {{
 *   edgePropertyName: string,
 *   edgeTraversalKind: number,
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
 *   ancestors: !Wasm2Lang.Wasm.Tree.ExpressionAncestorList,
 *   expression: !Wasm2Lang.Wasm.Tree.ExpressionInfo,
 *   expressionPointer: number
 * }}
 */
Wasm2Lang.Wasm.Tree.TraversalNodeContext;

/**
 * @typedef {{
 *   decisionAction: (string|void),
 *   expressionPointer: (*|void),
 *   decisionValue: (*|void)
 * }}
 */
Wasm2Lang.Wasm.Tree.TraversalDecisionInput;

/**
 * The child traversal results for one expression.  Each element is the raw
 * value walkInner returned for one child — typically either a code string, a
 * typed expression object ({@code {s: string, c: number}}), or an expression
 * pointer.
 * @typedef {!Array<*>}
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
 * The module is passed so a hook can reach the shared traversal kernel, which
 * needs a {@code BinaryenModule} for its context.  Without it an analysis hook
 * has no way to walk a subtree except by hand-rolling a recursion, which hard
 * rule #4 forbids.
 *
 * @typedef {function(!BinaryenFunctionInfo, !Wasm2Lang.Wasm.Tree.PassMetadata, !BinaryenModule): void}
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
