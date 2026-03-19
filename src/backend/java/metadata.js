'use strict';

/**
 * Emits Java IntBuffer init lines using the shared
 * {@code collectI32InitOps_} classification.
 *
 * @param {!Int32Array} i32
 * @param {number} startWordIndex
 * @param {string} ibVar  IntBuffer variable name, e.g. '$ib'.
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitStaticI32InitLines_ = function (i32, startWordIndex, ibVar) {
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.I32InitOp_>} */ ops = this.collectI32InitOps_(i32, startWordIndex);
  var /** @const {!Array<string>} */ lines = [];

  for (var /** number */ i = 0, /** @const {number} */ opsLen = ops.length; i !== opsLen; ++i) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.I32InitOp_} */ op = ops[i];
    var /** @const {string} */ opKind = op.opKind;
    var /** @const {number} */ wordIndex = op.startWordIndex;

    if ('fill' === opKind) {
      var /** @const {number} */ value = op.fillValueI32;
      var /** @const {number} */ count = op.fillCountWords;
      lines[lines.length] =
        'for (int $i = 0; $i < ' + count + '; ++$i) ' + ibVar + '.put(' + wordIndex + ' + $i, ' + String(value) + ');';
    } else {
      var /** @const {!Array<number>} */ words = op.setWordsI32;
      for (var /** number */ j = 0, /** @const {number} */ wLen = words.length; j !== wLen; ++j) {
        lines[lines.length] = ibVar + '.put(' + (wordIndex + j) + ', ' + String(words[j]) + ');';
      }
    }
  }

  return lines;
};

/**
 * Emits the static memory block as a Java snippet declaring a
 * {@code java.nio.ByteBuffer} (little-endian) and initializing it via an
 * {@code IntBuffer} view.
 *
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitMetadata = function (wasmModule, options) {
  var /** @const {string} */ bufferName = /** @type {string} */ (options.emitMetadata);
  var /** @const {number} */ heapSize = this.resolveHeapSize_(options, 'JAVA_HEAP_SIZE', 65536);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_} */ staticMemory = this.collectStaticMemory_(wasmModule);
  var /** @const {number} */ startWordIndex = staticMemory.startWordIndex;
  var /** @const {!Int32Array} */ i32 = staticMemory.words;
  var /** @const {!Array<string>} */ lines = [];

  lines[lines.length] =
    'java.nio.ByteBuffer ' +
    bufferName +
    ' = java.nio.ByteBuffer.allocate(' +
    heapSize +
    ').order(java.nio.ByteOrder.LITTLE_ENDIAN);';

  if (0 !== i32.length) {
    var /** @const {!Array<string>} */ initLines = this.emitStaticI32InitLines_(i32, startWordIndex, '$ib');
    if (0 !== initLines.length) {
      lines[lines.length] = 'java.nio.IntBuffer $ib = ' + bufferName + '.asIntBuffer();';
      for (var /** number */ ii = 0, /** @const {number} */ initLinesCount = initLines.length; ii !== initLinesCount; ++ii) {
        lines[lines.length] = initLines[ii];
      }
    }
  }

  return lines.join('\n');
};
