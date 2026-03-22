'use strict';

/**
 * @const
 */
Wasm2Lang.Options.Schema = {};

/**
 * @enum {string}
 */
Wasm2Lang.Options.Schema.OptionKey = {
  LANGUAGE_OUT: 'languageOut',
  NORMALIZE_WASM: 'normalizeWasm',
  DEFINE: 'define',
  INPUT_DATA: 'inputData',
  INPUT_FILE: 'inputFile',
  EMIT_METADATA: 'emitMetadata',
  EMIT_CODE: 'emitCode',
  EMIT_WEBASSEMBLY: 'emitWebAssembly',
  MANGLER: 'mangler'
};

/**
 * @typedef {{
 *   languageOut: string,
 *   normalizeWasm: !Array<string>,
 *   definitions: !Object<string, string>,
 *   inputData: (string|!Uint8Array|null),
 *   inputFile: (string|null),
 *   emitMetadata: (string|null),
 *   emitCode: (string|null),
 *   emitWebAssembly: (string|null),
 *   mangler: (string|null)
 * }}
 */
Wasm2Lang.Options.Schema.NormalizedOptions;

/**
 * External options object passed to {@code Wasm2Lang.Processor.transpile}.
 * All fields are optional; missing fields fall back to
 * {@code defaultOptions}.  Keys are read with bracket notation so that
 * external callers survive Closure property renaming.
 *
 * Emit flags accept {@code true} for default names, or a string for
 * custom names.
 *
 * @typedef {{
 *   languageOut: (string|undefined),
 *   normalizeWasm: (!Array<string>|undefined),
 *   definitions: (!Object<string, string>|undefined),
 *   inputData: (string|!Uint8Array|undefined),
 *   emitMetadata: (boolean|string|undefined),
 *   emitCode: (boolean|string|undefined),
 *   emitWebAssembly: (boolean|string|undefined),
 *   mangler: (string|undefined)
 * }}
 */
Wasm2Lang.Options.Schema.UserOptions;

/**
 * @const {!Array<string>}
 */
Wasm2Lang.Options.Schema.languages = ['asmjs', 'php64', 'java'];

/**
 * @typedef {{
 *   infoDescription: string,
 *   infoPhase: string
 * }}
 */
Wasm2Lang.Options.Schema.NormalizeBundleInfo;

/**
 * @const {!Object<string, !Wasm2Lang.Options.Schema.NormalizeBundleInfo>}
 */
Wasm2Lang.Options.Schema.normalizeBundles = Object.create(null);

Wasm2Lang.Options.Schema.normalizeBundles['binaryen:none'] = {
  infoDescription: 'No normalization (raw WebAssembly input).',
  infoPhase: 'binaryen'
};

Wasm2Lang.Options.Schema.normalizeBundles['binaryen:min'] = {
  infoDescription: 'Minimal, safe Binaryen normalization passes.',
  infoPhase: 'binaryen'
};

Wasm2Lang.Options.Schema.normalizeBundles['binaryen:max'] = {
  infoDescription: 'Aggressive Binaryen normalization for code generation.',
  infoPhase: 'binaryen'
};

Wasm2Lang.Options.Schema.normalizeBundles['wasm2lang:codegen'] = {
  infoDescription: 'Internal wasm2lang transformations for easier backend emission.',
  infoPhase: 'wasm2lang'
};

/**
 * @const {!Wasm2Lang.Options.Schema.NormalizedOptions}
 */
Wasm2Lang.Options.Schema.defaultOptions = {
  languageOut: 'asmjs',
  normalizeWasm: ['binaryen:min'],
  definitions: Object.create(null),
  inputData: null,
  inputFile: null,
  emitMetadata: null,
  emitCode: null,
  emitWebAssembly: null,
  mangler: null
};

/**
 * @const {
 *  !Object<
 *    !Wasm2Lang.Options.Schema.OptionKey,
 *    function(!Wasm2Lang.Options.Schema.NormalizedOptions, !Array<string>): void
 *  >
 * }
 */
Wasm2Lang.Options.Schema.optionParsers = {};

/**
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Array<string>} strs
 */
Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.LANGUAGE_OUT] = function (options, strs) {
  options.languageOut = strs[strs.length - 1].toLowerCase();
};

