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
  MANGLER: 'mangler',
  OUT_FILE: 'outFile',
  PRE_NORMALIZED: 'preNormalized',
  DISABLE_PASS: 'disablePass',
  TRAP_SITES: 'trapSites'
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
 *   mangler: (string|null),
 *   outFile: (string|null),
 *   preNormalized: boolean,
 *   disabledPasses: !Array<string>,
 *   trapSites: boolean,
 *   trapSiteIds: boolean,
 *   trapHostAbort: boolean
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
 *   mangler: (string|undefined),
 *   preNormalized: (boolean|undefined),
 *   trapSites: (boolean|undefined),
 *   trapSiteIds: (boolean|undefined),
 *   trapHostAbort: (boolean|undefined)
 * }}
 */
Wasm2Lang.Options.Schema.UserOptions;

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
  mangler: null,
  outFile: null,
  preNormalized: false,
  disabledPasses: [],
  trapSites: false,
  trapSiteIds: true,
  trapHostAbort: false
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
 * Builds a parser for the common last-value option shape: the last supplied
 * value wins ({@code --opt a --opt b} keeps {@code b}), and a bare flag with
 * no value either stores {@code opt_bareValue} (when given, which may be the
 * empty string) or leaves the option untouched.
 *
 * @private
 * @param {function(!Wasm2Lang.Options.Schema.NormalizedOptions, string): void} setFn
 * @param {string=} opt_bareValue
 * @return {function(!Wasm2Lang.Options.Schema.NormalizedOptions, !Array<string>): void}
 */
Wasm2Lang.Options.Schema.makeLastValueParser_ = function (setFn, opt_bareValue) {
  return function (/** !Wasm2Lang.Options.Schema.NormalizedOptions */ options, /** !Array<string> */ strs) {
    if (0 === strs.length) {
      if (void 0 !== opt_bareValue) {
        setFn(options, opt_bareValue);
      }
      return;
    }
    setFn(options, strs[strs.length - 1]);
  };
};

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
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = strs.length; i !== len; ++i) {
    var /** @const {!Array<string>} */ parts = strs[i].split('=', 2);
    options.definitions[parts[0]] = 1 !== parts.length ? parts[1] : '';
  }
};

Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.INPUT_DATA] =
  Wasm2Lang.Options.Schema.makeLastValueParser_(
    /** @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options @param {string} value */
    function (options, value) {
      options.inputData = value;
    }
  );

Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.INPUT_FILE] =
  Wasm2Lang.Options.Schema.makeLastValueParser_(
    /** @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options @param {string} value */
    function (options, value) {
      options.inputFile = value;
    }
  );

Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.EMIT_METADATA] =
  Wasm2Lang.Options.Schema.makeLastValueParser_(
    /** @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options @param {string} value */
    function (options, value) {
      options.emitMetadata = value;
    },
    'metadata'
  );

Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.EMIT_CODE] =
  Wasm2Lang.Options.Schema.makeLastValueParser_(
    /** @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options @param {string} value */
    function (options, value) {
      options.emitCode = value;
    },
    'code'
  );

Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.EMIT_WEBASSEMBLY] =
  Wasm2Lang.Options.Schema.makeLastValueParser_(
    /** @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options @param {string} value */
    function (options, value) {
      options.emitWebAssembly = value;
    },
    ''
  );

Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.MANGLER] =
  Wasm2Lang.Options.Schema.makeLastValueParser_(
    /** @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options @param {string} value */
    function (options, value) {
      options.mangler = value;
    }
  );

Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.OUT_FILE] =
  Wasm2Lang.Options.Schema.makeLastValueParser_(
    /** @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options @param {string} value */
    function (options, value) {
      options.outFile = value;
    }
  );

/**
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Array<string>} strs
 */
Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.PRE_NORMALIZED] = function (options, strs) {
  options.preNormalized = true;
};

/**
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Array<string>} strs
 */
Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.DISABLE_PASS] = function (options, strs) {
  var /** @const {!Array<string>} */ collected = [];
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = strs.length; i !== len; ++i) {
    var /** @const {!Array<string>} */ parts = strs[i].split(',');
    for (var /** @type {number} */ j = 0, /** @const {number} */ partLen = parts.length; j !== partLen; ++j) {
      var /** @const {string} */ trimmed = parts[j].trim();
      if ('' !== trimmed) {
        collected.push(trimmed);
      }
    }
  }
  options.disabledPasses = collected;
};

/**
 * Parses {@code --trap-sites[=<mode>[,<modifier>…]]}.
 *
 * The value is a comma-separated list because the payload mode and the abort
 * shape are independent choices: {@code full} vs {@code kind} decides what the
 * host hook receives, {@code host-abort} decides what — if anything — the
 * emitted code does after calling it.  Every combination is meaningful, so a
 * single enum would have needed one name per product.
 *
 * {@code full} (the default, and what a bare {@code --trap-sites} means) hands
 * the host {@code (kind, siteId)} and writes the side-car table.  {@code kind}
 * drops the id and the table and passes {@code (kind)} alone: the same nine
 * frozen constants, no per-site bookkeeping, nothing to ship alongside the
 * module.  It exists because full mode is too heavy to leave in a delivered
 * build, which leaves a crash at a user's machine completely mute — the only
 * case that actually matters for a product.
 *
 * {@code host-abort} makes stopping the program entirely the host's job on the
 * asm.js backend: the hook call is emitted and nothing follows it, so the
 * module contains no self-recursive {@code $w2l_abort}.  It exists for
 * consumers whose delivery pipeline validates the artifact's call graph and
 * rejects any cycle, self-loop included — a policy that makes the default
 * abort unshippable and therefore makes {@code --trap-sites} unusable in
 * either mode.  It buys that at a real price, documented at
 * {@code renderTrapAbortStatement_}: a host that returns instead of throwing
 * resumes the caller on a fabricated value.
 *
 * An unrecognised value is an error rather than a silent fallback: the
 * fallback would be {@code full}, so a typo in a release build would quietly
 * ship the heavier mode AND a table.  This also turns the documented
 * bare-flag-swallows-the-next-token trap ({@code --trap-sites in.wasm}) from a
 * confusing "No input data provided" into a message that names the real
 * mistake.
 *
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Array<string>} strs
 */
