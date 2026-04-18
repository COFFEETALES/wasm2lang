'use strict';

/**
 * Pass: const-condition-folding  (phase: optimize)
 *
 * Folds expressions whose outcome is determined entirely by a constant
 * condition operand.  Each pattern rewrites the node to an equivalent
 * simpler form, letting later passes (block-guard-elision, loop-simpl,
 * redundant-block-removal, dce) collapse the surrounding scaffolding.
 *
 *   (i32.eqz (i32.const N))       → (i32.const (N === 0 ? 1 : 0))
 *   (i64.eqz (i64.const N))       → (i32.const (N === 0 ? 1 : 0))
 *   (br_if  $L (i32.const 0))     → (nop)
 *   (br_if  $L (i32.const N≠0))   → (br $L)
 *   (select a b (i32.const 0))    → b   (requires a side-effect-free)
 *   (select a b (i32.const N≠0))  → a   (requires b side-effect-free)
 *
 * Side-effect-free operands are limited to LocalGet / GlobalGet / Const —
 * the same whitelist Binaryen's own peepholer uses for select folding.
 *
 * Per-function metrics are stored in {@code funcMetadata.constConditionFolds}
 * keyed by fold category:
 *   - {@code eqzConst}   (i32/i64 eqz on a constant)
 *   - {@code brIfNever}  (br_if with always-false condition)
 *   - {@code brIfAlways} (br_if with always-true condition)
 *   - {@code selectFold} (select with constant condition)
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.CustomPasses.ConstConditionFoldingPass = function () {
  Wasm2Lang.Wasm.Tree.CustomPasses.initializePass(
    /** @type {!Wasm2Lang.Wasm.Tree.Pass} */ (this),
    'const-condition-folding',
    Wasm2Lang.Wasm.Tree.PassRunner.Phase.OPTIMIZE
  );
};

/**
 * Returns true when {@code exprPtr} refers to a side-effect-free expression
 * that is safe to drop entirely (LocalGet, GlobalGet, Const).
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} exprPtr
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.ConstConditionFoldingPass.prototype.isSideEffectFree_ = function (binaryen, exprPtr) {
  if (0 === exprPtr) return true;
  var /** @const {!BinaryenExpressionInfo} */ info = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, exprPtr);
  var /** @const {number} */ id = info.id;
  return binaryen.LocalGetId === id || binaryen.GlobalGetId === id || binaryen.ConstId === id;
};

