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
 * @param {!Binaryen=} opt_binaryen  Injected binaryen instance. Falls back to
 *     Processor.getBinaryen() when omitted (backward compat).
 * @return {!Wasm2Lang.Wasm.Tree.PassRunResult}
 */
Wasm2Lang.Wasm.Tree.PassRunner.runOnModule = function (wasmModule, passes, opt_binaryen) {
  var /** @const {!Binaryen} */ binaryen = opt_binaryen || Wasm2Lang.Processor.getBinaryen();
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

  for (var /** @type {number} */ f = 0; f !== funcCount; ++f) {
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
    funcMetadata.passFuncName = funcInfo.name;
    funcMetadata.passFuncPtr = funcPtr;
    funcMetadata.passTreeModule = wasmModule;
    funcMetadata.bodyReplaced = false;

    // Reuse a single TraversalContext per function — only the ancestors array
    // needs resetting between passes (walkExpression reads it on entry).
    var /** @const {!Wasm2Lang.Wasm.Tree.TraversalContext} */ traversalContext = {
        binaryen: binaryen,
        treeModule: wasmModule,
        functionInfo: funcInfo,
        treeMetadata: funcMetadata,
        ancestors: []
      };

    for (var /** @type {number} */ p = 0, /** @const {number} */ passCount = passes.length; p !== passCount; ++p) {
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

      traversalContext.ancestors = [];
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
    ++runResult.processedCount;
  }

  return runResult;
};