/**
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Array<string>} strs
 */
Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.NORMALIZE_WASM] = function (options, strs) {
  options.normalizeWasm = strs.flatMap(function (str) {
    return str.toLowerCase().split(',');
  });
};

/**
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Array<string>} strs
 */
Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.DEFINE] = function (options, strs) {
  for (var /** number */ i = 0, /** @const {number} */ len = strs.length; i !== len; ++i) {
    var /** @const {!Array<string>} */ parts = strs[i].split('=', 2);
    options.definitions[parts[0]] = 1 !== parts.length ? parts[1] : '';
  }
};

/**
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Array<string>} strs
 */
Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.INPUT_DATA] = function (options, strs) {
  if (0 !== strs.length) {
    options.inputData = strs[strs.length - 1];
  }
};

/**
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Array<string>} strs
 */
Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.INPUT_FILE] = function (options, strs) {
  if (0 !== strs.length) {
    options.inputFile = strs[strs.length - 1];
  }
};

/**
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Array<string>} strs
 */
Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.EMIT_METADATA] = function (options, strs) {
  if (0 === strs.length) {
    options.emitMetadata = 'metadata';
    return;
  }
  options.emitMetadata = strs[strs.length - 1];
};

/**
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Array<string>} strs
 */
Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.EMIT_CODE] = function (options, strs) {
  if (0 === strs.length) {
    options.emitCode = 'code';
    return;
  }
  options.emitCode = strs[strs.length - 1];
};

/**
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Array<string>} strs
 */
Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.EMIT_WEBASSEMBLY] = function (options, strs) {
  if (0 === strs.length) {
    options.emitWebAssembly = '';
    return;
  }
  options.emitWebAssembly = strs[strs.length - 1];
};

/**
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Array<string>} strs
 */
Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.MANGLER] = function (options, strs) {
  if (0 !== strs.length) {
    options.mangler = strs[strs.length - 1];
  }
};

/**
 * @const {
 *  !Object<
 *    !Wasm2Lang.Options.Schema.OptionKey, {
 *      optionType: string,
 *      optionValues: ?Array<string>,
 *      bundles: ?Object<
 *        string,
 *        !Wasm2Lang.Options.Schema.NormalizeBundleInfo
 *      >,
 *      optionDesc: string
 *    }
 *  >
 * }
 */
Wasm2Lang.Options.Schema.optionSchema = {
  'languageOut': {
    optionType: 'enum',
    optionValues: Wasm2Lang.Options.Schema.languages,
    optionDesc: 'Selects the output backend language to generate.'
  },
  'normalizeWasm': {
    optionType: 'bundle-list',
    bundles: Wasm2Lang.Options.Schema.normalizeBundles,
    optionDesc:
      'Comma-separated list of normalization bundles to apply before code generation (e.g. "binaryen:min,wasm2lang:codegen").'
  },
  'define': {
    optionType: 'string|null',
    optionDesc: 'Defines a compile-time constant (repeatable), e.g. -DNAME=VALUE (VALUE may be string/number/boolean).'
  },
  'inputData': {
    optionType: 'string|Uint8Array',
    optionDesc: 'Input WebAssembly contents to compile (binary buffer or text string).'
  },
  'inputFile': {
    optionType: 'string|null',
    optionDesc: 'CLI-only: path to a WebAssembly file to load into inputData (\".wat\"/\".wast\" read as text).'
  },
  'emitMetadata': {
    optionType: 'string|null',
    optionDesc:
      'When set, emits the memory buffer as a named field/variable (e.g. --emit-metadata mybuffer => var mybuffer = metadata). Can be used together with --emit-code.'
  },
  'emitCode': {
    optionType: 'string|null',
    optionDesc:
      'When set, emits the generated code as a named field/variable (e.g. --emit-code asmjs => var asmjs = code). Can be used together with --emit-metadata.'
  },
  'emitWebAssembly': {
    optionType: 'string|null',
    optionDesc:
      'Emits the (normalized) WebAssembly module to stdout. Defaults to binary; use "text" to emit the text format instead.'
  },
  'mangler': {
    optionType: 'string|null',
    optionDesc:
      'Enables deterministic keyed identifier mangling for generated output. Internal identifiers are replaced with short, opaque names derived from the given key. Same key produces identical output; different keys produce different names.'
  }
};