Wasm2Lang.Options.Schema.optionParsers[Wasm2Lang.Options.Schema.OptionKey.TRAP_SITES] = function (options, strs) {
  options.trapSites = true;
  options.trapSiteIds = true;
  options.trapHostAbort = false;
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = strs.length; i !== len; ++i) {
    var /** @const {!Array<string>} */ parts = strs[i].split(',');
    for (var /** @type {number} */ j = 0, /** @const {number} */ pLen = parts.length; j !== pLen; ++j) {
      var /** @const {string} */ mode = parts[j].trim().toLowerCase();
      if ('' === mode || 'full' === mode) continue;
      if ('kind' === mode) {
        options.trapSiteIds = false;
        continue;
      }
      if ('host-abort' === mode) {
        options.trapHostAbort = true;
        continue;
      }
      throw new Error(
        'Unrecognized --trap-sites value: "' +
          parts[j] +
          '". Expected a comma-separated list of "full" (default) or "kind", optionally with ' +
          '"host-abort". Note that a bare --trap-sites swallows the next token unless that token ' +
          'starts with a double dash, so place it before another option or last on the line, ' +
          'never immediately before a positional path.'
      );
    }
  }
};

/**
 * @const {!Object<!Wasm2Lang.Options.Schema.OptionKey, {optionDesc: string}>}
 */
Wasm2Lang.Options.Schema.optionSchema = {
  'languageOut': {
    optionDesc: 'Selects the output backend language to generate.'
  },
  'normalizeWasm': {
    optionDesc:
      'Comma-separated list of normalization bundles to apply before code generation (e.g. "binaryen:min,wasm2lang:codegen").'
  },
  'define': {
    optionDesc: 'Defines a compile-time constant (repeatable), e.g. -DNAME=VALUE (VALUE may be string/number/boolean).'
  },
  'inputData': {
    optionDesc: 'Input WebAssembly contents to compile (binary buffer or text string).'
  },
  'inputFile': {
    optionDesc: 'CLI-only: path to a WebAssembly file to load into inputData (\".wat\"/\".wast\" read as text).'
  },
  'emitMetadata': {
    optionDesc:
      'When set, emits the memory buffer as a named field/variable (e.g. --emit-metadata mybuffer => var mybuffer = metadata). Can be used together with --emit-code.'
  },
  'emitCode': {
    optionDesc:
      'When set, emits the generated code as a named field/variable (e.g. --emit-code asmjs => var asmjs = code). Can be used together with --emit-metadata.'
  },
  'emitWebAssembly': {
    optionDesc:
      'Emits the (normalized) WebAssembly module to stdout. Defaults to binary; use "text" to emit the text format instead.'
  },
  'mangler': {
    optionDesc:
      'Enables deterministic keyed identifier mangling for generated output. Internal identifiers are replaced with short, opaque names derived from the given key. Same key produces identical output; different keys produce different names.'
  },
  'outFile': {
    optionDesc: 'Writes output to the specified file instead of stdout.'
  },
  'preNormalized': {
    optionDesc:
      'Indicates the input was already normalized by wasm2lang:codegen. Enables IR-based structural detection of simplified loops and control flow patterns whose label hints were lost during binary serialization.'
  },
  'disablePass': {
    optionDesc:
      'Disables one or more wasm2lang:codegen normalization passes by name (comma-separated, repeatable). Pass names match the registry entries, e.g. IfElseRecovery, BlockGuardElision, LoopSimplification.'
  },

  'trapSites': {
    optionDesc:
      'Makes traps diagnosable. --trap-sites (or =full) gives every trap site a module-unique id, calls the host hook as $w2l_trap(kind, siteId) before aborting unconditionally, and writes a <out-file>.traps.json table mapping each surviving id to its kind, function and emitted symbol. --trap-sites=kind is the release-weight variant: $w2l_trap(kind) only, no ids and no table, so a shipped crash is still classifiable (divide by zero vs violated engine invariant) without an artifact to distribute. Both modes add the divide-by-zero / overflow checks that the plain output omits. Append ,host-abort (e.g. --trap-sites=full,host-abort) to emit nothing after the hook on the asmjs backend, which removes the self-recursive $w2l_abort helper for consumers whose artifact validation rejects call-graph cycles; the host then owns stopping the program entirely, and one that returns instead of throwing resumes the caller on a fabricated value. Off by default; when off the emitted code is byte-identical to a build without this flag.'
  }
};
