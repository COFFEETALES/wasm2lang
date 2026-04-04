'use strict';

/**
 * Pass: local-init-folding  (phase: optimize)
 *
 * Folds leading local.set(const) assignments into the local's initial value
 * when the local hasn't been read or non-const-set on any preceding code path.
 *
 * For each function, the pass scans the top-level children of the body block
 * in order.  A local.set with a const value is foldable if no local.get for
 * the same index appears in any earlier sibling (recursively scanned) and the
 * local has not been assigned a non-constant value by an earlier sibling.
 * Foldable local.set nodes are replaced with nop, and the init value is
 * recorded in funcMetadata.localInitOverrides so backends can emit the
 * non-zero initial value in the var/let declaration.
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
  var /** @const {!Object<string, boolean>} */ foldPtrs =
    /** @type {!Object<string, boolean>} */ (Object.create(null));
  // prettier-ignore
  var /** @const {!Object<string, number>} */ initOverrides =
    /** @type {!Object<string, number>} */ (Object.create(null));
  var /** @type {boolean} */ hasOverrides = false;
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
            var /** @const {number} */ constVal = /** @type {number} */ (valueInfo.value);
            // Only elide the local.set from the IR when the value equals the
            // WASM default (0).  Non-zero initializers are recorded as
            // overrides for the backend but the local.set is preserved in the
            // IR so that a serialize-deserialize round-trip (normalization in
            // one process, codegen in another) still produces correct code
            // even when the metadata is unavailable.
            if (0 === constVal) {
              foldPtrs[String(childPtr)] = true;
              continue;
            }
            hasOverrides = true;
            initOverrides[String(localIdx)] = constVal;
            // Mark the local as set so subsequent local.set for the same
            // index are not folded (the non-zero IR set must be preserved).
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
    funcMetadata.localInitFoldPtrs = foldPtrs;
    funcMetadata.localInitOverrides = initOverrides;
  }
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass.prototype.enter_ = function (funcMetadata, nodeCtx) {
  var /** @const {*} */ foldPtrs = funcMetadata.localInitFoldPtrs;
  if (!foldPtrs) {
    return null;
  }
  if (/** @type {!Object<string, boolean>} */ (foldPtrs)[String(nodeCtx.expressionPointer)]) {
    // prettier-ignore
    var /** @const {!BinaryenModule} */ mod =
      /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
    // Use an empty unnamed block instead of nop — binaryen 125's JS wrapper
    // does not support getExpressionInfo on NopId expressions.
    return {
      decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
      expressionPointer: mod.block(null, [], nodeCtx.binaryen.none)
    };
  }
  return null;
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass.prototype.createVisitor = function (funcMetadata) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.createEnterVisitor(this, this.enter_, funcMetadata);
};
