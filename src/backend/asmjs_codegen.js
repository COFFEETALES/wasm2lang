'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.AsmjsCodegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
};

Wasm2Lang.Backend.AsmjsCodegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.AsmjsCodegen.prototype.constructor = Wasm2Lang.Backend.AsmjsCodegen;
Wasm2Lang.Backend.registerBackend('asmjs', Wasm2Lang.Backend.AsmjsCodegen);

/**
 * Emits i32 static-memory initialization lines in asm.js syntax using the
 * shared {@code collectI32InitOps_} classification:
 *   'fill' → {@code i32_array.fill(value, start, end);}
 *   'set'  → {@code i32_array.set([v0, v1, ...], offset);}
 *
 * @private
 * @param {!Int32Array} i32
 * @param {number} startWordIndex
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitStaticI32InitLines_ = function (i32, startWordIndex) {
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
        'i32_array.fill(' + String(value) + ', ' + String(wordIndex) + ', ' + String(wordIndex + count) + ');';
    } else {
      var /** @const {!Array<number>} */ words = op.setWordsI32;
      var /** @const {!Array<string>} */ wordStrs = [];
      for (var /** number */ j = 0, /** @const {number} */ wLen = words.length; j !== wLen; ++j) {
        wordStrs[wordStrs.length] = String(words[j]);
      }
      lines[lines.length] = 'i32_array.set([' + wordStrs.join(', ') + '], ' + String(wordIndex) + ');';
    }
  }

  return lines;
};

/**
 * Emits the static memory block as a JavaScript string declaring an
 * ArrayBuffer and initializing it from the wasm module's data segments.
 *
 * Called when {@code options.emitMetadata} is a string.
 *
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitMetadata = function (wasmModule, options) {
  var /** @const {string} */ bufferName = /** @type {string} */ (options.emitMetadata);
  var /** @const {number} */ heapSize = this.resolveHeapSize_(options, 'ASMJS_HEAP_SIZE', 65536);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_} */ staticMemory = this.collectStaticMemory_(wasmModule);
  var /** @const {number} */ startWordIndex = staticMemory.startWordIndex;
  var /** @const {!Int32Array} */ i32 = staticMemory.words;
  var /** @const {!Array<string>} */ lines = [];

  lines[lines.length] = 'var ' + bufferName + ' = new ArrayBuffer(' + heapSize + ');';
  lines[lines.length] = 'var i32_array = new Int32Array(' + bufferName + ');';

  if (0 !== i32.length) {
    var /** @const {!Array<string>} */ initLines = this.emitStaticI32InitLines_(i32, startWordIndex);
    for (var /** number */ i = 0, /** @const {number} */ initLinesCount = initLines.length; i !== initLinesCount; ++i) {
      lines[lines.length] = initLines[i];
    }
  }

  return lines.join('\n');
};

/**
 * Emits the asm.js module shell plus a traversal summary comment block.
 * Signature matches {@link Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode}.
 *
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitCode = function (wasmModule, options) {
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} */ imports =
      this.collectImportedFunctions_(wasmModule);
  var /** @const {!Array<string>} */ outputParts = [];

  // Minimal asm.js module shell — variable name comes from --emit-code value.
  outputParts[outputParts.length] = 'var ' + moduleName + ' = function asmjsModule(stdlib, foreign, buffer) {';
  outputParts[outputParts.length] = '  "use asm";';

  // Imported function bindings from the foreign object.
  for (var /** number */ i = 0, /** @const {number} */ importCount = imports.length; i !== importCount; ++i) {
    outputParts[outputParts.length] =
      '  var $if_' + imports[i].importBaseName + ' = foreign.' + imports[i].importBaseName + ';';
  }

  // Exported function stubs — one declaration per unique internal name.
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ExportedFunctionInfo_>} */ exports =
      this.collectExportedFunctions_(wasmModule);
  var /** @const {!Object<string, boolean>} */ emittedStubs =
      /** @type {!Object<string, boolean>} */ (Object.create(null));

  for (var /** number */ e = 0, /** @const {number} */ exportCount = exports.length; e !== exportCount; ++e) {
    var /** @const {string} */ stubName = exports[e].stubName;
    if (!emittedStubs[stubName]) {
      emittedStubs[stubName] = true;
      outputParts[outputParts.length] = '  function ' + stubName + '() {';
      outputParts[outputParts.length] = '    return 0;';
      outputParts[outputParts.length] = '  }';
    }
  }

  // Return object — maps each export name to its stub function.
  var /** @const {!Array<string>} */ returnEntries = [];
  for (var /** number */ r = 0; r !== exportCount; ++r) {
    returnEntries[returnEntries.length] = exports[r].exportName + ': ' + exports[r].stubName;
  }
  outputParts[outputParts.length] = '  return { ' + returnEntries.join(', ') + ' };';
  outputParts[outputParts.length] = '};';

  // Traversal summary — delegates to AbstractCodegen which walks all
  // non-imported function bodies and appends per-function node counts and a
  // combined seen-ids line.
  outputParts[outputParts.length] = Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode.call(this, wasmModule, options);

  return outputParts.join('\n');
};
