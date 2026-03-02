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
Wasm2Lang.Backend.registerBackend('php64', Wasm2Lang.Backend.Php64Codegen);

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
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitMetadata = function (wasmModule, options) {
  var /** @const {string} */ bufferName = /** @type {string} */ (options.emitMetadata);
  var /** @const {string} */ memVar = '$' + bufferName;
  var /** @const {number} */ heapSize = this.resolveHeapSize_(options, 'PHP64_HEAP_SIZE', 65536);
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
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} */ imports =
      this.collectImportedFunctions_(wasmModule);
  var /** @const {!Array<string>} */ lines = [];

  lines[lines.length] = '$' + moduleName + ' = function(array $foreign, array &$buffer): array {';

  // Imported function bindings from the foreign array.
  for (var /** number */ i = 0, /** @const {number} */ importCount = imports.length; i !== importCount; ++i) {
    lines[lines.length] = '  $if_' + imports[i].base + ' = $foreign[\'' + imports[i].base + '\'] ?? null;';
  }

  // Exported function stubs — one closure per unique internal name.
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ExportedFunctionInfo_>} */ exports =
      this.collectExportedFunctions_(wasmModule);
  var /** @const {!Object<string, boolean>} */ emittedStubs =
      /** @type {!Object<string, boolean>} */ (Object.create(null));

  for (var /** number */ e = 0, /** @const {number} */ exportCount = exports.length; e !== exportCount; ++e) {
    var /** @const {string} */ stubName = exports[e].stubName;
    if (!emittedStubs[stubName]) {
      emittedStubs[stubName] = true;
      lines[lines.length] = '  $' + stubName + ' = function() { return 0; };';
    }
  }

  // Return array — maps each export name to its stub callable.
  var /** @const {!Array<string>} */ returnEntries = [];
  for (var /** number */ r = 0; r !== exportCount; ++r) {
    returnEntries[returnEntries.length] = '\'' + exports[r].exportName + '\' => $' + exports[r].stubName;
  }
  lines[lines.length] = '  return [' + returnEntries.join(', ') + '];';
  lines[lines.length] = '};';

  // Traversal summary — delegates to AbstractCodegen which walks all
  // non-imported function bodies and appends per-function node counts and a
  // combined seen-ids line.
  lines[lines.length] = Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode.call(this, wasmModule, options);

  return lines.join('\n');
};
