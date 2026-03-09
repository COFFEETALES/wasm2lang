'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.JavaCodegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
};

Wasm2Lang.Backend.JavaCodegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.JavaCodegen.prototype.constructor = Wasm2Lang.Backend.JavaCodegen;
Wasm2Lang.Backend.registerBackend('java', Wasm2Lang.Backend.JavaCodegen);

/**
 * Emits Java IntBuffer init lines using the shared
 * {@code collectI32InitOps_} classification.
 *
 * Uses an {@code IntBuffer} view (via {@code asIntBuffer()}) so byte-order
 * dispatch is resolved once at view creation rather than per-put.
 *
 *   'fill' → simple loop: {@code for (int $i = 0; $i < N; $i++)
 *             ibVar.put(startIdx + $i, value);} — no temp array allocation.
 *   'set'  → direct indexed writes: {@code ibVar.put(idx, value);} per word
 *             — no {@code new int[]\{...\}} allocation.
 *
 * @private
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
        'for (int $i = 0; $i < ' + count + '; $i++) ' +
        ibVar + '.put(' + wordIndex + ' + $i, ' + String(value) + ');';
    } else {
      var /** @const {!Array<number>} */ words = op.setWordsI32;
      for (var /** number */ j = 0, /** @const {number} */ wLen = words.length; j !== wLen; ++j) {
        lines[lines.length] =
          ibVar + '.put(' + (wordIndex + j) + ', ' + String(words[j]) + ');';
      }
    }
  }

  return lines;
};

/**
 * Emits the static memory block as a Java snippet declaring a
 * {@code java.nio.ByteBuffer} (little-endian) and initializing it via an
 * {@code IntBuffer} view for maximum throughput.
 *
 * The IntBuffer view bakes byte-order at creation, eliminating per-put
 * dispatch.  Bulk {@code put(index, int[], off, len)} routes through
 * {@code System.arraycopy} (JIT-intrinsified memcpy), and
 * {@code Arrays.fill} for fill ops is JIT-intrinsified as vectorised memset.
 *
 * Called when {@code options.emitMetadata} is a string.
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

  lines[lines.length] = 'java.nio.ByteBuffer ' + bufferName +
    ' = java.nio.ByteBuffer.allocate(' + heapSize +
    ').order(java.nio.ByteOrder.LITTLE_ENDIAN);';

  if (0 !== i32.length) {
    var /** @const {!Array<string>} */ initLines = this.emitStaticI32InitLines_(i32, startWordIndex, '$ib');
    if (0 !== initLines.length) {
      lines[lines.length] = 'java.nio.IntBuffer $ib = ' + bufferName + '.asIntBuffer();';
      for (var /** number */ i = 0, /** @const {number} */ initLinesCount = initLines.length; i !== initLinesCount; ++i) {
        lines[lines.length] = initLines[i];
      }
    }
  }

  return lines.join('\n');
};

/**
 * Emits a Java module class stub plus a traversal summary comment block.
 * Signature matches {@link Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode}.
 *
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitCode = function (wasmModule, options) {
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} */ imports =
      this.collectImportedFunctions_(wasmModule);
  var /** @const {!Array<string>} */ lines = [];

  // Class declaration — capitalise first letter for Java convention.
  var /** @const {string} */ className = moduleName.charAt(0).toUpperCase() + moduleName.substring(1);
  lines[lines.length] = 'class ' + className + ' {';

  // Imported function fields — stored as java.util.function.IntUnaryOperator stubs.
  for (var /** number */ i = 0, /** @const {number} */ importCount = imports.length; i !== importCount; ++i) {
    lines[lines.length] = '  java.util.function.IntUnaryOperator $if_' + imports[i].importBaseName + ';';
  }

  // Buffer field.
  lines[lines.length] = '  java.nio.ByteBuffer buffer;';

  // Constructor accepting foreign imports and buffer.
  lines[lines.length] = '  ' + className + '(java.util.Map<String, Object> foreign, java.nio.ByteBuffer buffer) {';
  lines[lines.length] = '    this.buffer = buffer;';
  for (var /** number */ ci = 0; ci !== importCount; ++ci) {
    lines[lines.length] =
      '    this.$if_' +
      imports[ci].importBaseName +
      ' = (java.util.function.IntUnaryOperator) foreign.get("' +
      imports[ci].importBaseName +
      '");';
  }
  lines[lines.length] = '  }';

  // Exported function stubs — one method per unique internal name.
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ExportedFunctionInfo_>} */ exports =
      this.collectExportedFunctions_(wasmModule);
  var /** @const {!Object<string, boolean>} */ emittedStubs =
      /** @type {!Object<string, boolean>} */ (Object.create(null));

  for (var /** number */ e = 0, /** @const {number} */ exportCount = exports.length; e !== exportCount; ++e) {
    var /** @const {string} */ stubName = exports[e].stubName;
    if (!emittedStubs[stubName]) {
      emittedStubs[stubName] = true;
      lines[lines.length] = '  int ' + stubName + '() {';
      lines[lines.length] = '    return 0;';
      lines[lines.length] = '  }';
    }
  }

  // getExports method — returns a Map mapping export names to stub results.
  lines[lines.length] = '  java.util.Map<String, Object> getExports() {';
  lines[lines.length] = '    java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();';
  for (var /** number */ r = 0; r !== exportCount; ++r) {
    lines[lines.length] = '    m.put("' + exports[r].exportName + '", (java.util.function.IntSupplier) this::' + exports[r].stubName + ');';
  }
  lines[lines.length] = '    return m;';
  lines[lines.length] = '  }';

  lines[lines.length] = '}';

  // Traversal summary — delegates to AbstractCodegen which walks all
  // non-imported function bodies and appends per-function node counts and a
  // combined seen-ids line.
  lines[lines.length] = Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode.call(this, wasmModule, options);

  return lines.join('\n');
};
