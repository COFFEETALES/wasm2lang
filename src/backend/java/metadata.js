'use strict';

/**
 * Formats a 64-bit value (given as two unsigned 32-bit halves) as a Java
 * {@code long} hex literal.
 *
 * @private
 * @param {number} lowUnsigned   Low 32 bits (unsigned, 0..0xFFFFFFFF).
 * @param {number} highUnsigned  High 32 bits (unsigned, 0..0xFFFFFFFF).
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.formatJavaI64Literal_ = function (lowUnsigned, highUnsigned) {
  if (0 === highUnsigned) {
    return 0 === lowUnsigned ? '0L' : String(lowUnsigned) + 'L';
  }
  var /** @const {string} */ hexHigh = highUnsigned.toString(16);
  var /** @const {string} */ hexLow = ('00000000' + lowUnsigned.toString(16)).slice(-8);
  return '0x' + hexHigh + hexLow + 'L';
};

/**
 * Emits Java ByteBuffer init lines using 64-bit {@code putLong()} calls
 * with {@code putInt()} fallback for odd leading/trailing words.
 *
 * @param {!Int32Array} i32
 * @param {number} startWordIndex
 * @param {string} bbVar  ByteBuffer variable name.
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitStaticI64InitLines_ = function (i32, startWordIndex, bbVar) {
  var /** @const {!Array<string>} */ lines = [];
  var /** @const {number} */ wordCount = i32.length;
  var /** @const */ fmt = Wasm2Lang.Backend.JavaCodegen.formatJavaI64Literal_;
  var /** @const {number} */ fillThreshold = 8;
  var /** @type {number} */ pos = 0;

  // Handle leading odd word (startWordIndex is odd).
  if (startWordIndex & 1) {
    if (pos < wordCount && 0 !== i32[pos]) {
      lines[lines.length] = bbVar + '.putInt(' + startWordIndex * 4 + ', ' + String(i32[pos]) + ');';
    }
    pos = 1;
  }

  // Compute pair range.
  var /** @const {number} */ remaining = wordCount - pos;
  var /** @const {number} */ pairEnd = pos + remaining - (remaining % 2);

  // Main i64 loop over pairs [pos, pairEnd) stepping by 2.
  while (pos < pairEnd) {
    var /** @const {number} */ lowSigned = i32[pos];
    var /** @const {number} */ highSigned = i32[pos + 1];

    // Skip zero pairs.
    if (0 === lowSigned && 0 === highSigned) {
      pos += 2;
      continue;
    }

    // Check for fill: count consecutive identical pairs.
    var /** @type {number} */ fillEnd = pos + 2;
    while (fillEnd + 1 < pairEnd && i32[fillEnd] === lowSigned && i32[fillEnd + 1] === highSigned) {
      fillEnd += 2;
    }
    var /** @const {number} */ pairCount = (fillEnd - pos) >>> 1;

    if (pairCount >= fillThreshold) {
      var /** @const {number} */ fillByte = (startWordIndex + pos) * 4;
      var /** @const {string} */ fillLit = fmt(lowSigned >>> 0, highSigned >>> 0);
      lines[lines.length] =
        'for (int $i = 0; $i < ' + pairCount + '; ++$i) ' + bbVar + '.putLong(' + fillByte + ' + $i * 8, ' + fillLit + ');';
      pos = fillEnd;
      continue;
    }

    // Set: emit individual putLong calls until zero pair or fill-worthy run.
    while (pos < pairEnd) {
      var /** @const {number} */ sLow = i32[pos];
      var /** @const {number} */ sHigh = i32[pos + 1];

      if (0 === sLow && 0 === sHigh) {
        pos += 2;
        continue;
      }

      // Peek ahead for fill.
      var /** @type {number} */ peekEnd = pos + 2;
      while (peekEnd + 1 < pairEnd && i32[peekEnd] === sLow && i32[peekEnd + 1] === sHigh) {
        peekEnd += 2;
      }
      if ((peekEnd - pos) >>> 1 >= fillThreshold) {
        break;
      }

      var /** @const {number} */ setByte = (startWordIndex + pos) * 4;
      lines[lines.length] = bbVar + '.putLong(' + setByte + ', ' + fmt(sLow >>> 0, sHigh >>> 0) + ');';
      pos += 2;
    }
  }

  // Handle trailing odd word.
  if (pairEnd < wordCount && 0 !== i32[pairEnd]) {
    var /** @const {number} */ trailByte = (startWordIndex + pairEnd) * 4;
    lines[lines.length] = bbVar + '.putInt(' + trailByte + ', ' + String(i32[pairEnd]) + ');';
  }

  return lines;
};

/**
 * Emits the static memory block as a Java snippet declaring a
 * {@code java.nio.ByteBuffer} (little-endian) and initializing it via
 * direct {@code putLong()} / {@code putInt()} calls.
 *
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitMetadata = function (wasmModule, options) {
  var /** @const {string} */ bufferName = /** @type {string} */ (options.emitMetadata);
  var /** @const {number} */ heapSize = this.resolveHeapSize_(wasmModule, options, 'JAVA_HEAP_SIZE');
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
    var /** @const {!Array<string>} */ initLines = this.emitStaticI64InitLines_(i32, startWordIndex, bufferName);
    for (
      var /** @type {number} */ ii = 0, /** @const {number} */ initLinesCount = initLines.length;
      ii !== initLinesCount;
      ++ii
    ) {
      lines[lines.length] = initLines[ii];
    }
  }

  return lines.join('\n');
};
