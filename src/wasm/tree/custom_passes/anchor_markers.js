'use strict';

/**
 * Anchor-marker scheme for wasm2lang:codegen pass metadata.
 *
 * <p>Each piece of pass metadata that needs to refer to a specific Block or
 * Loop in the IR is keyed by an integer id.  The pass inserts a {@code call
 * $w2l_anchor (i32.const id)} expression as the first child of the marked
 * block (or the first child of the loop's body block).  Binaryen's optimizer
 * treats imported function calls as opaque side-effects, so the anchor
 * survives DCE, vacuum, simplify-locals, and binary round-trip — its position
 * within the parent expression is preserved exactly.
 *
 * <p>The id-to-payload map lives in the {@code w2l_codegen_meta} custom
 * section.  Looking up metadata for a node is therefore a two-step lookup:
 *
 * <ol>
 *   <li>scan the IR for {@code call $w2l_anchor (i32.const N)} markers,
 *       remembering which container holds each marker;</li>
 *   <li>look up entry {@code N} in the custom section payload to get the
 *       structured metadata.</li>
 * </ol>
 *
 * <p>Anchors are stripped from the IR before final code emission, and the
 * anchor function import is removed at the same time, so the emitted .wasm /
 * generated source carries no trace of the marker scheme.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers = {};

/**
 * The {@code (import "module" "field")} pair used for the anchor function.
 * @const {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers.IMPORT_MODULE = 'w2l';

/** @const {string} */
Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers.IMPORT_FIELD = 'anchor';

/**
 * Internal function name used by binaryen for the anchor import.
 * @const {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers.IMPORT_INTERNAL_NAME = 'w2l_anchor';

/**
 * Adds the anchor import to a module if it isn't already present.  Idempotent.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers.ensureImport = function (wasmModule, binaryen) {
  var /** @const */ AM = Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers;
  if (wasmModule.getFunction(AM.IMPORT_INTERNAL_NAME)) return;
  wasmModule.addFunctionImport(
    AM.IMPORT_INTERNAL_NAME,
    AM.IMPORT_MODULE,
    AM.IMPORT_FIELD,
    binaryen.createType([binaryen.i32]),
    binaryen.none
  );
};

/**
 * Builds a {@code call $w2l_anchor (i32.const id)} expression.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {number} id  Stable identifier the custom section will key on.
 * @return {number}  Expression pointer to the new call.
 */
Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers.makeAnchorCall = function (wasmModule, binaryen, id) {
  var /** @const */ AM = Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers;
  var /** @const {number} */ idConst = wasmModule.i32.const(id);
  return wasmModule.call(AM.IMPORT_INTERNAL_NAME, [idConst], binaryen.none);
};

/**
 * Inserts an anchor as the first child of {@code blockPtr}.  The block must
 * be a Block expression.  Returns the anchor expression pointer.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {number} blockPtr
 * @param {number} id
 * @return {number}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers.insertAtBlockStart = function (wasmModule, binaryen, blockPtr, id) {
  var /** @const */ AM = Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers;
  AM.ensureImport(wasmModule, binaryen);
  var /** @const {number} */ anchorPtr = AM.makeAnchorCall(wasmModule, binaryen, id);
  binaryen.Block.insertChildAt(blockPtr, 0, anchorPtr);
  return anchorPtr;
};

/**
 * Returns true when the expression is a {@code call $w2l_anchor (i32.const N)}.
 * Returns the id when truthy, or -1 when not an anchor.
 *
 * <p>The anchor's call target name shifts across binary round-trip — binaryen
 * renames imports to synthetic identifiers like {@code $fimport$0} when names
 * aren't carried in the name section.  The check resolves the target call to
 * its function info and matches on the {@code (module, base)} import pair
 * which IS preserved by the binary writer.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {number} exprPtr
 * @return {number}  Anchor id, or -1.
 */
Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers.readAnchorId = function (wasmModule, binaryen, exprPtr) {
  if (!exprPtr) return -1;
  var /** @const */ AM = Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers;
  var /** @const {!BinaryenExpressionInfo} */ info = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, exprPtr);
  if (binaryen.CallId !== info.id) return -1;
  var /** @const {?string} */ targetName = /** @type {?string} */ (info.target);
  if (!targetName) return -1;
  var /** @const {number} */ targetFuncPtr = wasmModule.getFunction(targetName);
  if (!targetFuncPtr) return -1;
  var /** @const {!BinaryenFunctionInfo} */ targetFi = binaryen.getFunctionInfo(targetFuncPtr);
  if (targetFi.module !== AM.IMPORT_MODULE || targetFi.base !== AM.IMPORT_FIELD) return -1;
  var /** @const {!Array<number>|void} */ operands = /** @type {!Array<number>|void} */ (info.operands);
  if (!operands || 1 !== operands.length) return -1;
  var /** @const {!BinaryenExpressionInfo} */ argInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      operands[0]
    );
  if (binaryen.ConstId !== argInfo.id) return -1;
  return /** @type {number} */ (argInfo.value);
};

