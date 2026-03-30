'use strict';

/**
 * Emits the static memory block as a PHP snippet declaring a binary string
 * built in a single concatenation expression.
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
  var /** @const {number} */ dataByteLength = i32.length * 4;
  var /** @const {number} */ suffixBytes = heapSize - startByte - dataByteLength;
  var /** @const {!Array<string>} */ concatParts = [];

  if (0 < startByte) {
    concatParts[concatParts.length] = 'str_repeat("\\x00", ' + startByte + ')';
  }

  var /** @const {!Array<string>} */ wordStrs = [];
  for (var /** @type {number} */ w = 0, /** @const {number} */ wLen = i32.length; w !== wLen; ++w) {
    wordStrs[wordStrs.length] = String(i32[w]);
  }
  concatParts[concatParts.length] = "pack('V*', " + wordStrs.join(', ') + ')';

  if (0 < suffixBytes) {
    concatParts[concatParts.length] = 'str_repeat("\\x00", ' + suffixBytes + ')';
  }

  lines[lines.length] = memVar + ' = ' + concatParts.join(' . ') + ';';

  return lines.join('\n');
};
