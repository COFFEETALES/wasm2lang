'use strict';

/**
 * @const
 */
Wasm2Lang.Processor = {};

/**
 * @enum {string}
 */
Wasm2Lang.Processor.TranspileResultProperty = {
  METADATA: 'metadata',
  CODE: 'code',
  WASM: 'wasm',
  WAST: 'wast'
};

/**
 * @typedef {!Object<!Wasm2Lang.Processor.TranspileResultProperty, (string|!Uint8Array)>}
 */
Wasm2Lang.Processor.TranspileResult;

/**
 * @private
 * @type {?Binaryen}
 */
Wasm2Lang.Processor.binaryen = null;

/**
 * @return {!Binaryen}
 */
Wasm2Lang.Processor.getBinaryen = function () {
  // prettier-ignore
  return /** @const {!Binaryen} */ (Wasm2Lang.Processor.binaryen);
};

/**
 * @private
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Wasm2Lang.Processor.TranspileResult}
 */
Wasm2Lang.Processor.transpile_ = function (options) {
  var /** @const {!BinaryenModule} */ wasmModule = Wasm2Lang.Wasm.WasmNormalization.readWasmModule(options.inputData);
  var /** @const {?Wasm2Lang.Backend.AsmjsCodegen} */ asmjsCodegen =
      'asmjs' === options.languageOut ? new Wasm2Lang.Backend.AsmjsCodegen() : null;
  var /** @const {?Wasm2Lang.Backend.Php64Codegen} */ php64Codegen =
      'php64' === options.languageOut ? new Wasm2Lang.Backend.Php64Codegen() : null;
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen} */ codegen =
      asmjsCodegen || php64Codegen || new Wasm2Lang.Backend.AbstractCodegen();
  // prettier-ignore
  var /** @const {!Wasm2Lang.Processor.TranspileResult} */ results =
    /** @const {!Wasm2Lang.Processor.TranspileResult} */ (Object.create(null));

  Wasm2Lang.Wasm.WasmNormalization.applyNormalizationBundles(wasmModule, options);

  if ('string' === typeof options.emitMetadata) {
    // prettier-ignore
    results[Wasm2Lang.Processor.TranspileResultProperty.METADATA] = /** @const {string} */ (
      asmjsCodegen
        ? asmjsCodegen.emitMetadata(wasmModule, options)
        : php64Codegen
          ? php64Codegen.emitMetadata(wasmModule, options)
          : /** @type {string} */ (options.emitMetadata)
    );
  }

  if ('string' === typeof options.emitCode) {
    // prettier-ignore
    results[Wasm2Lang.Processor.TranspileResultProperty.CODE] = /** @const {string} */ (
      codegen.emitCode(wasmModule, options)
    );
  }

  if ('string' === typeof options.emitWebAssembly) {
    if ('text' === options.emitWebAssembly.toLowerCase()) {
      // prettier-ignore
      results[Wasm2Lang.Processor.TranspileResultProperty.WAST] = /** @const {string} */ (
        Wasm2Lang.Wasm.WasmNormalization.emitNormalizedWasm(wasmModule, 'text')
      );
    } else {
      // prettier-ignore
      results[Wasm2Lang.Processor.TranspileResultProperty.WASM] = /** @const {!Uint8Array} */ (
        Wasm2Lang.Wasm.WasmNormalization.emitNormalizedWasm(wasmModule, 'binary')
      );
    }
  }

  return results;
};

/**
 * @private
 * @param {!Binaryen} binaryenModule
 * @return {void}
 */
Wasm2Lang.Processor.initializeModules_ = function (binaryenModule) {
  Wasm2Lang.Processor.binaryen = binaryenModule;
};

/**
 * @param {?Binaryen} binaryenModule
 * @return {!Wasm2Lang.Processor.TranspileResult}
 */
Wasm2Lang.Processor.runCliEntryPoint = function (binaryenModule) {
  if (!binaryenModule) {
    throw new Error('Missing required module(s).');
  }

  Wasm2Lang.Processor.initializeModules_(binaryenModule);

  var params = Wasm2Lang.CLI.CommandLineParser.parseArgv();

  if ('object' === typeof params['--help']) {
    Wasm2Lang.Utilities.Environment.stderrWriters[Wasm2Lang.Utilities.Environment.isNode()](
      Wasm2Lang.Utilities.Environment.LogLevel.NONE,
      '\nWasm2Lang CLI Help:'
    );

    /** @const {!Array<!Wasm2Lang.Options.Schema.OptionKey>} */
    var props = Object.keys(Wasm2Lang.Options.Schema.optionSchema);

    for (var /** number */ i = 0, /** @const {number} */ len = props.length; i !== len; ++i) {
      var /** @const {!Wasm2Lang.Options.Schema.OptionKey} */ key = props[i];
      var entry = Wasm2Lang.Options.Schema.optionSchema[key];
      var /** @const {string} */ description = entry.optionDesc;
      Wasm2Lang.Utilities.Environment.stderrWriters[Wasm2Lang.Utilities.Environment.isNode()](
        Wasm2Lang.Utilities.Environment.LogLevel.NONE,
        '\n--' + key.replace(/(?=[A-Z])/g, '-').toLowerCase() + ':\n',
        description
      );
    }

    Wasm2Lang.Utilities.Environment.stderrWriters[Wasm2Lang.Utilities.Environment.isNode()](
      Wasm2Lang.Utilities.Environment.LogLevel.NONE,
      ''
    );
    // prettier-ignore
    return /** @const {!Wasm2Lang.Processor.TranspileResult} */ (
      Object.create(null)
    );
  }

  var /** @const {!Wasm2Lang.Options.Schema.NormalizedOptions} */ options =
      Wasm2Lang.CLI.CommandLineParser.processParams(params);

  var /** @const {!Wasm2Lang.Processor.TranspileResult} */ results = Wasm2Lang.Processor.transpile_(options);

  for (var /** !Wasm2Lang.Processor.TranspileResultProperty */ resKey in results) {
    Wasm2Lang.Utilities.Environment.stdoutWriters[Wasm2Lang.Utilities.Environment.isNode()](results[resKey]);
  }

  return results;
};
