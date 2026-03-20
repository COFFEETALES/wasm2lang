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
 * @typedef {!Object<!Wasm2Lang.Processor.TranspileResultProperty, (string|!Uint8Array|!Array<!Wasm2Lang.OutputSink.ChunkEntry>)>}
 */
Wasm2Lang.Processor.TranspileResult;

/**
 * A transpile result where all chunk arrays have been flattened to strings.
 * Every value is either a flat string or a Uint8Array.
 *
 * @typedef {!Object<!Wasm2Lang.Processor.TranspileResultProperty, (string|!Uint8Array)>}
 */
Wasm2Lang.Processor.MaterializedResult;

/**
 * Canonical key ordering for iterating transpile results.  Shared across
 * {@code drainResults_} and {@code materializeResult_}.
 *
 * @private
 * @const {!Array<!Wasm2Lang.Processor.TranspileResultProperty>}
 */
Wasm2Lang.Processor.RESULT_KEY_ORDER_ = [
  Wasm2Lang.Processor.TranspileResultProperty.METADATA,
  Wasm2Lang.Processor.TranspileResultProperty.CODE,
  Wasm2Lang.Processor.TranspileResultProperty.WAST,
  Wasm2Lang.Processor.TranspileResultProperty.WASM
];

/**
 * @private
 * @type {?Binaryen}
 */
Wasm2Lang.Processor.binaryen = null;

/**
 * @return {!Binaryen}
 */
Wasm2Lang.Processor.getBinaryen = function () {
  if (!Wasm2Lang.Processor.binaryen) {
    throw new Error('Wasm2Lang: binaryen not initialized. Call runCliEntryPoint first.');
  }
  // prettier-ignore
  return /** @const {!Binaryen} */ (Wasm2Lang.Processor.binaryen);
};

/**
 * Emits all requested output artifacts from a prepared module/codegen pair.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Backend.AbstractCodegen} codegen
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Wasm2Lang.Processor.TranspileResult}
 */
Wasm2Lang.Processor.emitResults_ = function (wasmModule, codegen, options) {
  // prettier-ignore
  var /** @const {!Wasm2Lang.Processor.TranspileResult} */ results =
    /** @const {!Wasm2Lang.Processor.TranspileResult} */ (Object.create(null));

  if ('string' === typeof options.emitMetadata) {
    // prettier-ignore
    results[Wasm2Lang.Processor.TranspileResultProperty.METADATA] = /** @const {string} */ (
      codegen.emitMetadata(wasmModule, options)
    );
  }

  if ('string' === typeof options.emitCode) {
    var /** @const {string|!Array<!Wasm2Lang.OutputSink.ChunkEntry>} */ codeResult = codegen.emitCode(wasmModule, options);
    results[Wasm2Lang.Processor.TranspileResultProperty.CODE] = codeResult;
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
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Wasm2Lang.Processor.TranspileResult|!Promise<!Wasm2Lang.Processor.TranspileResult>}
 */
Wasm2Lang.Processor.transpile_ = function (options) {
  var /** @const {!BinaryenModule} */ wasmModule = Wasm2Lang.Wasm.WasmNormalization.readWasmModule(options.inputData);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen} */ codegen = Wasm2Lang.Backend.createBackend(options.languageOut);

  // prettier-ignore
  var /** @const {?Wasm2Lang.Wasm.Tree.PassRunResult} */ passRunResult =
    Wasm2Lang.Wasm.WasmNormalization.applyNormalizationBundles(wasmModule, options);
  if (passRunResult) {
    codegen.setPassRunResult_(passRunResult);
  }

  if (options.mangler) {
    return codegen.precomputeMangledNames_(wasmModule, options).then(function () {
      return Wasm2Lang.Processor.emitResults_(wasmModule, codegen, options);
    });
  }

  return Wasm2Lang.Processor.emitResults_(wasmModule, codegen, options);
};

/**
 * Drains every entry of a {@code TranspileResult} through a write function
 * in a fixed key order, resolving any pending chunks serially.
 *
 * String and Uint8Array results are written directly as single chunks.
 * Array results (from backends that return chunk arrays) are drained with
 * {@code OutputSink.drainChunks}.  A trailing newline is appended after
 * each string-typed result to match the previous stdout output convention.
 *
 * @private
 * @param {!Wasm2Lang.Processor.TranspileResult} results
 * @param {!Wasm2Lang.OutputSink.WriteFn} writeFn
 * @return {!Promise<void>|void}
 */
