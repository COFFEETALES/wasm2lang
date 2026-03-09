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
 * Emits the static memory block as a PHP snippet declaring a binary string
 * built in a single concatenation expression.
 *
 * Instead of allocating a zero buffer and repeatedly copying it via
 * {@code substr_replace}, the entire heap is constructed as:
 *   {@code str_repeat("\x00", prefix) . pack('V*', w0, w1, ...) . str_repeat("\x00", suffix)}
 *
 * PHP 8's rope optimisation ({@code ROPE_INIT/ROPE_ADD/ROPE_END}) compiles
 * the {@code .} chain into a single allocation with one memcpy per piece —
 * no intermediate string copies.  {@code pack('V*', ...)} serialises all
 * i32 words in one C-level call.
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
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_} */ staticMemory = this.collectStaticMemory_(wasmModule);
  var /** @const {number} */ startWordIndex = staticMemory.startWordIndex;
  var /** @const {!Int32Array} */ i32 = staticMemory.words;
  var /** @const {!Array<string>} */ lines = [];

  lines[lines.length] = '<?php';

  // Check whether any word in the static data span is non-zero.
  var /** @type {boolean} */ hasNonZero = false;
  for (var /** number */ k = 0, /** @const {number} */ i32Len = i32.length; k !== i32Len; ++k) {
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
  //   [str_repeat("\x00", prefixBytes) . ] pack('V*', w0, w1, ...) [ . str_repeat("\x00", suffixBytes)]
  var /** @const {number} */ startByte = startWordIndex * 4;
  var /** @const {number} */ dataByteLength = i32.length * 4;
  var /** @const {number} */ suffixBytes = heapSize - startByte - dataByteLength;
  var /** @const {!Array<string>} */ concatParts = [];

  if (0 < startByte) {
    concatParts[concatParts.length] = 'str_repeat("\\x00", ' + startByte + ')';
  }

  var /** @const {!Array<string>} */ wordStrs = [];
  for (var /** number */ w = 0, /** @const {number} */ wLen = i32.length; w !== wLen; ++w) {
    wordStrs[wordStrs.length] = String(i32[w]);
  }
  concatParts[concatParts.length] = 'pack(\'V*\', ' + wordStrs.join(', ') + ')';

  if (0 < suffixBytes) {
    concatParts[concatParts.length] = 'str_repeat("\\x00", ' + suffixBytes + ')';
  }

  lines[lines.length] = memVar + ' = ' + concatParts.join(' . ') + ';';

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

  lines[lines.length] = '$' + moduleName + ' = function(array $foreign, string &$buffer): array {';

  // Imported function bindings from the foreign array.
  for (var /** number */ i = 0, /** @const {number} */ importCount = imports.length; i !== importCount; ++i) {
    lines[lines.length] =
      '  $if_' + imports[i].importBaseName + ' = $foreign[\'' + imports[i].importBaseName + '\'] ?? null;';
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
