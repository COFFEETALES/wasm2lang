'use strict';

/**
 * Emits a resizable {@code ArrayBuffer} so {@code memory.grow} can call
 * {@code buffer.resize(...)} at runtime.  Length-tracking typed arrays
 * ({@code HEAPU8 = new Uint8Array(buffer)} etc.) automatically follow the
 * resized length, so the pre-existing HEAP* bindings keep working after
 * {@code buffer.resize(...)} succeeds.
 *
 * The initial size comes from the {@code JS_HEAP_SIZE} define (the asm.js
 * backend uses {@code ASMJS_HEAP_SIZE}).  The {@code maxByteLength} cap defaults to the wasm
 * module's declared memory maximum ({@code max * 65536}); this mirrors the
 * V8 WASM runtime's grow semantics so {@code buffer.resize(...)} beyond the
 * declared max fails exactly where {@code WebAssembly.Memory.grow(...)} would.
 * A finite {@code JS_MAX_HEAP_SIZE} define overrides the computed cap; when
 * the module declares no finite max ({@code binaryen}'s {@code memInfo.max}
 * is left {@code undefined}/{@code NaN} or sits at the 65535-page wasm32
 * ceiling), the cap falls back to {@code initial * 16} to keep a reasonable
 * test footprint.
 *
 * Everything else about the metadata block — the i32 view and the static
 * memory init lines — is identical to asm.js and stays in its
 * {@code emitMetadata}.
 *
 * @override
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {number} heapSize
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderHeapBufferExpr_ = function (wasmModule, options, heapSize) {
  var /** @type {number} */ defaultCap = heapSize * 16;
  if (wasmModule.hasMemory()) {
    var /** @const {!BinaryenMemoryInfo} */ memInfo = wasmModule.getMemoryInfo();
    var /** @const {number} */ maxPages = memInfo.max;
    if (isFinite(maxPages) && 0 < maxPages && maxPages < 65535) {
      defaultCap = maxPages * 65536;
    }
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
  return 'new ArrayBuffer(' + heapSize + ', {maxByteLength: ' + effectiveMax + '})';
};
