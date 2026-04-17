'use strict';

/**
 * @param {!Int32Array} i32
 * @param {number} startWordIndex
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitStaticI32InitLines_ = function (i32, startWordIndex) {
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.I32InitOp_>} */ ops = this.collectI32InitOps_(i32, startWordIndex);
  var /** @const {!Array<string>} */ lines = [];
  var /** @const {string} */ i32Name = this.n_('i32_array');

  for (var /** @type {number} */ i = 0, /** @const {number} */ opsLen = ops.length; i !== opsLen; ++i) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.I32InitOp_} */ op = ops[i];
    var /** @const {string} */ opKind = op.opKind;
    var /** @const {number} */ wordIndex = op.startWordIndex;

    if ('fill' === opKind) {
      var /** @const {number} */ value = op.fillValueI32;
      var /** @const {number} */ count = op.fillCountWords;
      lines[lines.length] =
        i32Name + '.fill(' + String(value) + ', ' + String(wordIndex) + ', ' + String(wordIndex + count) + ');';
    } else {
      var /** @const {!Array<number>} */ words = op.setWordsI32;
      var /** @const {!Array<string>} */ wordStrs = [];
      for (var /** @type {number} */ j = 0, /** @const {number} */ wLen = words.length; j !== wLen; ++j) {
        wordStrs[wordStrs.length] = String(words[j]);
      }
      lines[lines.length] = i32Name + '.set([' + wordStrs.join(', ') + '], ' + String(wordIndex) + ');';
    }
  }

  return lines;
};

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitMetadata = function (wasmModule, options) {
  var /** @const {string} */ bufferName = /** @type {string} */ (options.emitMetadata);
  var /** @const {number} */ heapSize = this.resolveHeapSize_(wasmModule, options, 'JS_HEAP_SIZE');
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_} */ staticMemory = this.collectStaticMemory_(wasmModule);
  var /** @const {number} */ startWordIndex = staticMemory.startWordIndex;
  var /** @const {!Int32Array} */ i32 = staticMemory.words;
  var /** @const {!Array<string>} */ lines = [];

  var /** @const {string} */ i32ArrayName = this.n_('i32_array');
  lines[lines.length] = 'var ' + bufferName + ' = new ArrayBuffer(' + heapSize + ');';
  lines[lines.length] = 'var ' + i32ArrayName + ' = new Int32Array(' + bufferName + ');';

  if (0 !== i32.length) {
    var /** @const {!Array<string>} */ initLines = this.emitStaticI32InitLines_(i32, startWordIndex);
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
