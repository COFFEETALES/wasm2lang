'use strict';

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderCoercionByType_ = function (binaryen, expr, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    // Java int is 32-bit — no truncation needed.
    return expr;
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return '(float)(' + expr + ')';
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return '(double)(' + expr + ')';
  }
  return expr;
};

/**
 * Java widens float to double automatically, so CAT_F32 satisfies f64
 * targets without an explicit cast.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} cat
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.coerceToType_ = function (binaryen, expr, cat, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType) && Wasm2Lang.Backend.AbstractCodegen.CAT_F32 === cat) {
    return expr;
  }
  return Wasm2Lang.Backend.AbstractCodegen.prototype.coerceToType_.call(this, binaryen, expr, cat, wasmType);
};

/**
 * @param {!Binaryen} binaryen
 * @param {number} value
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderConst_ = function (binaryen, value, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return String(value);
  }
  return Wasm2Lang.Backend.JavaCodegen.formatJavaFloat_(value, Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType));
};

/**
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return '0.0f';
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return '0.0';
  }
  return '0';
};

/**
 * @override
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.getRuntimeHelperPrefix_ = function () {
  return '$w2l_';
};
