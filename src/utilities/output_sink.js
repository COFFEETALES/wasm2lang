'use strict';

// ---------------------------------------------------------------------------
// Typedefs.
// ---------------------------------------------------------------------------

/**
 * A resolved output chunk — a string or a byte array.
 *
 * @typedef {(string|!Uint8Array)}
 */
Wasm2Lang.OutputSink.Chunk;

/**
 * An entry in a chunk array — may be resolved or a pending Promise.
 *
 * @typedef {(!Wasm2Lang.OutputSink.Chunk|!Promise<!Wasm2Lang.OutputSink.Chunk>)}
 */
Wasm2Lang.OutputSink.ChunkEntry;

/**
 * A function that consumes one resolved chunk.
 *
 * @typedef {function(!Wasm2Lang.OutputSink.Chunk): void}
 */
Wasm2Lang.OutputSink.WriteFn;

// ---------------------------------------------------------------------------
// Serial drain.
// ---------------------------------------------------------------------------

/**
 * Continues draining {@code chunks} through {@code writeFn} starting at
 * index {@code startIndex}, using {@code Promise.then()} chaining for
 * every remaining entry.
 *
 * @private
 * @param {!Array<!Wasm2Lang.OutputSink.ChunkEntry>} chunks
 * @param {!Wasm2Lang.OutputSink.WriteFn} writeFn
 * @param {number} startIndex
 * @return {!Promise<void>}
 */
Wasm2Lang.OutputSink.drainAsync_ = function (chunks, writeFn, startIndex) {
  /**
   * Resolves one chunk and advances to the next.
   *
   * @param {number} idx
   * @return {!Promise<void>}
   */
  function step(idx) {
    if (idx >= chunks.length) {
      return Promise.resolve(void 0);
    }
    var /** @const {*} */ chunk = chunks[idx];
    if (chunk instanceof Promise) {
      return /** @type {!Promise<!Wasm2Lang.OutputSink.Chunk>} */ (chunk).then(
        /** @param {!Wasm2Lang.OutputSink.Chunk} resolved @return {!Promise<void>} */
        function (resolved) {
          writeFn(resolved);
          return step(idx + 1);
        }
      );
    }
    writeFn(/** @type {!Wasm2Lang.OutputSink.Chunk} */ (chunk));
    return step(idx + 1);
  }

  return step(startIndex);
};

/**
 * Drains an ordered array of chunks through a write function.
 *
 * Runs synchronously as long as every chunk is a resolved value.  The
 * moment a thenable/Promise chunk is encountered, the function switches
 * to {@code Promise.then()} chaining and returns a Promise that settles
 * when all chunks have been consumed.
 *
 * @param {!Array<!Wasm2Lang.OutputSink.ChunkEntry>} chunks
 * @param {!Wasm2Lang.OutputSink.WriteFn} writeFn
 * @return {!Promise<void>|void}
 */
Wasm2Lang.OutputSink.drainChunks = function (chunks, writeFn) {
  for (var /** number */ i = 0, /** @const {number} */ len = chunks.length; i !== len; ++i) {
    var /** @const {*} */ chunk = chunks[i];
    if (chunk instanceof Promise) {
      return Wasm2Lang.OutputSink.drainAsync_(chunks, writeFn, i);
    }
    writeFn(/** @type {!Wasm2Lang.OutputSink.Chunk} */ (chunk));
  }
  return void 0;
};

// ---------------------------------------------------------------------------
// Chunk utilities.
// ---------------------------------------------------------------------------

/**
 * Given an array of string parts, returns a new array with {@code '\\n'}
 * separators interleaved between each element — the chunked equivalent of
 * {@code parts.join('\\n')}.
 *
 * @param {!Array<string>} parts
 * @return {!Array<!Wasm2Lang.OutputSink.ChunkEntry>}
 */
Wasm2Lang.OutputSink.interleaveNewlines = function (parts) {
  /** @type {!Array<!Wasm2Lang.OutputSink.ChunkEntry>} */
  var result = [];
  for (var /** number */ i = 0, /** @const {number} */ len = parts.length; i !== len; ++i) {
    if (i > 0) {
      result[result.length] = '\n';
    }
    result[result.length] = parts[i];
  }
  return result;
};

// ---------------------------------------------------------------------------
// Sink factories.
// ---------------------------------------------------------------------------

/**
 * Creates a write function that sends resolved chunks to the standard
 * output stream.  On Node.js this writes directly to {@code process.stdout};
 * in a browser environment it falls back to {@code console.log}.
 *
 * @return {!Wasm2Lang.OutputSink.WriteFn}
 */
Wasm2Lang.OutputSink.createStdoutSink = function () {
  if (Wasm2Lang.Utilities.Environment.isNode()) {
    return /** @type {!Wasm2Lang.OutputSink.WriteFn} */ (
      /** @param {!Wasm2Lang.OutputSink.Chunk} chunk */ function (chunk) {
        if (chunk instanceof Uint8Array) {
          process.stdout.write(Buffer.from(/** @type {!Uint8Array} */ (chunk)));
        } else {
          process.stdout.write(/** @type {string} */ (chunk));
        }
      }
    );
  }
  return /** @type {!Wasm2Lang.OutputSink.WriteFn} */ (
    /** @param {!Wasm2Lang.OutputSink.Chunk} chunk */ function (chunk) {
      console.log(chunk);
    }
  );
};
