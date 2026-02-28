'use strict';

/**
 * @const
 */
Wasm2Lang.Utilities.Environment = {};

/**
 * @enum {number}
 */
Wasm2Lang.Utilities.Environment.OutputTarget = {
  WEB: 0,
  CLI: 1
};

/**
 * @enum {number}
 */
Wasm2Lang.Utilities.Environment.LogLevel = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  TRACE: 5
};

/**
 * @const {
 *  !Object<
 *    number,
 *    function(...(string|!Uint8Array)): void
 *  >
 * }
 */
Wasm2Lang.Utilities.Environment.stdoutWriters = Object.create(null);

/**
 * @param {...(string|!Uint8Array)} data
 * @return {void}
 */
Wasm2Lang.Utilities.Environment.stdoutWriters[Wasm2Lang.Utilities.Environment.OutputTarget.WEB] = function (data) {
  // prettier-ignore
  var dataArgs = /** @const {!Array<(string|!Uint8Array)>} */ (
    Array.prototype.slice.call(arguments, 0)
  );
  console.log.apply(console, dataArgs);
};

/**
 * @param {...(string|!Uint8Array)} data
 * @return {void}
 */
Wasm2Lang.Utilities.Environment.stdoutWriters[Wasm2Lang.Utilities.Environment.OutputTarget.CLI] = function (data) {
  var /** @const {number} */ argCount = arguments.length;
  var /** boolean */ binaryOnly = true;
  for (var /** number */ i = 0; i !== argCount; ++i) {
    if (0 !== i) {
      process.stdout.write(' ');
    }
    var /** @const {(string|!Uint8Array)} */ chunk = arguments[i];
    if ('object' === typeof chunk) {
      process.stdout.write(Buffer.from(chunk));
      continue;
    }
    binaryOnly = false;
    process.stdout.write(chunk);
  }
  if (!binaryOnly) {
    process.stdout.write('\n');
  }
};

/**
 * @const {
 *  !Object<
 *    number,
 *    function(!Wasm2Lang.Utilities.Environment.LogLevel, ...(string|!Uint8Array)): void
 *  >
 * }
 */
Wasm2Lang.Utilities.Environment.stderrWriters = Object.create(null);

/**
 * @param {!Wasm2Lang.Utilities.Environment.LogLevel} level
 * @param {...(string|!Uint8Array)} data
 * @return {void}
 */
Wasm2Lang.Utilities.Environment.stderrWriters[Wasm2Lang.Utilities.Environment.OutputTarget.WEB] = function (level, data) {
  // prettier-ignore
  var dataArgs = /** @const {!Array<(string|!Uint8Array)>} */ (
    Array.prototype.slice.call(arguments, 1)
  );
  console.error.apply(console, [level, ':'].concat(dataArgs));
};

/**
 * @param {!Wasm2Lang.Utilities.Environment.LogLevel} level
 * @param {...(string|!Uint8Array)} data
 * @return {void}
 */
Wasm2Lang.Utilities.Environment.stderrWriters[Wasm2Lang.Utilities.Environment.OutputTarget.CLI] = function (level, data) {
  var /** @const {number} */ argCount = arguments.length;
  for (var /** number */ i = 1; i !== argCount; ++i) {
    if (1 !== i) {
      process.stderr.write(' ');
    }
    var /** @const {(string|!Uint8Array)} */ chunk = arguments[i];
    if (chunk instanceof Uint8Array) {
      process.stderr.write(Buffer.from(chunk));
      continue;
    }
    process.stderr.write(chunk);
  }
  process.stderr.write('\n');
};

/**
 * @return {!Wasm2Lang.Utilities.Environment.OutputTarget}
 */
Wasm2Lang.Utilities.Environment.isNode = function () {
  if (
    Boolean(
      'object' === typeof process &&
      process &&
      'object' === typeof process.versions &&
      process.versions &&
      'string' === typeof process.versions.node
    )
  ) {
    return Wasm2Lang.Utilities.Environment.OutputTarget.CLI;
  }

  return Wasm2Lang.Utilities.Environment.OutputTarget.WEB;
};

///**
// * @private
// * @return {boolean}
// */
//Wasm2Lang.Processor.isWorker_ = function () {
//  return Boolean('function' === typeof importScripts);
//};

///**
// * @private
// * @return {boolean}
// */
//Wasm2Lang.Processor.isBrowser_ = function () {
//  return Boolean(!Wasm2Lang.Processor.isWorker() && 'object' === typeof window && window);
//};
