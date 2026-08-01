'use strict';

/**
 * @const
 */
Wasm2Lang.Utilities.Environment = {};

/**
 * @private
 * @param {!IArrayLike<*>} args
 * @param {number} startIndex
 * @return {!Array<*>}
 */
Wasm2Lang.Utilities.Environment.sliceArgs_ = function (args, startIndex) {
  return Array.prototype.slice.call(args, startIndex);
};

/**
 * @private
 * @param {!NodeWritableStream} stream
 * @param {!IArrayLike<(string|!Uint8Array)>} args
 * @param {number} startIndex
 * @return {void}
 */
Wasm2Lang.Utilities.Environment.writeCliChunks_ = function (stream, args, startIndex) {
  for (var /** @type {number} */ i = startIndex, /** @const {number} */ argCount = args.length; i !== argCount; ++i) {
    if (i !== startIndex) {
      stream.write(' ');
    }
    var /** @const {(string|!Uint8Array)} */ chunk = args[i];
    stream.write(chunk instanceof Uint8Array ? Buffer.from(/** @type {!Uint8Array} */ (chunk)) : /** @type {string} */ (chunk));
  }
};

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
    Wasm2Lang.Utilities.Environment.sliceArgs_(arguments, 1)
  );
  console.error.apply(console, [level, ':'].concat(dataArgs));
};

/**
 * @param {!Wasm2Lang.Utilities.Environment.LogLevel} level
 * @param {...(string|!Uint8Array)} data
 * @return {void}
 */
Wasm2Lang.Utilities.Environment.stderrWriters[Wasm2Lang.Utilities.Environment.OutputTarget.CLI] = function (level, data) {
  Wasm2Lang.Utilities.Environment.writeCliChunks_(process.stderr, arguments, 1);
  process.stderr.write('\n');
};

/**
 * @return {!Wasm2Lang.Utilities.Environment.OutputTarget}
 */
Wasm2Lang.Utilities.Environment.isNode = function () {
  if (
    'object' === typeof process &&
    process &&
    'object' === typeof process.versions &&
    process.versions &&
    'string' === typeof process.versions.node
  ) {
    return Wasm2Lang.Utilities.Environment.OutputTarget.CLI;
  }

  return Wasm2Lang.Utilities.Environment.OutputTarget.WEB;
};