Wasm2Lang.Processor.drainResults_ = function (results, writeFn) {
  /** @const {!Array<!Wasm2Lang.Processor.TranspileResultProperty>} */
  var keyOrder = Wasm2Lang.Processor.RESULT_KEY_ORDER_;

  /** @type {!Array<!Wasm2Lang.OutputSink.ChunkEntry>} */
  var allChunks = [];

  for (var /** number */ i = 0, /** @const {number} */ len = keyOrder.length; i !== len; ++i) {
    var /** @const {!Wasm2Lang.Processor.TranspileResultProperty} */ key = keyOrder[i];
    if (!(key in results)) {
      continue;
    }
    var /** @const {*} */ value = results[key];
    if (Array.isArray(value)) {
      for (var /** number */ j = 0, /** @const {number} */ cLen = value.length; j !== cLen; ++j) {
        allChunks[allChunks.length] = value[j];
      }
      allChunks[allChunks.length] = '\n';
    } else if ('string' === typeof value) {
      allChunks[allChunks.length] = /** @type {string} */ (value);
      allChunks[allChunks.length] = '\n';
    } else {
      allChunks[allChunks.length] = /** @type {!Uint8Array} */ (value);
    }
  }

  return Wasm2Lang.OutputSink.drainChunks(allChunks, writeFn);
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
 * Merges a user-supplied options object with defaults to produce a
 * {@code NormalizedOptions}.  User keys are read with bracket notation
 * (external data survives Closure renaming); result fields use unquoted
 * dot-access (internal, Closure-compatible).
 *
 * Emit flags accept {@code true} for default names, or a string for
 * custom names.  {@code inputFile} is always {@code null} — the
 * programmatic API expects input via {@code inputData}.
 *
 * @private
 * @param {!Object} userOptions
 * @return {!Wasm2Lang.Options.Schema.NormalizedOptions}
 */
Wasm2Lang.Processor.normalizeUserOptions_ = function (userOptions) {
  var /** @const {!Wasm2Lang.Options.Schema.NormalizedOptions} */ d = Wasm2Lang.Options.Schema.defaultOptions;

  var /** @const {string} */ languageOut = /** @type {string} */ (userOptions['languageOut']) || d.languageOut;
  var /** @const {?Array<string>} */ userNormalize = /** @type {?Array<string>} */ (userOptions['normalizeWasm']);
  var /** @const {?Object<string, string>} */ userDefs = /** @type {?Object<string, string>} */ (userOptions['definitions']);
  var /** @const {?(string|!Uint8Array)} */ userInput = /** @type {?(string|!Uint8Array)} */ (userOptions['inputData']);
  var /** @const {?string} */ userMangler = /** @type {?string} */ (userOptions['mangler']);

  var /** @const {!Wasm2Lang.Options.Schema.NormalizedOptions} */ o =
      /** @type {!Wasm2Lang.Options.Schema.NormalizedOptions} */ ({
        languageOut: String(languageOut),
        normalizeWasm: userNormalize || d.normalizeWasm.slice(),
        definitions: userDefs || /** @type {!Object<string, string>} */ (Object.create(null)),
        inputData: userInput || null,
        inputFile: null,
        emitMetadata: null,
        emitCode: null,
        emitWebAssembly: null,
        mangler: userMangler || null
      });

  if (userOptions['emitMetadata'] != null) {
    o.emitMetadata = userOptions['emitMetadata'] === true ? 'metadata' : String(userOptions['emitMetadata']);
  }
  if (userOptions['emitCode'] != null) {
    o.emitCode = userOptions['emitCode'] === true ? 'code' : String(userOptions['emitCode']);
  }
  if (userOptions['emitWebAssembly'] != null) {
    o.emitWebAssembly = userOptions['emitWebAssembly'] === true ? '' : String(userOptions['emitWebAssembly']);
  }

  return o;
};

/**
 * Flattens a {@code TranspileResult} by collecting any chunk arrays into
 * joined strings, producing a {@code MaterializedResult} where every
 * value is either a flat string or a Uint8Array.
 *
 * Runs synchronously when all chunks are resolved.  If any chunk array
 * contains a pending Promise, the function returns a Promise that
 * resolves to the fully materialized result.
 *
 * @private
 * @param {!Wasm2Lang.Processor.TranspileResult} result
 * @return {!Wasm2Lang.Processor.MaterializedResult|!Promise<!Wasm2Lang.Processor.MaterializedResult>}
 */
Wasm2Lang.Processor.materializeResult_ = function (result) {
  // prettier-ignore
  var /** @const {!Wasm2Lang.Processor.MaterializedResult} */ materialized =
    /** @type {!Wasm2Lang.Processor.MaterializedResult} */ (Object.create(null));

  /** @const {!Array<!Wasm2Lang.Processor.TranspileResultProperty>} */
  var keyOrder = Wasm2Lang.Processor.RESULT_KEY_ORDER_;

  /** @type {!Array<!Wasm2Lang.Processor.TranspileResultProperty>} */
  var asyncKeys = [];
  /** @type {!Array<!Promise<string>>} */
  var asyncPromises = [];

  for (var /** number */ i = 0, /** @const {number} */ len = keyOrder.length; i !== len; ++i) {
    var /** @const {!Wasm2Lang.Processor.TranspileResultProperty} */ key = keyOrder[i];
    if (!(key in result)) {
      continue;
    }
    var /** @const {*} */ value = result[key];
    if (Array.isArray(value)) {
      var /** @const {*} */ collected = Wasm2Lang.OutputSink.collectChunks(
          /** @type {!Array<!Wasm2Lang.OutputSink.ChunkEntry>} */ (value)
        );
      if (collected instanceof Promise) {
        asyncKeys[asyncKeys.length] = key;
        asyncPromises[asyncPromises.length] = /** @type {!Promise<string>} */ (collected);
      } else {
        materialized[key] = /** @type {string} */ (collected);
      }
    } else {
      materialized[key] = /** @type {string|!Uint8Array} */ (value);
    }
  }

  if (0 !== asyncPromises.length) {
    return Promise.all(asyncPromises).then(
      /** @param {!Array<string>} strings @return {!Wasm2Lang.Processor.MaterializedResult} */
      function (strings) {
        for (var /** number */ j = 0, /** @const {number} */ jLen = strings.length; j !== jLen; ++j) {
          materialized[asyncKeys[j]] = strings[j];
        }
        return materialized;
      }
    );
  }

  return materialized;
};

/**
 * Programmatic entry point for wasm2lang.
 *
 * Accepts a binaryen instance and a user options object, runs the
 * transpile pipeline, and returns a {@code MaterializedResult} where all
 * chunk arrays have been flattened to strings.  Unlike
 * {@code runCliEntryPoint}, this does not drain output to stdout — the
 * caller receives the result object directly.
 *
 * @param {!Binaryen} binaryenModule
 * @param {!Object} userOptions
 * @return {!Wasm2Lang.Processor.MaterializedResult|!Promise<!Wasm2Lang.Processor.MaterializedResult>}
 */
Wasm2Lang.Processor.transpile = function (binaryenModule, userOptions) {
  if (!binaryenModule) {
    throw new Error('Missing required binaryen module.');
  }

  Wasm2Lang.Processor.initializeModules_(binaryenModule);

  var /** @const {!Wasm2Lang.Options.Schema.NormalizedOptions} */ options =
      Wasm2Lang.Processor.normalizeUserOptions_(userOptions);

  var /** @const {*} */ transpileResult = Wasm2Lang.Processor.transpile_(options);
  if (transpileResult instanceof Promise) {
    return /** @type {!Promise<!Wasm2Lang.Processor.TranspileResult>} */ (transpileResult).then(
      Wasm2Lang.Processor.materializeResult_
    );
  }

  return Wasm2Lang.Processor.materializeResult_(/** @type {!Wasm2Lang.Processor.TranspileResult} */ (transpileResult));
};

/**
 * @param {?Binaryen} binaryenModule
 * @return {!Wasm2Lang.Processor.TranspileResult|!Promise<!Wasm2Lang.Processor.TranspileResult>}
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

  /**
   * @param {!Wasm2Lang.Processor.TranspileResult} results
   * @return {!Wasm2Lang.Processor.TranspileResult|!Promise<!Wasm2Lang.Processor.TranspileResult>}
   */
  function drainAndReturn(results) {
    var /** @const {!Wasm2Lang.OutputSink.WriteFn} */ sink = Wasm2Lang.OutputSink.createStdoutSink();
    var /** @const {(!Promise<void>|void)} */ drainResult = Wasm2Lang.Processor.drainResults_(results, sink);
    if (drainResult) {
      return drainResult.then(function () {
        return results;
      });
    }
    return results;
  }

  var /** @const {*} */ transpileResult = Wasm2Lang.Processor.transpile_(options);
  if (transpileResult instanceof Promise) {
    return /** @type {!Promise<!Wasm2Lang.Processor.TranspileResult>} */ (transpileResult).then(drainAndReturn);
  }

  return drainAndReturn(/** @type {!Wasm2Lang.Processor.TranspileResult} */ (transpileResult));
};
