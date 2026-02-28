'use strict';

/**
 * @const
 */
Wasm2Lang.Backend.AbstractCodegen = {};

/**
 * Lazily-built reverse map from Binaryen expression-ID numbers to readable
 * names.  Populated once on first call to {@code idName_}.
 *
 * @private
 * @type {?Object<number, string>}
 */
Wasm2Lang.Backend.AbstractCodegen.idNames_ = null;

/**
 * Maps a Binaryen expression ID to a short readable name for the skeleton
 * output.  Uses a lazily-cached lookup object instead of a long equality
 * chain.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} id
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.idName_ = function (binaryen, id) {
  var /** @type {?Object<number, string>} */ names = Wasm2Lang.Backend.AbstractCodegen.idNames_;

  if (!names) {
    names = Object.create(null);
    names[binaryen.BlockId] = 'block';
    names[binaryen.IfId] = 'if';
    names[binaryen.LoopId] = 'loop';
    names[binaryen.BreakId] = 'br';
    names[binaryen.SwitchId] = 'br_table';
    names[binaryen.LocalGetId] = 'local.get';
    names[binaryen.LocalSetId] = 'local.set';
    names[binaryen.GlobalGetId] = 'global.get';
    names[binaryen.GlobalSetId] = 'global.set';
    names[binaryen.ConstId] = 'const';
    names[binaryen.UnaryId] = 'unary';
    names[binaryen.BinaryId] = 'binary';
    names[binaryen.SelectId] = 'select';
    names[binaryen.DropId] = 'drop';
    names[binaryen.ReturnId] = 'return';
    names[binaryen.CallId] = 'call';
    names[binaryen.CallIndirectId] = 'call_indirect';
    names[binaryen.LoadId] = 'load';
    names[binaryen.StoreId] = 'store';
    names[binaryen.NopId] = 'nop';
    names[binaryen.UnreachableId] = 'unreachable';
    names[binaryen.MemorySizeId] = 'memory.size';
    names[binaryen.MemoryGrowId] = 'memory.grow';
    Wasm2Lang.Backend.AbstractCodegen.idNames_ = names;
  }

  var /** @const {*} */ name = names[id];
  return 'string' === typeof name ? name : 'expr(' + id + ')';
};

/**
 * Traversal-driven backend emission.  Walks every non-imported function body
 * with the TraversalKernel and emits a skeleton string — one comment line per
 * function with the traversal node count.  Replace the visitor body with real
 * string-building logic to produce target language code.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.emitCode = function (wasmModule, options) {
  void options;
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {number} */ numFuncs = wasmModule.getNumFunctions();
  var /** @const {!Array<string>} */ outputParts = [];
  var /** @const {!Object<string, boolean>} */ seenIds = /** @type {!Object<string, boolean>} */ (Object.create(null));
  var /** @const {!Array<string>} */ seenIdNames = [];

  for (var /** number */ f = 0; f !== numFuncs; ++f) {
    var /** @const {number} */ funcPtr = wasmModule.getFunctionByIndex(f);
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(funcPtr);

    // Skip imported functions — they have a non-empty import base name.
    if ('' !== funcInfo.base) {
      continue;
    }

    var /** @type {number} */ nodeCount = 0;
    var /** @const {number} */ bodyPtr = Number(funcInfo.body || 0);

    if (0 !== bodyPtr) {
      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalContext} */ ctx = {
          treeModule: wasmModule,
          functionInfo: funcInfo,
          treeMetadata: /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata} */ (Object.create(null)),
          ancestors: []
        };

      // prettier-ignore
      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
        /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
          /**
           * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
           * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
           */
          enter: function (nodeCtx) {
            var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression =
              /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ (nodeCtx.expression);
            var /** @const {number} */ id = Number(expression['id'] || 0);
            var /** @const {string} */ idKey = String(id);
            ++nodeCount;

            if (!seenIds[idKey]) {
              seenIds[idKey] = true;
              seenIdNames[seenIdNames.length] = Wasm2Lang.Backend.AbstractCodegen.idName_(binaryen, id);
            }

            return null;
          }
        });

      Wasm2Lang.Wasm.Tree.TraversalKernel.walkExpression(bodyPtr, ctx, visitor);
    }

    outputParts[outputParts.length] = '// ' + funcInfo.name + ' [nodes:' + nodeCount + ']';
  }

  outputParts[outputParts.length] = '// [ids seen: ' + (0 !== seenIdNames.length ? seenIdNames.join(', ') : '(none)') + ']';

  return outputParts.join('\n');
};
