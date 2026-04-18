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
