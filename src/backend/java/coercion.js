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
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    // Java int is 32-bit — no truncation needed.
    return expr;
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return '(float)' + P.wrap(expr, P.PREC_UNARY_, true);
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return '(double)' + P.wrap(expr, P.PREC_UNARY_, true);
  }
  return expr;
};

/**
 * @override
 * @protected
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
 * @override
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
 * @param {!Binaryen} binaryen
 * @param {number} unaryCategory
 * @param {string} operandExpr
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitI32Unary_ = function (binaryen, unaryCategory, operandExpr) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (C.UNARY_EQZ === unaryCategory) {
    return {
      emittedString: P.renderInfix(operandExpr, '==', '0', P.PREC_EQUALITY_),
      resultCat: Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32
    };
  }
  if (C.UNARY_CLZ === unaryCategory) {
    return {emittedString: 'Integer.numberOfLeadingZeros(' + operandExpr + ')', resultCat: C.SIGNED};
  }
  if (C.UNARY_CTZ === unaryCategory) {
    return {emittedString: 'Integer.numberOfTrailingZeros(' + operandExpr + ')', resultCat: C.SIGNED};
  }
  if (C.UNARY_POPCNT === unaryCategory) {
    return {emittedString: 'Integer.bitCount(' + operandExpr + ')', resultCat: C.SIGNED};
  }
  if (C.UNARY_EXTEND8_S === unaryCategory) {
    return {emittedString: '(byte)' + P.wrap(operandExpr, P.PREC_UNARY_, true), resultCat: C.SIGNED};
  }
  if (C.UNARY_EXTEND16_S === unaryCategory) {
    return {emittedString: '(short)' + P.wrap(operandExpr, P.PREC_UNARY_, true), resultCat: C.SIGNED};
  }
  return null;
};