/**
 * Walks every function body in the module via the shared
 * {@link Wasm2Lang.Wasm.Tree.TraversalKernel.forEachExpression}, calling
 * {@code visitor(funcPtr, funcInfo, parentPtr, anchorIndex, anchorId)} for
 * each anchor it finds.  The {@code parentPtr} is the Block (or function-body
 * slot) that directly holds the anchor; {@code anchorIndex} is the anchor's
 * index in that parent's children list.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {function(number, !BinaryenFunctionInfo, number, number, number): void} visitor
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers.forEachAnchor = function (wasmModule, binaryen, visitor) {
  var /** @const */ AM = Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers;
  var /** @const {number} */ funcCount = wasmModule.getNumFunctions();
  for (var /** @type {number} */ f = 0; f !== funcCount; ++f) {
    var /** @const {number} */ funcPtr = wasmModule.getFunctionByIndex(f);
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(funcPtr);
    if ('' !== funcInfo.base) continue;
    var /** @const {number} */ bodyPtr = funcInfo.body;
    if (!bodyPtr) continue;

    var /** @const {number} */ capturedFuncPtr = funcPtr;
    var /** @const {!BinaryenFunctionInfo} */ capturedFuncInfo = funcInfo;
    Wasm2Lang.Wasm.Tree.TraversalKernel.forEachExpression(
      binaryen,
      wasmModule,
      bodyPtr,
      /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
          @return {(string|undefined)} */ function (nodeCtx) {
        var /** @const {!BinaryenExpressionInfo} */ info = /** @type {!BinaryenExpressionInfo} */ (nodeCtx.expression);
        if (binaryen.BlockId !== info.id) return undefined;
        var /** @const {!Array<number>|void} */ ch = /** @type {!Array<number>|void} */ (info.children);
        if (!ch) return undefined;
        for (var /** @type {number} */ ci = 0, /** @const {number} */ cLen = ch.length; ci < cLen; ++ci) {
          var /** @const {number} */ anchorId = AM.readAnchorId(wasmModule, binaryen, ch[ci]);
          if (-1 !== anchorId) {
            visitor(capturedFuncPtr, capturedFuncInfo, /** @type {number} */ (nodeCtx.expressionPointer), ci, anchorId);
          }
        }
        return undefined;
      }
    );
  }
};

/**
 * Removes every anchor call from every function body, then removes the
 * anchor function import.  Call once after metadata has been rebuilt.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers.stripAll = function (wasmModule, binaryen) {
  var /** @const */ AM = Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers;
  // Collect first then mutate — modifying children mid-walk shifts indices.
  var /** @const {!Array<!Array<number>>} */ removals = [];

  AM.forEachAnchor(wasmModule, binaryen, function (funcPtr, funcInfo, parentPtr, anchorIndex, anchorId) {
    void funcPtr;
    void funcInfo;
    void anchorId;
    if (parentPtr) removals[removals.length] = [parentPtr, anchorIndex];
  });

  // Group removals per parent and apply in descending index order so earlier
  // removals don't invalidate later index references.
  var /** @const {!Object<string, !Array<number>>} */ byParent = /** @type {!Object<string, !Array<number>>} */ (
      Object.create(null)
    );
  for (var /** @type {number} */ ri = 0, /** @const {number} */ rLen = removals.length; ri < rLen; ++ri) {
    var /** @const {string} */ key = String(removals[ri][0]);
    if (!byParent[key]) byParent[key] = [];
    byParent[key][byParent[key].length] = removals[ri][1];
  }
  var /** @const {!Array<string>} */ parentKeys = Object.keys(byParent);
  for (var /** @type {number} */ pi = 0, /** @const {number} */ pLen = parentKeys.length; pi < pLen; ++pi) {
    var /** @const {!Array<number>} */ indexes = byParent[parentKeys[pi]];
    indexes.sort(function (a, b) {
      return b - a;
    });
    var /** @const {number} */ parentPtr = /** @type {number} */ (parseInt(parentKeys[pi], 10));
    for (var /** @type {number} */ ii = 0, /** @const {number} */ iLen = indexes.length; ii < iLen; ++ii) {
      binaryen.Block.removeChildAt(parentPtr, indexes[ii]);
    }
  }

  // Remove the import last (binaryen rejects function-table changes mid-walk
  // on some versions; safest after all body mutations are done).  The
  // import's internal name is renamed by the binary writer (e.g. to
  // {@code $fimport$0}) on round-trip, so resolve by {@code (module, base)}.
  var /** @const {number} */ funcCount = wasmModule.getNumFunctions();
  var /** @type {?string} */ importInternalName = null;
  for (var /** @type {number} */ ff = 0; ff !== funcCount; ++ff) {
    var /** @const {number} */ fp = wasmModule.getFunctionByIndex(ff);
    var /** @const {!BinaryenFunctionInfo} */ fi = binaryen.getFunctionInfo(fp);
    if (fi.module === AM.IMPORT_MODULE && fi.base === AM.IMPORT_FIELD) {
      importInternalName = fi.name;
      break;
    }
  }
  if (importInternalName) {
    wasmModule.removeFunction(importInternalName);
  }
};
