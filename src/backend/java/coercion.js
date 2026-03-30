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
    return expr;
  }
  if (Wasm2Lang.Backend.ValueType.isI64(binaryen, wasmType)) {
    return '(long)' + P.wrap(expr, P.PREC_UNARY_, true);
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
 * Renders a binaryen i64 constant as a Java {@code long} literal.
 * The value is a {@code {low: number, high: number}} object.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {*} value
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderI64Const_ = function (binaryen, value) {
  void binaryen;
  var /** @const {!Object} */ v = /** @type {!Object} */ (value);
  var /** @const {number} */ low = v['low'] >>> 0;
  var /** @const {number} */ high = v['high'] | 0;
  // Simple zero case.
  if (0 === low && 0 === high) return '0L';
  // Small positive: high is 0, fits in JS number precision.
  if (0 === high) return String(low) + 'L';
  // Small negative: high is -1 and low has bit 31 set.
  if (-1 === high && low >= 0x80000000) return String(low - 4294967296) + 'L';
  // General case: emit as hex to avoid JS number precision issues.
  var /** @const {string} */ hexHigh = (high >>> 0).toString(16);
  var /** @const {string} */ hexLow = ('00000000' + low.toString(16)).slice(-8);
  return '0x' + hexHigh + hexLow + 'L';
};

/**
 * @override
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI64(binaryen, wasmType)) {
    return '0L';
  }
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

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} unaryCategory
 * @param {string} operandExpr
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitI64Unary_ = function (binaryen, unaryCategory, operandExpr) {
  void binaryen;
  var /** @const */ I = Wasm2Lang.Backend.I64Coercion;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ P = A.Precedence_;
  if (I.UNARY_EQZ === unaryCategory) {
    return {
      emittedString: P.renderInfix(operandExpr, '==', '0L', P.PREC_EQUALITY_),
      resultCat: A.CAT_BOOL_I32
    };
  }
  if (I.UNARY_CLZ === unaryCategory) {
    return {emittedString: '(long)Long.numberOfLeadingZeros(' + operandExpr + ')', resultCat: A.CAT_I64};
  }
  if (I.UNARY_CTZ === unaryCategory) {
    return {emittedString: '(long)Long.numberOfTrailingZeros(' + operandExpr + ')', resultCat: A.CAT_I64};
  }
  if (I.UNARY_POPCNT === unaryCategory) {
    return {emittedString: '(long)Long.bitCount(' + operandExpr + ')', resultCat: A.CAT_I64};
  }
  if (I.UNARY_EXTEND8_S === unaryCategory) {
    return {emittedString: '(long)(byte)' + P.wrap(operandExpr, P.PREC_UNARY_, true), resultCat: A.CAT_I64};
  }
  if (I.UNARY_EXTEND16_S === unaryCategory) {
    return {emittedString: '(long)(short)' + P.wrap(operandExpr, P.PREC_UNARY_, true), resultCat: A.CAT_I64};
  }
  if (I.UNARY_EXTEND32_S === unaryCategory) {
    return {emittedString: '(long)(int)' + P.wrap(operandExpr, P.PREC_UNARY_, true), resultCat: A.CAT_I64};
  }
  return null;
};
