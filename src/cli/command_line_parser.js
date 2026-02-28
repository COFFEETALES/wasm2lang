'use strict';

/**
 * @const
 */
Wasm2Lang.CLI.CommandLineParser = {};

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
      if ('object' !== typeof parsedParams[optionName]) {
        parsedParams[optionName] = [];
      }
      if (optionMatch) {
        parsedParams[optionName].push(optionMatch[2]);
        continue;
      }
      pendingOptionName = currentArg;
    } else if ('' !== pendingOptionName) {
      parsedParams[pendingOptionName].push(currentArg);
      pendingOptionName = '';
    } else {
      if ('object' !== typeof parsedParams['--input-file']) {
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

  if ('object' === typeof params['--input-data']) {
    var /** @const {!Array<string>} */ inputDataParm = params['--input-data'];
    if (0 !== inputDataParm.length) {
      options.inputData = inputDataParm.join('\n');
    }
  } else if ('object' === typeof params['--input-file']) {
    var /** @const {!Array<string>} */ inputFileParm = params['--input-file'];
    if (0 !== inputFileParm.length) {
      // prettier-ignore
      var /** @const {!NodeFileSystem} */ fs = /** @const {!NodeFileSystem} */ (require('fs'));
      var /** @type {string} */ inputFile = inputFileParm[inputFileParm.length - 1];
      var /** @type {boolean} */ isTextFile = false;
      if (/^(?:was??t:(?!$)|.*?\.was??t$)/i.test(inputFile)) {
        inputFile = inputFile.replace(/^was??t:/i, '');
        isTextFile = true;
      }
      options.inputData = fs.readFileSync('-' === inputFile ? 0 : inputFile, isTextFile ? {encoding: 'utf8'} : void 0);
    }
  }

  if (!options.inputData) {
    throw new Error('No input data provided. Use --input-data or --input-file to specify input.');
  }

  /** @const {!Array<!Wasm2Lang.Options.Schema.OptionKey>} */
  var props = Object.keys(Wasm2Lang.Options.Schema.optionSchema);

  for (var /** number */ i = 0, /** @const {number} */ len = props.length; i !== len; ++i) {
    var /** @const {!Wasm2Lang.Options.Schema.OptionKey} */ key = props[i];
    var /** @const {string} */ cliKey = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
    if ('object' === typeof params[cliKey]) {
      Wasm2Lang.Options.Schema.optionParsers[key](options, params[cliKey]);
      Wasm2Lang.Utilities.Environment.stderrWriters[Wasm2Lang.Utilities.Environment.isNode()](
        Wasm2Lang.Utilities.Environment.LogLevel.INFO,
        'Processing CLI option:',
        cliKey,
        '(',
        key,
        ') ',
        'with value:',
        params[cliKey].join(' ')
      );
    }
  }

  return options;
};
