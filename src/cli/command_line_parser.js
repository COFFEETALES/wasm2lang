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
 * @private
 * @param {string} key
 * @return {string}
 */
Wasm2Lang.CLI.CommandLineParser.optionKeyToCliKey_ = function (key) {
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
  var /** string */ pendingOptionName = '';
  var /** @const {!Object<string, !Array<string>>} */ parsedParams = Object.create(null);

  for (var /** number */ argIndex = 2; argIndex !== argvCount; ++argIndex) {
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
        optionValues[optionValues.length] = optionMatch[2];
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
  var /** @const {!Wasm2Lang.Utilities.Environment.OutputTarget} */ outputTarget = Wasm2Lang.Utilities.Environment.isNode();

  Wasm2Lang.CLI.CommandLineParser.assignInputData_(options, params);

  if (!options.inputData) {
    throw new Error('No input data provided. Use --input-data or --input-file to specify input.');
  }

  /** @const {!Array<!Wasm2Lang.Options.Schema.OptionKey>} */
  var props = Object.keys(Wasm2Lang.Options.Schema.optionSchema);

  for (var /** number */ i = 0, /** @const {number} */ len = props.length; i !== len; ++i) {
    var /** @const {!Wasm2Lang.Options.Schema.OptionKey} */ key = props[i];
    var /** @const {string} */ cliKey = Wasm2Lang.CLI.CommandLineParser.optionKeyToCliKey_(key);
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
