'use strict';

/**
 * Returns a stable short name for a wasm value type.
 *
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.ValueType.typeName = function (binaryen, wasmType) {
  if (binaryen.none === wasmType || 0 === wasmType) {
    return 'none';
  }
  if (binaryen.i32 === wasmType) {
    return 'i32';
  }
  if (binaryen.f32 === wasmType) {
    return 'f32';
  }
  if (binaryen.f64 === wasmType) {
    return 'f64';
  }
  if (binaryen.i64 === wasmType) {
    return 'i64';
  }
  return 'type(' + wasmType + ')';
};

/**
 * Returns the wasm type of a local by index.
 *
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {number} localIndex
 * @return {number}
 */
Wasm2Lang.Backend.ValueType.getLocalType = function (binaryen, funcInfo, localIndex) {
  var /** @const {!Array<number>} */ params = binaryen.expandType(funcInfo.params);
  if (localIndex < params.length) {
    return params[localIndex];
  }
  localIndex -= params.length;
  return localIndex < funcInfo.vars.length ? funcInfo.vars[localIndex] : binaryen.none;
};

/**
 * Returns true when the wasm type is i32.
 *
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {boolean}
 */
Wasm2Lang.Backend.ValueType.isI32 = function (binaryen, wasmType) {
  return binaryen.i32 === wasmType;
};

/**
 * Returns true when the wasm type is f32.
 *
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {boolean}
 */
Wasm2Lang.Backend.ValueType.isF32 = function (binaryen, wasmType) {
  return binaryen.f32 === wasmType;
};

/**
 * Returns true when the wasm type is f64.
 *
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {boolean}
 */
Wasm2Lang.Backend.ValueType.isF64 = function (binaryen, wasmType) {
  return binaryen.f64 === wasmType;
};

/**
 * Returns true when the wasm type is i64.
 *
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {boolean}
 */
Wasm2Lang.Backend.ValueType.isI64 = function (binaryen, wasmType) {
  return binaryen.i64 === wasmType;
};

/**
 * Returns true when the wasm type is either f32 or f64.
 *
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {boolean}
 */
Wasm2Lang.Backend.ValueType.isFloat = function (binaryen, wasmType) {
  return binaryen.f32 === wasmType || binaryen.f64 === wasmType;
};
