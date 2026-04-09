'use strict';

/**
 * Pass: if-else-recovery  (phase: codegen-prep)
 *
 * Detects named blocks whose leading children are if-statements with
 * unconditional breaks to the block, and restructures them into proper
 * if/else chains.  This moves decision logic from backend emitters into
 * the normalization layer.
 *
 * Pattern:
 *   (block $B
 *     (if c1 (then A1 (br $B)))
 *     (if c2 (then A2 (br $B)))
 *     ...
 *     E_else)
 *
 * Becomes:
 *   (block [$B|null]
 *     (if c1 (then A1) (else (if c2 (then A2) (else E_else)))))
 *
 * The block label is removed when no remaining references to it exist
 * after stripping the terminal breaks.
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.CustomPasses.IfElseRecoveryPass = function () {
  Wasm2Lang.Wasm.Tree.CustomPasses.initializePass(
    /** @type {!Wasm2Lang.Wasm.Tree.Pass} */ (this),
    'if-else-recovery',
    Wasm2Lang.Wasm.Tree.PassRunner.Phase.CODEGEN_PREP
  );
};

/**
 * @private
 * @typedef {{
 *   funcMetadata: !Wasm2Lang.Wasm.Tree.PassMetadata
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.IfElseRecoveryPass.State_;

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.IfElseRecoveryPass.State_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.IfElseRecoveryPass.prototype.leave_ = function (state, nodeCtx) {
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
  if (
    0 === blockName.indexOf('w2l_switch$') ||
    0 === blockName.indexOf('w2l_fused$') ||
    0 === blockName.indexOf('w2l_rootsw$')
  ) {
    return null;
  }

  var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (expr.children);
  if (!children || children.length < 2) {
    return null;
  }

  // -----------------------------------------------------------------------
  // Find where the if-chain starts.  Allow unconditional statements
  // before the chain as long as they don't reference blockName.
  // -----------------------------------------------------------------------
  var /** @const {number} */ childCount = children.length;
  var /** @const {function(!Binaryen, number, string): boolean} */ hasRefFn = Wasm2Lang.Wasm.Tree.CustomPasses.hasReference;
  var /** @type {number} */ chainStart = 0;

  for (var /** @type {number} */ si = 0; si < childCount; ++si) {
    var /** @const {!BinaryenExpressionInfo} */ preInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, children[si])
      );
    if (binaryen.IfId === preInfo.id) {
      chainStart = si;
      break;
    }
    // Pre-chain child must not reference blockName.
    if (hasRefFn(binaryen, children[si], blockName)) {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Scan consecutive qualifying ifs: each is an If with no else arm whose
  // then-arm is a Block ending with unconditional valueless (br $blockName).
  // -----------------------------------------------------------------------
  var /** @type {number} */ chainLength = 0;
  var /** @const {!Array<number>} */ conditions = [];
  var /** @const {!Array<!Array<number>>} */ strippedBodies = [];
  var /** @const {!Array<?string>} */ thenBlockNames = [];

  for (var /** @type {number} */ i = chainStart; i < childCount; ++i) {
    var /** @const {!BinaryenExpressionInfo} */ childInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, children[i])
      );
    if (binaryen.IfId !== childInfo.id) break;
    if (/** @type {number} */ (childInfo.ifFalse || 0) !== 0) break;

    var /** @const {number} */ thenPtr = /** @type {number} */ (childInfo.ifTrue || 0);
    if (!thenPtr) break;
    var /** @const {!BinaryenExpressionInfo} */ thenInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, thenPtr)
      );
    if (binaryen.BlockId !== thenInfo.id) break;

    var /** @const {!Array<number>|void} */ thenChildren = /** @type {!Array<number>|void} */ (thenInfo.children);
    if (!thenChildren || thenChildren.length < 2) break;

    var /** @const {number} */ thenLen = thenChildren.length;
    var /** @const {!BinaryenExpressionInfo} */ lastInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, thenChildren[thenLen - 1])
      );
    if (binaryen.BreakId !== lastInfo.id) break;
    if (/** @type {?string} */ (lastInfo.name) !== blockName) break;
    if (/** @type {number} */ (lastInfo.condition || 0) !== 0) break;
    if (/** @type {number} */ (lastInfo.value || 0) !== 0) break;

    conditions[chainLength] = /** @type {number} */ (childInfo.condition || 0);
    strippedBodies[chainLength] = /** @type {!Array<number>} */ ([].slice.call(thenChildren, 0, thenLen - 1));
    thenBlockNames[chainLength] = /** @type {?string} */ (thenInfo.name) || null;
    ++chainLength;
  }

  if (0 === chainLength) {
    return null;
  }

  // -----------------------------------------------------------------------
  // Check for intermediate references to blockName that require keeping
  // the label.  Scan conditions, stripped then-arms, and else body.
  // -----------------------------------------------------------------------
  var /** @type {boolean} */ hasRef = false;

  for (var /** @type {number} */ ri = 0; ri < chainLength && !hasRef; ++ri) {
    if (hasRefFn(binaryen, conditions[ri], blockName)) {
      hasRef = true;
      break;
    }
    var /** @const {!Array<number>} */ body = strippedBodies[ri];
    for (var /** @type {number} */ rj = 0, /** @const {number} */ bodyLen = body.length; rj < bodyLen; ++rj) {
      if (hasRefFn(binaryen, body[rj], blockName)) {
        hasRef = true;
        break;
      }
    }
  }
  if (!hasRef) {
    for (var /** @type {number} */ rk = chainStart + chainLength; rk < childCount; ++rk) {
      if (hasRefFn(binaryen, children[rk], blockName)) {
        hasRef = true;
        break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Build the if/else chain right-to-left.
  // -----------------------------------------------------------------------
  var /** @const {!Array<number>} */ remaining = /** @type {!Array<number>} */ (
      [].slice.call(children, chainStart + chainLength)
    );
  var /** @type {number} */ elseExpr = 0;
  if (remaining.length > 1) {
    elseExpr = module.block(null, remaining, binaryen.none);
  } else if (1 === remaining.length) {
    elseExpr = remaining[0];
  }

  for (var /** @type {number} */ qi = chainLength - 1; qi >= 0; --qi) {
    var /** @const {!Array<number>} */ stripped = strippedBodies[qi];
    var /** @const {number} */ cond = conditions[qi];
    var /** @const {number} */ thenBody = module.block(thenBlockNames[qi], stripped, binaryen.none);
    elseExpr = elseExpr
      ? /** @type {number} */ (module.if(cond, thenBody, elseExpr))
      : /** @type {number} */ (module.if(cond, thenBody));
  }

  // -----------------------------------------------------------------------
  // Store metadata and emit replacement.
  // -----------------------------------------------------------------------
  var /** @const {*} */ plansRef = state.funcMetadata.ifElseRecoveries;
  if (plansRef) {
    /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan>} */ (plansRef)[blockName] =
      /** @type {!Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan} */ ({
        chainLength: chainLength,
        labelRemoved: !hasRef
      });
  }

  // -----------------------------------------------------------------------
  // Assemble replacement: pre-chain children (if any) + if/else chain.
  // -----------------------------------------------------------------------
  var /** @const {!Array<number>} */ resultChildren =
      0 === chainStart ? [elseExpr] : /** @type {!Array<number>} */ ([].slice.call(children, 0, chainStart).concat([elseExpr]));

  return {
    decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
    expressionPointer: module.block(hasRef ? blockName : null, resultChildren, binaryen.none)
  };
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.IfElseRecoveryPass.prototype.createVisitor = function (funcMetadata) {
  funcMetadata.ifElseRecoveries = /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan>} */ (Object.create(null));
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.IfElseRecoveryPass.State_} */ state =
    /** @type {!Wasm2Lang.Wasm.Tree.CustomPasses.IfElseRecoveryPass.State_} */ ({
      funcMetadata: funcMetadata
    });
  return /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    leave: this.leave_.bind(this, state)
  });
};
