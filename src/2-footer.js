'use strict';

(function () {
  if (Wasm2Lang.Utilities.Environment.isNode()) {
    if (require.main !== module) {
      module.exports['runCliEntryPoint'] = Wasm2Lang.Processor.runCliEntryPoint;
      module.exports['transpile'] = Wasm2Lang.Processor.transpile;
      module.exports['getPassAnalysis'] = Wasm2Lang.Processor.getPassAnalysis;
      return;
    }
  }

  /**
   * @typedef {
   *  {
   *    runCliEntryPoint: function(!Binaryen):
   *      (!Wasm2Lang.Processor.TranspileResult|!Promise<!Wasm2Lang.Processor.TranspileResult>),
   *    transpile: function(!Binaryen, !Wasm2Lang.Options.Schema.UserOptions):
   *      (!Wasm2Lang.Processor.MaterializedResult|!Promise<!Wasm2Lang.Processor.MaterializedResult>),
   *    getPassAnalysis: function(!Binaryen, string): !Object
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
    entryPoints['getPassAnalysis'] = Wasm2Lang.Processor.getPassAnalysis;
    return;
  }

  entryPoints = {
    'runCliEntryPoint': Wasm2Lang.Processor.runCliEntryPoint,
    'transpile': Wasm2Lang.Processor.transpile,
    'getPassAnalysis': Wasm2Lang.Processor.getPassAnalysis
  };

  globalThis['Wasm2Lang'] = entryPoints;
})();

/** @preserve One-line CLI invocation:
 * node wasmxlang.js --input-file temp/basis0.wast --normalize-wasm binaryen:min --normalize-wasm binaryen:max --emit-web-assembly text
 * --dev is optional and can be used to run the CLI with unminified versions of the code, which may be easier to debug and understand.
 */
