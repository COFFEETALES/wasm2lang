'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.Php64Codegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
};

Wasm2Lang.Backend.Php64Codegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.Php64Codegen.prototype.constructor = Wasm2Lang.Backend.Php64Codegen;

/**
 * Resolves the initial PHP heap word-array size in bytes.
 *
 * Supports overriding the default via --define PHP64_HEAP_SIZE=<number>.
 *
 * @private
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {number}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.resolveHeapSize_ = function (options) {
  var /** @const {number} */ defaultHeapSize = 65536;
  var /** @const {!Object<string, string>} */ definitions = options.definitions;

  if (!Object.prototype.hasOwnProperty.call(definitions, 'PHP64_HEAP_SIZE')) {
    return defaultHeapSize;
  }

  var /** @const {number} */ candidate = Number(definitions['PHP64_HEAP_SIZE']);
  if (!isFinite(candidate) || 0 >= candidate) {
    return defaultHeapSize;
  }

  return Math.floor(candidate);
};

/**
 * Emits PHP i32-array static-memory initialization lines using the shared
 * {@code collectI32InitOps_} classification:
 *   'fill' → {@code for ($k = W, $kEnd = W+N; $k !== $kEnd; ++$k) $mem[$k] = V;}
 *   'set'  → one {@code $mem[W+j] = v;} line per word.
 *
 * @private
 * @param {!Int32Array} i32
 * @param {number} startWordIndex
 * @param {string} memVar  PHP variable name including '$', e.g. '$memBuffer'.
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitStaticI32InitLines_ = function (i32, startWordIndex, memVar) {
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
        'for ($k = ' + wordIndex + ', $kEnd = ' + (wordIndex + count) + '; $k !== $kEnd; ++$k) ' +
        memVar + '[$k] = ' + value + ';';
    } else {
      var /** @const {!Array<number>} */ words = op.setWordsI32;
      for (var /** number */ j = 0, /** @const {number} */ wLen = words.length; j !== wLen; ++j) {
        lines[lines.length] = memVar + '[' + (wordIndex + j) + '] = ' + words[j] + ';';
      }
    }
  }

  return lines;
};

/**
 * Emits the static memory block as a PHP snippet declaring a word-indexed
 * integer array and initializing it from the wasm module's data segments.
 *
 * The backing array maps word index → signed i32, mirroring the asm.js
 * Int32Array layout.  Aligned i32 load/store becomes a single array op;
 * byte-level access uses bit masking.
 *
 * Called when {@code options.emitMetadata} is a string.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitMetadata = function (wasmModule, options) {
  var /** @const {string} */ bufferName = /** @type {string} */ (options.emitMetadata);
  var /** @const {string} */ memVar = '$' + bufferName;
  var /** @const {number} */ heapSize = this.resolveHeapSize_(options);
  var /** @const {number} */ wordCount = heapSize >>> 2;
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_} */ staticMemory = this.collectStaticMemory_(wasmModule);
  var /** @const {number} */ startWordIndex = staticMemory.startWordIndex;
  var /** @const {!Int32Array} */ i32 = staticMemory.words;
  var /** @const {!Array<string>} */ lines = [];

  lines[lines.length] = '<?php';
  lines[lines.length] = memVar + ' = array_fill(0, ' + wordCount + ', 0);';

  if (0 !== i32.length) {
    var /** @const {!Array<string>} */ initLines = this.emitStaticI32InitLines_(i32, startWordIndex, memVar);
    for (var /** number */ i = 0, /** @const {number} */ initLinesCount = initLines.length; i !== initLinesCount; ++i) {
      lines[lines.length] = initLines[i];
    }
  }

  return lines.join('\n');
};

/**
 * Emits a PHP module closure stub.
 * Signature matches {@link Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode}.
 *
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitCode = function (wasmModule, options) {
  void wasmModule;
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {!Array<string>} */ lines = [];

  lines[lines.length] = '$' + moduleName + ' = function(array $foreign, array &$buffer): array {';
  lines[lines.length] = '  return [];';
  lines[lines.length] = '};';

  return lines.join('\n');
};
