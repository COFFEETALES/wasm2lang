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
 * When the {@code WASM2LANG_PROFILE} environment variable is set to a truthy
 * value, the runner accumulates per-pass wall-clock timings and flushes a
 * short report to stderr at the end of each module.  Disabled by default —
 * the only cost when off is a lazy-read of {@code process.env} followed by a
 * boolean check on each invocation.
 *
 * @private
 * @type {?boolean}
 */
Wasm2Lang.Wasm.Tree.PassRunner.profileEnabled_ = null;

/**
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.PassRunner.isProfileEnabled = function () {
  if (null === Wasm2Lang.Wasm.Tree.PassRunner.profileEnabled_) {
    var /** @type {boolean} */ enabled = false;
    var /** @const {*} */ rawProcess = 'undefined' !== typeof process ? process : null;
    if (rawProcess && 'object' === typeof rawProcess) {
      var /** @const {*} */ env = /** @type {!Object<string, *>} */ (rawProcess)['env'];
      if (env) {
        var /** @const {*} */ raw = /** @type {!Object<string, *>} */ (env)['WASM2LANG_PROFILE'];
        enabled = 'string' === typeof raw && '' !== raw && '0' !== raw && 'false' !== raw;
      }
    }
    Wasm2Lang.Wasm.Tree.PassRunner.profileEnabled_ = enabled;
  }
  return /** @type {boolean} */ (Wasm2Lang.Wasm.Tree.PassRunner.profileEnabled_);
};

/**
 * Writes a diagnostic line to stderr when the caller has already verified
 * that profiling is enabled.  Uses bracket access and runtime typeof guards
 * so Closure doesn't need a richer {@code process} extern to type-check.
 *
 * @param {string} line
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.PassRunner.writeProfileLine = function (line) {
  if ('undefined' === typeof process) {
    return;
  }
  var /** @const {*} */ proc = process;
  if (!proc || 'object' !== typeof proc) {
    return;
  }
  var /** @const {*} */ stderr = /** @type {!Object<string, *>} */ (proc)['stderr'];
  if (!stderr) {
    return;
  }
  var /** @const {*} */ writeFn = /** @type {!Object<string, *>} */ (stderr)['write'];
  if ('function' !== typeof writeFn) {
    return;
  }
  /** @type {function((string|!Uint8Array)): void} */ (writeFn).call(stderr, line);
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

  var /** @const {boolean} */ profileOn = Wasm2Lang.Wasm.Tree.PassRunner.isProfileEnabled();
  var /** @const {!Array<number>} */ passTotals = [];
  var /** @const {!Array<string>} */ passNames = [];
  if (profileOn) {
    for (var /** @type {number} */ pi = 0, /** @const {number} */ pn = passes.length; pi !== pn; ++pi) {
      passTotals[pi] = 0;
      passNames[pi] = passes[pi].passName || 'pass#' + pi;
    }
  }

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
      var /** @type {number} */ passStart = profileOn ? Date.now() : 0;

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

      if (profileOn) {
        passTotals[p] += Date.now() - passStart;
      }
    }

    funcsArray[funcsArray.length] = funcMetadata;
    ++runResult.processedCount;
  }

  if (profileOn) {
    Wasm2Lang.Wasm.Tree.PassRunner.flushProfileReport_(passNames, passTotals);
  }

  return runResult;
};

/**
 * @private
 * @param {!Array<string>} names
 * @param {!Array<number>} totalsMs
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.PassRunner.flushProfileReport_ = function (names, totalsMs) {
  var /** @const {number} */ passCount = names.length;
  if (0 === passCount) {
    return;
  }
  var /** @type {number} */ grand = 0;
  for (var /** @type {number} */ i = 0; i !== passCount; ++i) {
    grand += totalsMs[i];
  }
  var /** @const {!Array<string>} */ lines = ['[wasm2lang profile] pass timings (ms):'];
  for (var /** @type {number} */ k = 0; k !== passCount; ++k) {
    var /** @const {number} */ t = totalsMs[k];
    var /** @const {string} */ pct = grand > 0 ? ' (' + ((100 * t) / grand).toFixed(1) + '%)' : '';
    lines[lines.length] = '  ' + names[k] + ': ' + t + 'ms' + pct;
  }
  lines[lines.length] = '  TOTAL: ' + grand + 'ms';
  Wasm2Lang.Wasm.Tree.PassRunner.writeProfileLine(lines.join('\n') + '\n');
};
