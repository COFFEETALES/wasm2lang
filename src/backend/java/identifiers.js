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
    '$w2l_nearest_f32',
    '$w2l_nearest_f64',
    '$w2l_trunc_f32',
    '$w2l_trunc_f64',
    '$w2l_trunc_sat_s_f32_to_i32',
    '$w2l_trunc_sat_s_f64_to_i32',
    '$w2l_trunc_sat_u_f32_to_i32',
    '$w2l_trunc_sat_u_f64_to_i32',
    '$w2l_trunc_u_f32_to_i32',
    '$w2l_trunc_u_f64_to_i32',
    '$w2l_memory_copy',
    '$w2l_memory_fill',
    '$w2l_memory_grow'
  ];
};

/**
 * @override
 * @param {string} name
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.safeName_ = function (name) {
  return Wasm2Lang.Backend.AbstractCodegen.resolveReservedIdentifier_(
    Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(name.replace(/[^a-zA-Z0-9_$]/g, '_')),
    Wasm2Lang.Backend.JavaCodegen.RESERVED_
  );
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
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) return 'float';
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) return 'double';
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
  if (value !== value) {
    return isF32 ? 'Float.NaN' : 'Double.NaN';
  }
  if (!isFinite(value)) {
    if (0 < value) {
      return isF32 ? 'Float.POSITIVE_INFINITY' : 'Double.POSITIVE_INFINITY';
    }
    return isF32 ? 'Float.NEGATIVE_INFINITY' : 'Double.NEGATIVE_INFINITY';
  }
  if (0 === value && 1 / value < 0) {
    return isF32 ? '-0.0f' : '-0.0';
  }
  var /** @const {string} */ s =
      Math.floor(value) === value && -1 === String(value).indexOf('e') && -1 === String(value).indexOf('E')
        ? String(value) + '.0'
        : String(value);
  return isF32 ? s + 'f' : s;
};
