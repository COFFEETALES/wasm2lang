'use strict';

(function () {
  if (Wasm2Lang.Utilities.Environment.isNode()) {
    if (require.main !== module) {
      module.exports['runCliEntryPoint'] = Wasm2Lang.Processor.runCliEntryPoint;
      module.exports['transpile'] = Wasm2Lang.Processor.transpile;
      return;
    }
  }

  /**
   * @typedef {
   *  {
   *    runCliEntryPoint: function(!Binaryen):
   *      (!Wasm2Lang.Processor.TranspileResult|!Promise<!Wasm2Lang.Processor.TranspileResult>),
   *    transpile: function(!Binaryen, !Object):
   *      (!Wasm2Lang.Processor.MaterializedResult|!Promise<!Wasm2Lang.Processor.MaterializedResult>)
   *  }
   * }
   */
  var Wasm2LangEntryPoints;

  /**
   * @type {?Wasm2LangEntryPoints}
   */
  var entryPoints = null;

  // prettier-ignore
  entryPoints = /** @const {!Wasm2LangEntryPoints} */ (globalThis['Wasm2Lang']);

  if (entryPoints) {
    entryPoints['runCliEntryPoint'] = Wasm2Lang.Processor.runCliEntryPoint;
    entryPoints['transpile'] = Wasm2Lang.Processor.transpile;
    return;
  }

  entryPoints = {
    'runCliEntryPoint': Wasm2Lang.Processor.runCliEntryPoint,
    'transpile': Wasm2Lang.Processor.transpile
  };

  globalThis['Wasm2Lang'] = entryPoints;
})();

/** @preserve One-line CLI invocation:
 * node wasmxlang.js --input-file temp/basis0.wast --normalize-wasm binaryen:min --normalize-wasm binaryen:max --emit-web-assembly text
 * --dev is optional and can be used to run the CLI with unminified versions of the code, which may be easier to debug and understand.
 */
