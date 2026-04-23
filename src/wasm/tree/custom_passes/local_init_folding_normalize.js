'use strict';

/**
 * Pass: local-init-folding  (phase: optimize)
 *
 * Detects leading local.set(const) assignments that can be folded into the
 * local's initial value in the var/let declaration.
 *
 * For each function, the pass scans the top-level children of the body block
 * in order.  A local.set with a const value is foldable if no local.get for
 * the same index appears in any earlier sibling (recursively scanned) and the
 * local has not been assigned a non-constant value by an earlier sibling.
 * Non-zero init values are recorded in funcMetadata.localInitOverrides so
 * backends can emit the non-zero initial value in the var/let declaration.
 *
 * The pass does NOT modify the WASM IR — the original local.set nodes remain
 * so the normalized binary is semantically identical to the original.  Code
 * emitters handle the folding by emitting the override value in the
 * declaration and treating the leading local.set as a redundant no-op.
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass = function () {
  Wasm2Lang.Wasm.Tree.CustomPasses.initializePass(
    /** @type {!Wasm2Lang.Wasm.Tree.Pass} */ (this),
    'local-init-folding',
    Wasm2Lang.Wasm.Tree.PassRunner.Phase.OPTIMIZE
  );
  this.onFunctionEnter = this.onFunctionEnter_;
};

/**
 * Recursively scans an expression tree for local.get, recording read indices.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} ptr
 * @param {!Object<number, boolean>} readLocals
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass.scanForLocalGets_ = function (binaryen, ptr, readLocals) {
  if (!ptr) {
    return;
  }
  // prettier-ignore
  var /** @const {!BinaryenExpressionInfo} */ info =
    /** @type {!BinaryenExpressionInfo} */ (Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, ptr));

  if (binaryen.LocalGetId === info.id) {
    readLocals[/** @type {number} */ (info.index || 0)] = true;
  }

  if (!Wasm2Lang.Wasm.Tree.NodeSchema.supportsExpressionId(info.id)) {
    return;
  }

  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.ChildEdgeList} */ children =
    Wasm2Lang.Wasm.Tree.NodeSchema.iterChildren(
      /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ (info)
    );

  for (var /** @type {number} */ i = 0, /** @const {number} */ len = children.length; i !== len; ++i) {
    Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass.scanForLocalGets_(
      binaryen,
      /** @type {number} */ (children[i][3]),
      readLocals
    );
  }
};

/**
 * Analyzes the function body and records foldable local.set(const) targets.
 *
 * @private
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass.prototype.onFunctionEnter_ = function (funcInfo, funcMetadata) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {number} */ bodyPtr = funcInfo.body;
  if (0 === bodyPtr) {
    return;
  }

  // prettier-ignore
  var /** @const {!BinaryenExpressionInfo} */ bodyInfo =
    /** @type {!BinaryenExpressionInfo} */ (Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen,bodyPtr));

  if (binaryen.BlockId !== bodyInfo.id) {
    return;
  }

  // After binaryen flatten, the body block may wrap an unnamed inner block
  // (optionally followed by a return).  Descend into the inner block to find
  // the actual top-level statements.
  var /** @type {!Array<number>} */ children = /** @type {!Array<number>} */ (bodyInfo.children || []);
  if (0 !== children.length) {
    // prettier-ignore
    var /** @const {!BinaryenExpressionInfo} */ firstChildInfo =
      /** @type {!BinaryenExpressionInfo} */ (Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen,children[0]));
    if (binaryen.BlockId === firstChildInfo.id && !firstChildInfo.name) {
      children = /** @type {!Array<number>} */ (firstChildInfo.children || []);
    }
  }
  if (0 === children.length) {
    return;
  }

  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(funcInfo.params);
  var /** @const {number} */ numParams = paramTypes.length;
  // prettier-ignore
  var /** @const {!Object<number, boolean>} */ readLocals =
    /** @type {!Object<number, boolean>} */ (Object.create(null));
  // prettier-ignore
  var /** @const {!Object<number, boolean>} */ setLocals =
    /** @type {!Object<number, boolean>} */ (Object.create(null));
  // prettier-ignore
  var /** @const {!Object<string, *>} */ initOverrides =
    /** @type {!Object<string, *>} */ (Object.create(null));
  var /** @type {boolean} */ hasOverrides = false;
  // Set of local indices whose foldable local.set(const 0) should be replaced
  // with nop by the visitor.  Keyed by local index (number).
  // prettier-ignore
  var /** @const {!Object<number, boolean>} */ zeroFoldSet =
    /** @type {!Object<number, boolean>} */ (Object.create(null));
  var /** @type {boolean} */ hasZeroFolds = false;
  var scanFn = Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass.scanForLocalGets_;

  for (var /** @type {number} */ ci = 0, /** @const {number} */ childCount = children.length; ci !== childCount; ++ci) {
    var /** @const {number} */ childPtr = children[ci];
    // prettier-ignore
    var /** @const {!BinaryenExpressionInfo} */ childInfo =
      /** @type {!BinaryenExpressionInfo} */ (Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen,childPtr));

    if (binaryen.LocalSetId === childInfo.id && !childInfo.isTee) {
      var /** @const {number} */ localIdx = /** @type {number} */ (childInfo.index || 0);
      if (localIdx >= numParams && !readLocals[localIdx] && !setLocals[localIdx]) {
        var /** @const {number} */ valuePtr = /** @type {number} */ (childInfo.value || 0);
        if (0 !== valuePtr) {
          // prettier-ignore
          var /** @const {!BinaryenExpressionInfo} */ valueInfo =
            /** @type {!BinaryenExpressionInfo} */ (Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen,valuePtr));
          if (binaryen.ConstId === valueInfo.id) {
            var /** @const {*} */ constVal = valueInfo.value;
            // i64 constants arrive as BigInt; strict !== across Number/BigInt
            // would misclassify 0n as non-zero, so compare per type.
            var /** @const {boolean} */ isZero =
                'bigint' === typeof constVal ? BigInt(0) === /** @type {*} */ (constVal) : 0 === constVal;
            if (!isZero) {
              hasOverrides = true;
              initOverrides[String(localIdx)] = constVal;
            } else {
              // Zero-value init: schedule for nop replacement by the visitor.
              // Replacing with nop is semantically safe (0 is the default).
              zeroFoldSet[localIdx] = true;
              hasZeroFolds = true;
            }
            setLocals[localIdx] = true;
            continue;
          }
        }
      }
      // Non-foldable local.set — prevent folding subsequent sets for this local.
      setLocals[localIdx] = true;
    }

    // Scan this child for local.get usage.
    scanFn(binaryen, childPtr, readLocals);
  }

  if (hasOverrides) {
    funcMetadata.localInitOverrides = initOverrides;
  }
  if (hasZeroFolds) {
    funcMetadata._localInitZeroFoldSet = zeroFoldSet;
  }
};

