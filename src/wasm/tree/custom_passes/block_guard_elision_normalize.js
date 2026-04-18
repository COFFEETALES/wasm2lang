'use strict';

/**
 * Pass: block-guard-elision  (phase: codegen-prep)
 *
 * Detects named blocks whose first child is a conditional break (br_if)
 * targeting the block itself, and restructures into an if-not guard.
 *
 * Pattern:
 *   (block $B
 *     (br_if $B cond)
 *     body...)
 *
 * Becomes (when no remaining references to $B):
 *   (if (inverted cond) (then body_block))
 *
 * Becomes (when references to $B remain):
 *   (block $B (if (inverted cond) (then body_block)))
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionPass = function () {
  Wasm2Lang.Wasm.Tree.CustomPasses.initializePass(
    /** @type {!Wasm2Lang.Wasm.Tree.Pass} */ (this),
    'block-guard-elision',
    Wasm2Lang.Wasm.Tree.PassRunner.Phase.CODEGEN_PREP
  );
};

/**
 * @private
 * @typedef {{
 *   funcMetadata: !Wasm2Lang.Wasm.Tree.PassMetadata
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionPass.State_;

/**
 * Delegates to the shared invertCondition utility.
 * @private
 * @const {function(!Binaryen, !BinaryenModule, number): number}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionPass.invertCondition_ = Wasm2Lang.Wasm.Tree.CustomPasses.invertCondition;

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionPass.State_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionPass.prototype.leave_ = function (state, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  var /** @const {!BinaryenModule} */ module = /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
  var /** @const {!BinaryenExpressionInfo} */ expr = /** @type {!BinaryenExpressionInfo} */ (
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, nodeCtx.expressionPointer)
    );

  if (binaryen.BlockId !== expr.id) {
    return null;
  }

  var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);
  if (!blockName) {
    return null;
  }

  // Skip blocks already handled by other passes.
  if (Wasm2Lang.Wasm.Tree.CustomPasses.hasAnyPrefix(blockName, Wasm2Lang.Wasm.Tree.CustomPasses.FULL_BLOCK_SKIP_PREFIXES)) {
    return null;
  }

  var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (expr.children);
  if (!children || children.length < 2) {
    return null;
  }

  var /** @const {number} */ childCount = children.length;
  var /** @const {function(!Binaryen, number, string): boolean} */ hasRefFn = Wasm2Lang.Wasm.Tree.CustomPasses.hasReference;

  // -----------------------------------------------------------------------
  // Find the first direct-child br_if targeting this block.
  // -----------------------------------------------------------------------
  var /** @type {number} */ guardIdx = -1;
  for (var /** @type {number} */ gi = 0; gi < childCount; ++gi) {
    var /** @const {!BinaryenExpressionInfo} */ childInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, children[gi])
      );
    if (
      binaryen.BreakId === childInfo.id &&
      /** @type {?string} */ (childInfo.name) === blockName &&
      /** @type {number} */ (childInfo.condition || 0) !== 0 &&
      /** @type {number} */ (childInfo.value || 0) === 0
    ) {
      guardIdx = gi;
      break;
    }
  }
  if (-1 === guardIdx) {
    return null;
  }
  // Need at least one post-guard child.
  if (guardIdx >= childCount - 1) {
    return null;
  }

  var /** @const {!BinaryenExpressionInfo} */ guardInfo = /** @type {!BinaryenExpressionInfo} */ (
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, children[guardIdx])
    );
  var /** @const {number} */ condPtr = /** @type {number} */ (guardInfo.condition || 0);

  // -----------------------------------------------------------------------
  // Pre-guard children must not reference blockName (they execute
  // unconditionally; if they break to blockName the guard is not the
  // sole exit path).
  // -----------------------------------------------------------------------
  for (var /** @type {number} */ pi = 0; pi < guardIdx; ++pi) {
    if (hasRefFn(binaryen, children[pi], blockName)) {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Check for remaining references to blockName in condition and body.
  // -----------------------------------------------------------------------
  var /** @type {boolean} */ hasRef = false;
  if (hasRefFn(binaryen, condPtr, blockName)) {
    hasRef = true;
  }
  if (!hasRef) {
    for (var /** @type {number} */ ri = guardIdx + 1; ri < childCount; ++ri) {
      if (hasRefFn(binaryen, children[ri], blockName)) {
        hasRef = true;
        break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Build the if(inverted_condition) { post-guard body }.
  // -----------------------------------------------------------------------
  var /** @const {number} */ invertedCond = Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionPass.invertCondition_(
      binaryen,
      module,
      condPtr
    );

  var /** @const {!Array<number>} */ postGuard = /** @type {!Array<number>} */ ([].slice.call(children, guardIdx + 1));
  var /** @type {number} */ thenBody;
  if (1 === postGuard.length) {
    thenBody = postGuard[0];
  } else {
    thenBody = module.block(null, postGuard, binaryen.none);
  }

  var /** @const {number} */ ifExpr = /** @type {number} */ (module.if(invertedCond, thenBody));

  // -----------------------------------------------------------------------
  // Store metadata and emit replacement.
  // -----------------------------------------------------------------------
  var /** @const {*} */ plansRef = state.funcMetadata.blockGuardElisions;
  if (plansRef) {
    /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.BlockGuardElisionPlan>} */ (plansRef)[blockName] =
      /** @type {!Wasm2Lang.Wasm.Tree.BlockGuardElisionPlan} */ ({
        labelRemoved: !hasRef
      });
  }

  // -----------------------------------------------------------------------
  // Assemble the replacement.
  // -----------------------------------------------------------------------
  if (0 === guardIdx && !hasRef) {
    // No pre-guard children, no remaining refs: emit bare if.
    return {
      decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
      expressionPointer: ifExpr
    };
  }

  // Pre-guard children + if, wrapped in block (named if refs remain).
  var /** @const {!Array<number>} */ preGuard = /** @type {!Array<number>} */ ([].slice.call(children, 0, guardIdx));
  preGuard[preGuard.length] = ifExpr;
  return {
    decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
    expressionPointer: module.block(hasRef ? blockName : null, preGuard, binaryen.none)
  };
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionPass.prototype.createVisitor = function (funcMetadata) {
  funcMetadata.blockGuardElisions = /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.BlockGuardElisionPlan>} */ (
    Object.create(null)
  );
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionPass.State_} */ state =
    /** @type {!Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionPass.State_} */ ({
      funcMetadata: funcMetadata
    });
  return /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    leave: this.leave_.bind(this, state)
  });
};
