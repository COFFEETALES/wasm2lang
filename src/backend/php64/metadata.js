'use strict';

/**
 * Formats a 64-bit value (given as two signed i32 words from Int32Array)
 * as a PHP integer literal.  Values >= 2^63 require a runtime expression
 * because PHP hex literals >= 2^63 silently become floats.
 *
 * @private
 * @param {number} lowWord   Low 32 bits (signed i32 from Int32Array).
 * @param {number} highWord  High 32 bits (signed i32 from Int32Array).
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.formatPhpI64Literal_ = function (lowWord, highWord) {
  var /** @const {number} */ unsignedLow = lowWord >>> 0;
  var /** @const {number} */ unsignedHigh = highWord >>> 0;

  // Both zero.
  if (0 === unsignedLow && 0 === unsignedHigh) return '0';

  // High is zero: value fits in 32 bits.
  if (0 === unsignedHigh) {
    return lowWord >= 0 ? String(lowWord) : String(unsignedLow);
  }

  // Unsigned value >= 2^63 (highWord has bit 31 set, i.e. highWord < 0):
  // PHP cannot parse hex literals this large as integers; emit expression.
  if (highWord < 0) {
    return '(' + String(highWord) + ' << 32 | ' + String(unsignedLow) + ' & 0xFFFFFFFF)';
  }

  // Value < 2^53: safe to compute as a JS number and emit as decimal.
  if (unsignedHigh < 0x200000) {
    return String(unsignedHigh * 0x100000000 + unsignedLow);
  }

  // Value in [2^53, 2^63): emit as hex (PHP parses correctly).
  var /** @const {string} */ hexHigh = unsignedHigh.toString(16);
  var /** @const {string} */ hexLow = ('00000000' + unsignedLow.toString(16)).slice(-8);
  return '0x' + hexHigh + hexLow;
};

/**
 * Emits the static memory block as a PHP snippet declaring a binary string
 * built in a single concatenation expression, using 64-bit {@code pack('P')}
 * calls to halve the number of inline arguments.
 *
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitMetadata = function (wasmModule, options) {
  var /** @const {string} */ bufferName = /** @type {string} */ (options.emitMetadata);
  var /** @const {string} */ memVar = '$' + bufferName;
  var /** @const {number} */ heapSize = this.resolveHeapSize_(options, 'PHP64_HEAP_SIZE', 65536);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_} */ staticMemory = this.collectStaticMemory_(wasmModule);
  var /** @const {number} */ startWordIndex = staticMemory.startWordIndex;
  var /** @const {!Int32Array} */ i32 = staticMemory.words;
  var /** @const {!Array<string>} */ lines = [];

  lines[lines.length] = '<?php';

  // Check whether any word in the static data span is non-zero.
  var /** @type {boolean} */ hasNonZero = false;
  for (var /** @type {number} */ k = 0, /** @const {number} */ i32Len = i32.length; k !== i32Len; ++k) {
    if (0 !== i32[k]) {
      hasNonZero = true;
      break;
    }
  }

  if (!hasNonZero) {
    // All-zero data — single str_repeat is sufficient.
    lines[lines.length] = memVar + ' = str_repeat("\\x00", ' + heapSize + ');';
    return lines.join('\n');
  }

  // Build a single concatenation expression:
  var /** @const {number} */ startByte = startWordIndex * 4;
  var /** @const {number} */ wordCount = i32.length;
  var /** @const {number} */ dataByteLength = wordCount * 4;
  var /** @const {number} */ suffixBytes = heapSize - startByte - dataByteLength;
  var /** @const {!Array<string>} */ concatParts = [];
  var /** @const */ fmt = Wasm2Lang.Backend.Php64Codegen.formatPhpI64Literal_;

  if (0 < startByte) {
    concatParts[concatParts.length] = 'str_repeat("\\x00", ' + startByte + ')';
  }

  // Pair words into i64 values.
  var /** @const {number} */ pairEnd = wordCount - (wordCount % 2);
  var /** @const {!Array<string>} */ i64Strs = [];
  for (var /** @type {number} */ p = 0; p < pairEnd; p += 2) {
    i64Strs[i64Strs.length] = fmt(i32[p], i32[p + 1]);
  }

  if (0 !== i64Strs.length) {
    concatParts[concatParts.length] = "pack('P*', " + i64Strs.join(', ') + ')';
  }

  // Handle trailing odd word.
  if (0 !== wordCount % 2) {
    concatParts[concatParts.length] = "pack('V', " + String(i32[wordCount - 1]) + ')';
  }

  if (0 < suffixBytes) {
    concatParts[concatParts.length] = 'str_repeat("\\x00", ' + suffixBytes + ')';
  }

  lines[lines.length] = memVar + ' = ' + concatParts.join(' . ') + ';';

  return lines.join('\n');
};
