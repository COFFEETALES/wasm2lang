'use strict';

// ---------------------------------------------------------------------------
// Mangler integration.
// ---------------------------------------------------------------------------

/**
 * @override
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.getFixedModuleBindings_ = function (options) {
  var /** @const {!Array<string>} */ bindings = [
      'asmjsModule',
      'buffer',
      'foreign',
      'stdlib',
      'HEAP8',
      'HEAP16',
      'HEAP32',
      'HEAPF32',
      'HEAPF64',
      'HEAPU8',
      'HEAPU16',
      'Math_abs',
      'Math_acos',
      'Math_asin',
      'Math_atan',
      'Math_atan2',
      'Math_ceil',
      'Math_clz32',
      'Math_cos',
      'Math_exp',
      'Math_floor',
      'Math_fround',
      'Math_imul',
      'Math_log',
      'Math_max',
      'Math_min',
      'Math_pow',
      'Math_sin',
      'Math_sqrt',
      'Math_tan',
      'Math_E',
      'Math_LN10',
      'Math_LN2',
      'Math_LOG2E',
      'Math_LOG10E',
      'Math_PI',
      'Math_SQRT1_2',
      'Math_SQRT2',
      '$g_Infinity',
      '$g_NaN',
      '$w2l_trap'
    ];
  if ('string' === typeof options.emitMetadata) {
    bindings[bindings.length] = 'i32_array';
  }
  return bindings;
};

/**
 * Heap typed-array views and the three frequently-used Math intrinsics
 * (fround / imul / clz32) appear in nearly every emitted function body, so
 * promote them to the hot tier where the encoder can hand out single-letter
 * mangled names ahead of internal functions and helpers.  The remaining
 * Math entries (abs, floor, sqrt, …) stay in the cold list — they only
 * surface in modules that explicitly use them.
 *
 * @override
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.getHotModuleBindings_ = function (options) {
  void options;
  return ['HEAPU8', 'HEAP32', 'HEAPF32', 'HEAPF64', 'HEAP8', 'HEAP16', 'HEAPU16', 'Math_fround', 'Math_imul', 'Math_clz32'];
};

/**
 * The asm.js module shell emits {@code stdlib}, {@code foreign}, and
 * {@code buffer} as closure parameters and {@code asmjsModule} as the inner
 * function name regardless of whether any function body marks them via
 * {@code markBinding_}.  Pin these as always-registered so the discovery
 * filter does not strip them and leak them into the output unmangled.
 * {@code i32_array} is added when {@code --emit-metadata} is active, since
 * the metadata emitter references the binding via {@code n_(...)} without
 * routing through {@code markBinding_} and the discovery walk only covers
 * the code-emit phase.
 *
 * @override
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.getAlwaysRegisteredBindings_ = function (options) {
  var /** @const {!Array<string>} */ list = ['asmjsModule', 'stdlib', 'foreign', 'buffer'];
  if ('string' === typeof options.emitMetadata) list[list.length] = 'i32_array';
  return list;
};