/**
 * Returns 1 when the constant is zero, 0 when non-zero, -1 when the value
 * shape is unexpected (bail).  Handles i32 (Number), i64-as-bigint
 * (binaryen ≥129) and the legacy {@code {low, high}} pair.
 *
 * @private
 * @param {!BinaryenExpressionInfo} constInfo
 * @return {number}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.ConstConditionFoldingPass.prototype.isZeroConst_ = function (constInfo) {
  var /** @const {*} */ value = constInfo.value;
  if ('number' === typeof value) return 0 === value ? 1 : 0;
  if ('bigint' === typeof value) return '0' === String(value) ? 1 : 0;
  if ('object' === typeof value && value) {
    var /** @const {!Object} */ obj = /** @type {!Object} */ (value);
    return 0 === obj['low'] && 0 === obj['high'] ? 1 : 0;
  }
  return -1;
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.ConstConditionFoldingPass.prototype.enter_ = function (funcMetadata, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  // prettier-ignore
  var /** @const {!BinaryenExpressionInfo} */ expression =
    /** @type {!BinaryenExpressionInfo} */ (nodeCtx.expression);
  var /** @const {number} */ id = expression.id;
  // prettier-ignore
  var /** @const {!BinaryenModule} */ mod =
    /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
  var /** @const {string} */ REPLACE_NODE = Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE;

  // --- Pattern 1/2: (i32.eqz / i64.eqz const) ---
  if (binaryen.UnaryId === id) {
    var /** @const {number} */ unaryOp = /** @type {number} */ (expression.op);
    if (binaryen.EqZInt32 === unaryOp || binaryen.EqZInt64 === unaryOp) {
      var /** @const {number} */ unaryValuePtr = /** @type {number} */ (expression.value || 0);
      if (0 !== unaryValuePtr) {
        var /** @const {!BinaryenExpressionInfo} */ unaryOperandInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
            binaryen,
            unaryValuePtr
          );
        if (binaryen.ConstId === unaryOperandInfo.id) {
          var /** @const {number} */ folded = this.isZeroConst_(unaryOperandInfo);
          if (-1 !== folded) {
            this.bumpMetric_(funcMetadata, 'eqzConst');
            return {decisionAction: REPLACE_NODE, expressionPointer: mod.i32.const(folded)};
          }
        }
      }
    }
    return null;
  }

  // --- Pattern 3/4: (br_if $L (i32.const N)) ---
  if (binaryen.BreakId === id) {
    var /** @const {number} */ brCondPtr = /** @type {number} */ (expression.condition || 0);
    if (0 === brCondPtr) return null;
    var /** @const {!BinaryenExpressionInfo} */ brCondInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
        binaryen,
        brCondPtr
      );
    if (binaryen.ConstId !== brCondInfo.id) return null;
    var /** @const {number} */ brZero = this.isZeroConst_(brCondInfo);
    if (-1 === brZero) return null;

    if (1 === brZero) {
      // Condition is always false — the branch never fires.  When the br_if
      // carries a value, the fall-through value is the br_if's own result,
      // so replacing with nop would erase it; reuse the value pointer
      // directly in that case.  Valueless br_if collapses to nop.
      var /** @const {number} */ brValuePtr = /** @type {number} */ (expression.value || 0);
      this.bumpMetric_(funcMetadata, 'brIfNever');
      return {
        decisionAction: REPLACE_NODE,
        expressionPointer: 0 === brValuePtr ? mod.nop() : brValuePtr
      };
    }
    // Condition is always true — lower to an unconditional branch.
    this.bumpMetric_(funcMetadata, 'brIfAlways');
    return {
      decisionAction: REPLACE_NODE,
      expressionPointer: mod.break(
        /** @type {string} */ (expression.name || ''),
        0,
        /** @type {number} */ (expression.value || 0)
      )
    };
  }

  // --- Pattern 5/6: (select a b (i32.const N)) ---
  if (binaryen.SelectId === id) {
    var /** @const {number} */ selCondPtr = /** @type {number} */ (expression.condition || 0);
    if (0 === selCondPtr) return null;
    var /** @const {!BinaryenExpressionInfo} */ selCondInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
        binaryen,
        selCondPtr
      );
    if (binaryen.ConstId !== selCondInfo.id) return null;
    var /** @const {number} */ selZero = this.isZeroConst_(selCondInfo);
    if (-1 === selZero) return null;

    var /** @const {number} */ ifTruePtr = /** @type {number} */ (expression.ifTrue || 0);
    var /** @const {number} */ ifFalsePtr = /** @type {number} */ (expression.ifFalse || 0);
    var /** @const {number} */ keepPtr = 1 === selZero ? ifFalsePtr : ifTruePtr;
    var /** @const {number} */ dropPtr = 1 === selZero ? ifTruePtr : ifFalsePtr;

    if (!this.isSideEffectFree_(binaryen, dropPtr)) return null;
    if (0 === keepPtr) return null;

    this.bumpMetric_(funcMetadata, 'selectFold');
    return {decisionAction: REPLACE_NODE, expressionPointer: keepPtr};
  }

  return null;
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @param {string} key
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.ConstConditionFoldingPass.prototype.bumpMetric_ = function (funcMetadata, key) {
  var /** @type {!Object<string, number>} */ counts = /** @type {!Object<string, number>} */ (
      funcMetadata.constConditionFolds || Object.create(null)
    );
  counts[key] = (counts[key] || 0) + 1;
  funcMetadata.constConditionFolds = counts;
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.ConstConditionFoldingPass.prototype.createVisitor = function (funcMetadata) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.createEnterVisitor(this, this.enter_, funcMetadata);
};

// ---------------------------------------------------------------------------
// Postbuild analysis descriptor
// ---------------------------------------------------------------------------

Wasm2Lang.Wasm.Tree.CustomPasses.registerFieldAnalysisDescriptor(
  'constConditionFolding',
  /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
    return fm.constConditionFolds;
  }
);
