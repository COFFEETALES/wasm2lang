'use strict';

/**
 * @override
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.getFixedModuleBindings_ = function (options) {
  void options;
  return ['buffer'];
};

/**
 * @override
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.getAllHelperNames_ = function () {
  return [
    '$w2l_convert_u_i32_to_f32',
    '$w2l_convert_u_i32_to_f64',
    '$w2l_convert_u_i64_to_f32',
    '$w2l_convert_u_i64_to_f64',
    '$w2l_nearest_f32',
    '$w2l_nearest_f64',
    '$w2l_trunc_f32',
    '$w2l_trunc_f64',
    '$w2l_trunc_s_f32_to_i32',
    '$w2l_trunc_s_f64_to_i32',
    '$w2l_trunc_sat_s_f32_to_i32',
    '$w2l_trunc_sat_s_f64_to_i32',
    '$w2l_trunc_sat_u_f32_to_i32',
    '$w2l_trunc_sat_u_f64_to_i32',
    '$w2l_trunc_u_f32_to_i32',
    '$w2l_trunc_u_f64_to_i32',
    '$w2l_trunc_s_f32_to_i64',
    '$w2l_trunc_s_f64_to_i64',
    '$w2l_trunc_sat_s_f32_to_i64',
    '$w2l_trunc_sat_s_f64_to_i64',
    '$w2l_trunc_sat_u_f32_to_i64',
    '$w2l_trunc_sat_u_f64_to_i64',
    '$w2l_trunc_u_f32_to_i64',
    '$w2l_trunc_u_f64_to_i64',
    '$w2l_memory_copy',
    '$w2l_memory_fill',
    '$w2l_memory_grow',
    '$w2l_v128_load',
    '$w2l_v128_store'
  ];
};

/**
 * Maps a wasm value type to a Java type name.
 *
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.javaTypeName_ = function (binaryen, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) return 'int';
  if (Wasm2Lang.Backend.ValueType.isI64(binaryen, wasmType)) return 'long';
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) return 'float';
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) return 'double';
  if (Wasm2Lang.Backend.ValueType.isV128(binaryen, wasmType)) return 'IntVector';
  return 'void';
};

/**
 * Formats a float literal for Java (appends {@code f} suffix for f32).
 *
 * @param {number} value
 * @param {boolean} isF32
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.formatJavaFloat_ = function (value, isF32) {
  var /** @const {string} */ typePrefix = isF32 ? 'Float.' : 'Double.';
  if (value !== value) {
    return typePrefix + 'NaN';
  }
  if (!isFinite(value)) {
    return typePrefix + (0 < value ? 'POSITIVE_INFINITY' : 'NEGATIVE_INFINITY');
  }
  var /** @const {string} */ s = Wasm2Lang.Backend.AbstractCodegen.formatFloatLiteral_(value);
  return isF32 ? s + 'f' : s;
};
