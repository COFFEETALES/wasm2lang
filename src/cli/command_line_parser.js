'use strict';

/**
 * @const
 */
Wasm2Lang.CLI.CommandLineParser = {};

/**
 * @private
 * @param {!Object<string, !Array<string>>} parsedParams
 * @param {string} optionName
 * @return {!Array<string>}
 */
Wasm2Lang.CLI.CommandLineParser.ensureParamList_ = function (parsedParams, optionName) {
  if ('object' !== typeof parsedParams[optionName]) {
    parsedParams[optionName] = [];
  }
  return parsedParams[optionName];
};

/**
 * The single spelling of the camelCase-schema-key to CLI-flag mapping
 * ({@code emitWebAssembly} -> {@code --emit-web-assembly}).  Also used by
 * {@code Wasm2Lang.Processor.writeCliHelp_} so the help text always displays
 * exactly the flag {@code processParams} accepts — a second regex would let
 * the two drift apart silently.
 *
 * @param {string} key
 * @return {string}
 */
Wasm2Lang.CLI.CommandLineParser.optionKeyToCliKey = function (key) {
  return '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
};

/**
 * @private
 * @param {string} inputFile
 * @return {(string|!Uint8Array)}
 */
Wasm2Lang.CLI.CommandLineParser.readInputFile_ = function (inputFile) {
  // prettier-ignore
  var /** @const {!NodeFileSystem} */ fs = /** @const {!NodeFileSystem} */ (require('fs'));
  var /** @type {boolean} */ isTextFile = false;
  var /** @type {string|number} */ readTarget = inputFile;
  if (/^(?:was??t:(?!$)|.*?\.was??t$)/i.test(inputFile)) {
    readTarget = inputFile.replace(/^was??t:/i, '');
    isTextFile = true;
  }
  if ('-' === readTarget) {
    readTarget = 0;
  }
  return fs.readFileSync(readTarget, isTextFile ? {encoding: 'utf8'} : void 0);
};

/**
 * @private
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Object<string, !Array<string>>} params
 * @return {void}
 */
Wasm2Lang.CLI.CommandLineParser.assignInputData_ = function (options, params) {
  if ('object' === typeof params['--input-data']) {
    var /** @const {!Array<string>} */ inputDataParam = params['--input-data'];
    if (0 !== inputDataParam.length) {
      options.inputData = inputDataParam.join('\n');
    }
    return;
  }

  if ('object' !== typeof params['--input-file']) {
    return;
  }

  var /** @const {!Array<string>} */ inputFileParam = params['--input-file'];
  if (0 === inputFileParam.length) {
    return;
  }
  options.inputData = Wasm2Lang.CLI.CommandLineParser.readInputFile_(inputFileParam[inputFileParam.length - 1]);
};

/**
 * @return {!Object<string, !Array<string>>}
 */
Wasm2Lang.CLI.CommandLineParser.parseArgv = function () {
  var /** @const {number} */ argvCount = process.argv.length;
  var /** @const {!RegExp} */ optionWithValuePattern = /^(--[\w-]+)(?:[=:])(.*?)$/;
  var /** @type {string} */ pendingOptionName = '';
  var /** @const {!Object<string, !Array<string>>} */ parsedParams = Object.create(null);

  for (var /** @type {number} */ argIndex = 2; argIndex !== argvCount; ++argIndex) {
    var /** @const {string} */ currentArg = process.argv[argIndex];
    if ('--' === currentArg.substring(0, 2)) {
      if (2 === currentArg.length) {
        break;
      }
      pendingOptionName = '';
      var /** @const {?RegExpResult} */ optionMatch = currentArg.match(optionWithValuePattern);
      var /** @const {string} */ optionName = optionMatch ? optionMatch[1] : currentArg;
      var /** @const {!Array<string>} */ optionValues = Wasm2Lang.CLI.CommandLineParser.ensureParamList_(
          parsedParams,
          optionName
        );
      if (optionMatch) {
        optionValues.push(optionMatch[2]);
        continue;
      }
      pendingOptionName = currentArg;
    } else if ('' !== pendingOptionName) {
      parsedParams[pendingOptionName][parsedParams[pendingOptionName].length] = currentArg;
      pendingOptionName = '';
    } else {
      var /** @type {!Array<string>|void} */ inputFiles = parsedParams['--input-file'];
      if ('object' !== typeof inputFiles) {
        parsedParams['--input-file'] = [currentArg];
        continue;
      }
      throw new Error(['Unrecognized argument: ', currentArg, '.'].join(''));
    }
  }
  return parsedParams;
};

