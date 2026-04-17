'use strict';

/**
 * Emits a resizable {@code ArrayBuffer} so {@code memory.grow} can call
 * {@code buffer.resize(...)} at runtime.  Length-tracking typed arrays
 * ({@code HEAPU8 = new Uint8Array(buffer)} etc.) automatically follow the
 * resized length, so the pre-existing HEAP* bindings keep working after
 * {@code buffer.resize(...)} succeeds.
 *
 * The initial size comes from the {@code JS_HEAP_SIZE} define (shared with
 * the asm.js backend).  The {@code maxByteLength} cap defaults to the wasm
 * module's declared memory maximum ({@code max * 65536}); this mirrors the
 * V8 WASM runtime's grow semantics so {@code buffer.resize(...)} beyond the
 * declared max fails exactly where {@code WebAssembly.Memory.grow(...)} would.
 * A finite {@code JS_MAX_HEAP_SIZE} define overrides the computed cap; when
 * the module declares no finite max ({@code binaryen}'s {@code memInfo.max}
 * is left {@code undefined}/{@code NaN} or sits at the 65535-page wasm32
 * ceiling), the cap falls back to {@code initial * 16} to keep a reasonable
 * test footprint.
 *
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.emitMetadata = function (wasmModule, options) {
  var /** @const {string} */ bufferName = /** @type {string} */ (options.emitMetadata);
  var /** @const {number} */ heapSize = this.resolveHeapSize_(wasmModule, options, 'JS_HEAP_SIZE');
  var /** @const {!BinaryenMemoryInfo} */ memInfo = wasmModule.getMemoryInfo();
  var /** @const {number} */ maxPages = memInfo.max;
  var /** @type {number} */ defaultCap;
  if (isFinite(maxPages) && 0 < maxPages && maxPages < 65535) {
    defaultCap = maxPages * 65536;
  } else {
    defaultCap = heapSize * 16;
  }
  var /** @const {!Object<string, string>} */ definitions = options.definitions;
  var /** @type {number} */ maxHeapSize = defaultCap;
  if (Object.prototype.hasOwnProperty.call(definitions, 'JS_MAX_HEAP_SIZE')) {
    var /** @const {number} */ capCandidate = Number(definitions['JS_MAX_HEAP_SIZE']);
    if (isFinite(capCandidate) && 0 < capCandidate) {
      maxHeapSize = Math.floor(capCandidate);
    }
  }
  var /** @const {number} */ effectiveMax = maxHeapSize < heapSize ? heapSize : maxHeapSize;
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_} */ staticMemory = this.collectStaticMemory_(wasmModule);
  var /** @const {number} */ startWordIndex = staticMemory.startWordIndex;
  var /** @const {!Int32Array} */ i32 = staticMemory.words;
  var /** @const {!Array<string>} */ lines = [];

  var /** @const {string} */ i32ArrayName = this.n_('i32_array');
  lines[lines.length] = 'var ' + bufferName + ' = new ArrayBuffer(' + heapSize + ', {maxByteLength: ' + effectiveMax + '});';
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