/**
 * @private
 * @typedef {{
 *   zeroFoldSet: !Object<number, boolean>
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass.VisitorState_;

/**
 * Visitor enter: replaces foldable local.set(const 0) with nop.
 * Zero is the WASM default for locals, so removing the explicit set is
 * semantically safe and puts the folding work in the normalization layer
 * rather than relying on the backend to skip instructions.
 *
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass.VisitorState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass.prototype.enter_ = function (state, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  if (binaryen.LocalSetId !== expr.id || !!expr.isTee) {
    return null;
  }
  var /** @const {number} */ idx = /** @type {number} */ (expr.index || 0);
  if (!state.zeroFoldSet[idx]) {
    return null;
  }
  // Consume: only replace the first occurrence for this index.
  delete state.zeroFoldSet[idx];
  return {
    decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
    expressionPointer: /** @type {!BinaryenModule} */ (nodeCtx.treeModule).nop()
  };
};

/**
 * Re-runs the analysis half of the pass against a canonicalised module so
 * that {@code localInitOverrides} reference local indices in their post
 * binary round-trip ordering.  Binaryen's binary writer groups locals by
 * type for compact LEB128 encoding, which renumbers {@code local.set}
 * indices and invalidates indices recorded prior to the round-trip.  The
 * analysis is idempotent — zero-valued folds were already replaced with
 * nops in the original run and survive the round-trip, so the rerun only
 * rebuilds the non-zero override map.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Wasm.Tree.PassRunResult} passRunResult
 * @param {!Binaryen} binaryen
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass.reanalyzeOverrides = function (wasmModule, passRunResult, binaryen) {
  var /** @const {!Array<!Wasm2Lang.Wasm.Tree.PassMetadata>} */ funcs = passRunResult.functions;
  var /** @const {!Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} */ byName = Object.create(null);
  for (var /** @type {number} */ i = 0, /** @const {number} */ n = funcs.length; i !== n; ++i) {
    var /** @const {!Wasm2Lang.Wasm.Tree.PassMetadata} */ entry = funcs[i];
    if (entry.passFuncName) {
      byName[/** @type {string} */ (entry.passFuncName)] = entry;
    }
  }
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass} */ pass =
      new Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass();
  var /** @const {number} */ funcCount = wasmModule.getNumFunctions();
  for (var /** @type {number} */ f = 0; f !== funcCount; ++f) {
    var /** @const {number} */ funcPtr = wasmModule.getFunctionByIndex(f);
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(funcPtr);
    if ('' !== funcInfo.base || 0 === funcInfo.body) continue;
    var /** @const {!Wasm2Lang.Wasm.Tree.PassMetadata|void} */ fm = byName[funcInfo.name];
    if (!fm) continue;
    fm.localInitOverrides = void 0;
    fm._localInitZeroFoldSet = void 0;
    pass.onFunctionEnter_(funcInfo, fm);
  }
};

/**
 * Creates a visitor that replaces foldable local.set(const 0) with nop.
 * When no zero-value folds were identified, returns an empty visitor.
 *
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass.prototype.createVisitor = function (funcMetadata) {
  var /** @const {!Object<number, boolean>|void} */ zeroSet = funcMetadata._localInitZeroFoldSet;
  if (!zeroSet) {
    return /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({});
  }
  // Clear transient field — not needed in metadata going forward.
  funcMetadata._localInitZeroFoldSet = void 0;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass.VisitorState_} */ state =
    /** @type {!Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass.VisitorState_} */ ({
      zeroFoldSet: /** @type {!Object<number, boolean>} */ (zeroSet)
    });
  return Wasm2Lang.Wasm.Tree.CustomPasses.createEnterVisitor(this, this.enter_, state);
};
