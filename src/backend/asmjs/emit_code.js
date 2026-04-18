'use strict';

// ---------------------------------------------------------------------------
// asm.js-specific overrides for the shared module-shell emitter in
// {@code jscommon/emit_code.js}.
//
// The asm.js validator requires:
//   • {@code "use asm";} prologue
//   • {@code stdlib.Int8Array} / {@code stdlib.Math.X} for typed-array views
//     and Math functions (intrinsic detection)
//   • Math constants, {@code Infinity}, and {@code NaN} routed through the
//     foreign object with {@code +} double-coercion (engines reject
//     {@code +stdlib.Math.E})
//   • Parameter type annotations on every function table stub
//   • Return-value coercion in exported global getters
//   • Parameter type annotation in exported global setters
//   • Module-level globals initialized with the raw integer/float literal
//     (no BigInt / i64 path because asm.js has no i64)
// ---------------------------------------------------------------------------

/**
 * @override
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.getModuleFunctionBindingName_ = function () {
  return 'asmjsModule';
};

/**
 * @override
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.getHeapSizeDefinitionKey_ = function () {
  return 'ASMJS_HEAP_SIZE';
};

/**
 * @override
 * @protected
 * @param {!Array<string>} parts
 * @param {string} pad1
 * @return {void}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitUseAsmDirective_ = function (parts, pad1) {
  parts[parts.length] = pad1 + '"use asm";';
};

/**
 * Asm.js heap bindings exclude {@code HEAP64} (no i64 in the type system).
 *
 * @override
 * @protected
 * @return {!Array<!Array<string>>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.getHeapBindingTable_ = function () {
  return Wasm2Lang.Backend.AsmjsCodegen.HEAP_BINDINGS_;
};

/** @const {!Array<!Array<string>>} */
Wasm2Lang.Backend.AsmjsCodegen.HEAP_BINDINGS_ = [
  ['HEAP8', 'Int8Array'],
  ['HEAPU8', 'Uint8Array'],
  ['HEAP16', 'Int16Array'],
  ['HEAPU16', 'Uint16Array'],
  ['HEAP32', 'Int32Array'],
  ['HEAPF32', 'Float32Array'],
  ['HEAPF64', 'Float64Array']
];

/**
 * @override
 * @protected
 * @param {string} typedArrayName
 * @param {string} stdlibName
 * @param {string} bufferName
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderHeapInitializer_ = function (typedArrayName, stdlibName, bufferName) {
  return 'new ' + stdlibName + '.' + typedArrayName + '(' + bufferName + ')';
};

/**
 * @override
 * @protected
 * @param {string} mathBindingName
 * @param {string} stdlibName
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderMathFunctionInitializer_ = function (mathBindingName, stdlibName) {
  return stdlibName + '.Math.' + mathBindingName.substring(5);
};

/**
 * Math constants come through the foreign object — {@code +stdlib.Math.E}
 * is rejected by V8 / SpiderMonkey asm.js validators.
 *
 * @override
 * @protected
 * @param {string} mathBindingName
 * @param {string} foreignName
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderMathConstantInitializer_ = function (mathBindingName, foreignName) {
  return '+' + foreignName + '.' + mathBindingName.substring(5);
};

/**
 * @override
 * @protected
 * @param {string} foreignName
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderInfinityInitializer_ = function (foreignName) {
  return '+' + foreignName + '.Infinity';
};

/**
 * @override
 * @protected
 * @param {string} foreignName
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderNaNInitializer_ = function (foreignName) {
  return '+' + foreignName + '.NaN';
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_} globalInfo
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderModuleGlobalInitExpr_ = function (binaryen, globalInfo) {
  return String(globalInfo.globalInitValue);
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} varName
 * @param {number} type
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderExportedGlobalGetterReturn_ = function (binaryen, varName, type) {
  return this.renderCoercionByType_(binaryen, varName, type);
};
