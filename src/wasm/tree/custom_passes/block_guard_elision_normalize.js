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
 * Inverts a condition expression for the if-not guard.
 *
 * - Comparisons are complemented (lt_s → ge_s, eq → ne, etc.)
 * - eqz(x) unwraps to x (avoids double negation)
 * - Anything else gets wrapped in i32.eqz
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} module
 * @param {number} condPtr
 * @return {number}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionPass.invertCondition_ = function (binaryen, module, condPtr) {
  var /** @const {!BinaryenExpressionInfo} */ info = /** @type {!BinaryenExpressionInfo} */ (
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, condPtr)
    );
  var /** @const {!BinaryenI32Api} */ i32 = module.i32;
  if (binaryen.BinaryId === info.id) {
    var /** @const {number} */ op = /** @type {number} */ (info.op);
    var /** @const {number} */ L = /** @type {number} */ (info.left);
    var /** @const {number} */ R = /** @type {number} */ (info.right);
    if (binaryen.EqInt32 === op) return i32.ne(L, R);
    if (binaryen.NeInt32 === op) return i32.eq(L, R);
    if (binaryen.LtSInt32 === op) return i32.ge_s(L, R);
    if (binaryen.GeSInt32 === op) return i32.lt_s(L, R);
    if (binaryen.GtSInt32 === op) return i32.le_s(L, R);
    if (binaryen.LeSInt32 === op) return i32.gt_s(L, R);
    if (binaryen.LtUInt32 === op) return i32.ge_u(L, R);
    if (binaryen.GeUInt32 === op) return i32.lt_u(L, R);
    if (binaryen.GtUInt32 === op) return i32.le_u(L, R);
    if (binaryen.LeUInt32 === op) return i32.gt_u(L, R);
  }
  if (binaryen.UnaryId === info.id && /** @type {number} */ (info.op) === binaryen.EqZInt32) {
    return /** @type {number} */ (info.value);
  }
  return i32.eqz(condPtr);
};

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
  if (0 === blockName.indexOf('sw$') || 0 === blockName.indexOf('lb$') || 0 === blockName.indexOf('rs$')) {
    return null;
  }

  var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (expr.children);
  if (!children || children.length < 2) {
    return null;
  }

  // -----------------------------------------------------------------------
  // Check first child: must be a conditional br_if targeting this block.
  // -----------------------------------------------------------------------
  var /** @const {!BinaryenExpressionInfo} */ firstInfo = /** @type {!BinaryenExpressionInfo} */ (
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, children[0])
    );
  if (binaryen.BreakId !== firstInfo.id) {
    return null;
  }
  if (/** @type {?string} */ (firstInfo.name) !== blockName) {
    return null;
  }
  var /** @const {number} */ condPtr = /** @type {number} */ (firstInfo.condition || 0);
  if (!condPtr) {
    return null; // Unconditional break — not a guard.
  }
  if (/** @type {number} */ (firstInfo.value || 0) !== 0) {
    return null; // Valued break — not a simple guard.
  }

  // -----------------------------------------------------------------------
  // Check for remaining references to blockName in body and condition.
  // -----------------------------------------------------------------------
  var /** @const {function(!Binaryen, number, string): boolean} */ hasRefFn =
      Wasm2Lang.Wasm.Tree.CustomPasses.hasReference;
  var /** @type {boolean} */ hasRef = false;
  var /** @const {number} */ childCount = children.length;

  if (hasRefFn(binaryen, condPtr, blockName)) {
    hasRef = true;
  }
  if (!hasRef) {
    for (var /** @type {number} */ ri = 1; ri < childCount; ++ri) {
      if (hasRefFn(binaryen, children[ri], blockName)) {
        hasRef = true;
        break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Build the if(inverted_condition) { remaining_body }.
  // -----------------------------------------------------------------------
  var /** @const {number} */ invertedCond = Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionPass.invertCondition_(
      binaryen,
      module,
      condPtr
    );

  var /** @const {!Array<number>} */ remaining = /** @type {!Array<number>} */ ([].slice.call(children, 1));
  var /** @type {number} */ thenBody;
  if (1 === remaining.length) {
    thenBody = remaining[0];
  } else {
    thenBody = module.block(null, remaining, binaryen.none);
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

  if (hasRef) {
    return {
      decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
      expressionPointer: module.block(blockName, [ifExpr], binaryen.none)
    };
  }

  return {
    decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
    expressionPointer: ifExpr
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
