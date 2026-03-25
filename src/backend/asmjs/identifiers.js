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
      'Math_SQRT2'
    ];
  if ('string' === typeof options.emitMetadata) {
    bindings[bindings.length] = 'i32_array';
  }
  return bindings;
};

/**
 * @override
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.getAllHelperNames_ = function () {
  return [
    '$w2l_copysign_f32',
    '$w2l_copysign_f64',
    '$w2l_ctz',
    '$w2l_load_f32',
    '$w2l_load_f64',
    '$w2l_nearest_f32',
    '$w2l_nearest_f64',
    '$w2l_popcnt',
    '$w2l_reinterpret_f32_to_i32',
    '$w2l_reinterpret_i32_to_f32',
    '$w2l_store_f32',
    '$w2l_store_f64',
    '$w2l_trunc_f32',
    '$w2l_trunc_f64',
    '$w2l_trunc_sat_s_f32_to_i32',
    '$w2l_trunc_sat_s_f64_to_i32',
    '$w2l_trunc_sat_u_f32_to_i32',
    '$w2l_trunc_sat_u_f64_to_i32',
    '$w2l_trunc_u_f32_to_i32',
    '$w2l_trunc_u_f64_to_i32'
  ];
};

/**
 * @override
 * @param {string} name
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.safeName_ = function (name) {
  return Wasm2Lang.Backend.AbstractCodegen.resolveReservedIdentifier_(
    Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(name),
    Wasm2Lang.Backend.AsmjsCodegen.RESERVED_
  );
};
