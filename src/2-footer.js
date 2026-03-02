'use strict';

(function () {
  if (Wasm2Lang.Utilities.Environment.isNode()) {
    if (require.main !== module) {
      module.exports['runCliEntryPoint'] = Wasm2Lang.Processor.runCliEntryPoint;
      return;
    }
  }

  /**
   * @typedef {
   *  {
   *    runCliEntryPoint: function(!Binaryen):
   *      !Wasm2Lang.Processor.TranspileResult
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
    return;
  }

  entryPoints = {
    'runCliEntryPoint': Wasm2Lang.Processor.runCliEntryPoint
  };

  globalThis['Wasm2Lang'] = entryPoints;
})();

/** @preserve One-line CLI invocation:
 * node wasmxlang.js --input-file temp/basis0.wast --normalize-wasm binaryen:min --normalize-wasm binaryen:max --emit-web-assembly text
 * --dev is optional and can be used to run the CLI with unminified versions of the code, which may be easier to debug and understand.
 */
