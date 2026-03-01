'use strict';

/**
 * @const
 */
Wasm2Lang.Wasm.Tree.PassRunner = {};

/**
 * Pass execution phases.
 * @enum {string}
 */
Wasm2Lang.Wasm.Tree.PassRunner.Phase = {
  ANALYZE: 'analyze',
  OPTIMIZE: 'optimize',
  CODEGEN_PREP: 'codegen-prep'
};

/**
 * Runs every pass in `passes` over every non-imported function in `wasmModule`.
 * Per function:
 *   1. Call pass.onFunctionEnter (if defined).
 *   2. Walk the function body with the pass's visitor via TraversalKernel.
 *   3. If the body root was replaced, propagate via binaryen.Function.setBody.
 *   4. Call pass.onFunctionLeave (if defined).
 * Child-level replacements are applied automatically by TraversalKernel via
 * applyChildReplacement_.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Wasm.Tree.PassList} passes
 * @return {!Wasm2Lang.Wasm.Tree.PassRunResult}
 */
Wasm2Lang.Wasm.Tree.PassRunner.runOnModule = function (wasmModule, passes) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {number} */ funcCount = wasmModule.getNumFunctions();
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.PassRunResult} */ runResult =
    /** @const {!Wasm2Lang.Wasm.Tree.PassRunResult} */ ({
      functionCount: funcCount,
      processedCount: 0,
      functions: []
    });
  // prettier-ignore
  var /** @const {!Array<!Wasm2Lang.Wasm.Tree.PassMetadata>} */ funcsArray =
    /** @type {!Array<!Wasm2Lang.Wasm.Tree.PassMetadata>} */ (runResult.functions);

  for (var /** number */ f = 0; f !== funcCount; ++f) {
    var /** @const {number} */ funcPtr = wasmModule.getFunctionByIndex(f);
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(funcPtr);

    // Skip imported functions — they have a non-empty import base name.
    if ('' !== funcInfo.base) {
      continue;
    }

    var /** @type {number} */ currentBodyPtr = funcInfo.body;
    if (0 === currentBodyPtr) {
      continue;
    }

    // prettier-ignore
    var /** @const {!Wasm2Lang.Wasm.Tree.PassMetadata} */ funcMetadata = /** @const {!Wasm2Lang.Wasm.Tree.PassMetadata} */ (
      Object.create(null)
    );
    funcMetadata.name = funcInfo.name;
    funcMetadata.bodyReplaced = false;

    for (var /** number */ p = 0, /** @const {number} */ passCount = passes.length; p !== passCount; ++p) {
      var /** @const {!Wasm2Lang.Wasm.Tree.Pass} */ pass = passes[p];

      if ('function' === typeof pass.onFunctionEnter) {
        /** @type {!Wasm2Lang.Wasm.Tree.PassFunctionHook} */ (pass.onFunctionEnter)(funcInfo, funcMetadata);
      }

      // prettier-ignore
      var /** @const {function(!Wasm2Lang.Wasm.Tree.PassMetadata): !Wasm2Lang.Wasm.Tree.TraversalVisitor} */ createVisitorFn = /**
        @type {function(!Wasm2Lang.Wasm.Tree.PassMetadata): !Wasm2Lang.Wasm.Tree.TraversalVisitor}
      */ (
        pass.createVisitor
      );
      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor = createVisitorFn.call(pass, funcMetadata);

      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalContext} */ traversalContext = {
          treeModule: wasmModule,
          functionInfo: funcInfo,
          treeMetadata: funcMetadata,
          ancestors: []
        };

      var /** @const {*} */ walkResult = Wasm2Lang.Wasm.Tree.TraversalKernel.walkExpression(
          currentBodyPtr,
          traversalContext,
          visitor
        );

      // prettier-ignore
      var /** @const {number} */ newBodyPtr = /** @type {number} */ (
        'number' === typeof walkResult ? walkResult : currentBodyPtr
      );

      if (0 !== newBodyPtr && newBodyPtr !== currentBodyPtr) {
        binaryen.Function.setBody(funcPtr, newBodyPtr);
        currentBodyPtr = newBodyPtr;
        funcMetadata.bodyReplaced = true;
      }

      if ('function' === typeof pass.onFunctionLeave) {
        /** @type {!Wasm2Lang.Wasm.Tree.PassFunctionHook} */ (pass.onFunctionLeave)(funcInfo, funcMetadata);
      }
    }

    funcsArray[funcsArray.length] = funcMetadata;
    runResult.processedCount++;
  }

  return runResult;
};