/**
 * @param {!Object<string, !Array<string>>} params
 * @return {!Wasm2Lang.Options.Schema.NormalizedOptions}
 */
Wasm2Lang.CLI.CommandLineParser.processParams = function (params) {
  // prettier-ignore
  var /** @const {!Wasm2Lang.Options.Schema.NormalizedOptions} */ options = /** @const {!Wasm2Lang.Options.Schema.NormalizedOptions} */ (
    Object.assign({}, Wasm2Lang.Options.Schema.defaultOptions)
  );
  // Object.assign is shallow, so without this line {@code options.definitions}
  // would alias {@code Schema.defaultOptions.definitions} and the DEFINE
  // parser's in-place writes would permanently pollute the shared default
  // object for the rest of the process.  The other container fields
  // (normalizeWasm, disabledPasses) are safe as-is: their parsers reassign a
  // fresh array instead of mutating.
  options.definitions = /** @type {!Object<string, string>} */ (Object.create(null));
  var /** @const {!Wasm2Lang.Utilities.Environment.OutputTarget} */ outputTarget = Wasm2Lang.Utilities.Environment.isNode();

  /** @const {!Array<!Wasm2Lang.Options.Schema.OptionKey>} */
  var props = Object.keys(Wasm2Lang.Options.Schema.optionSchema);

  // Reject unknown options before anything else: parseArgv stores ANY --flag
  // it sees, and the schema loop below only ever looks up recognized
  // spellings, so a typo'd option (--managler, --language-outt) used to be
  // dropped silently and ship a default-configured build.  Checked before the
  // input probe so a misspelled --input-file names the real mistake instead of
  // surfacing as "No input data provided", and before any file is read.
  var /** @const {!Object<string, boolean>} */ recognizedCliKeys = /** @type {!Object<string, boolean>} */ (
      Object.create(null)
    );
  // Non-schema options that legitimately appear in argv: --dev is consumed by
  // the wasm2lang.js launcher but stays visible here, and --help
  // short-circuits in runCliEntryPoint before this function runs.
  recognizedCliKeys['--dev'] = true;
  recognizedCliKeys['--help'] = true;
  for (var /** @type {number} */ ri = 0, /** @const {number} */ rLen = props.length; ri !== rLen; ++ri) {
    recognizedCliKeys[Wasm2Lang.CLI.CommandLineParser.optionKeyToCliKey(props[ri])] = true;
  }
  var /** @const {!Array<string>} */ unknownOptions = [];
  for (var /** @type {string} */ optionName in params) {
    if (!recognizedCliKeys[optionName]) {
      unknownOptions.push(optionName);
    }
  }
  if (0 !== unknownOptions.length) {
    throw new Error(
      'Unrecognized option(s): ' +
        unknownOptions.join(', ') +
        '. Run --help for the supported options. Note that a bare --option swallows the next token as its ' +
        'value unless that token starts with a double dash, so a mistyped option can also hide the argument ' +
        'that followed it.'
    );
  }

  Wasm2Lang.CLI.CommandLineParser.assignInputData_(options, params);

  if (!options.inputData) {
    throw new Error('No input data provided. Use --input-data or --input-file to specify input.');
  }

  for (var /** @type {number} */ i = 0, /** @const {number} */ len = props.length; i !== len; ++i) {
    var /** @const {!Wasm2Lang.Options.Schema.OptionKey} */ key = props[i];
    var /** @const {string} */ cliKey = Wasm2Lang.CLI.CommandLineParser.optionKeyToCliKey(key);
    var /** @type {!Array<string>|void} */ optionValues = params[cliKey];
    if ('object' === typeof optionValues) {
      Wasm2Lang.Options.Schema.optionParsers[key](options, optionValues);
      Wasm2Lang.Utilities.Environment.stderrWriters[outputTarget](
        Wasm2Lang.Utilities.Environment.LogLevel.INFO,
        'Processing CLI option:',
        cliKey,
        '(',
        key,
        ') ',
        'with value:',
        optionValues.join(' ')
      );
    }
  }

  return options;
};
