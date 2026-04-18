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
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {?string} */ cast = null;
  if (V.isI64(binaryen, wasmType)) cast = '(long)';
  else if (V.isF32(binaryen, wasmType)) cast = '(float)';
  else if (V.isF64(binaryen, wasmType)) cast = '(double)';
  return null === cast ? expr : cast + P.wrap_(expr, P.PREC_UNARY_, true);
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
  if (Wasm2Lang.Backend.ValueType.isV128(binaryen, wasmType)) {
    return Wasm2Lang.Backend.JavaCodegen.renderV128Const_(value);
  }
  return Wasm2Lang.Backend.JavaCodegen.formatJavaFloat_(value, Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType));
};

/**
 * Renders a binaryen i64 constant as a Java {@code long} literal.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {*} value
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderI64Const_ = function (binaryen, value) {
  void binaryen;
  return Wasm2Lang.Backend.AbstractCodegen.formatI64WithSuffix_(value, 'L');
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
  if (Wasm2Lang.Backend.ValueType.isV128(binaryen, wasmType)) {
    return 'IntVector.zero(IntVector.SPECIES_128)';
  }
  return '0';
};

/**
 * Renders a v128 constant as a Java IntVector literal.  The binaryen v128
 * value is an ArrayLike of 16 bytes (little-endian); we reinterpret them
 * as four i32 lanes.
 *
 * @param {*} value  16-byte array-like from binaryen.
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.renderV128Const_ = function (value) {
  var /** @const {!Array<number>} */ bytes = /** @type {!Array<number>} */ (value);
  var /** @const {!Array<number>} */ lanes = [];
  for (var /** @type {number} */ i = 0; i < 4; ++i) {
    var /** @const {number} */ off = i * 4;
    // Little-endian byte order → i32 lane.
    lanes[i] =
      (bytes[off] & 0xff) | ((bytes[off + 1] & 0xff) << 8) | ((bytes[off + 2] & 0xff) << 16) | (bytes[off + 3] << 24) | 0;
  }
  return 'IntVector.fromArray(IntVector.SPECIES_128, new int[]{' + lanes.join(', ') + '}, 0)';
};

/**
 * Method name for each i32 {@code UNARY_*} category that dispatches to a
 * static {@code Integer.XXX} call.  Keyed by the numeric UNARY_* constant.
 *
 * @const {!Object<number, string>}
 * @private
 */
Wasm2Lang.Backend.JavaCodegen.JAVA_I32_UNARY_METHODS_ = /** @type {!Object<number, string>} */ (
  Wasm2Lang.Backend.I32Coercion.buildKeyedTable([
    [Wasm2Lang.Backend.I32Coercion.UNARY_CLZ, 'Integer.numberOfLeadingZeros'],
    [Wasm2Lang.Backend.I32Coercion.UNARY_CTZ, 'Integer.numberOfTrailingZeros'],
    [Wasm2Lang.Backend.I32Coercion.UNARY_POPCNT, 'Integer.bitCount']
  ])
);

/**
 * Target Java primitive type for each sign-extend {@code UNARY_*} category.
 * The resulting cast narrows the operand to the named type before widening
 * back to the containing integer.
 *
 * @const {!Object<number, string>}
 * @private
 */
Wasm2Lang.Backend.JavaCodegen.JAVA_I32_UNARY_CASTS_ = /** @type {!Object<number, string>} */ (
  Wasm2Lang.Backend.I32Coercion.buildKeyedTable([
    [Wasm2Lang.Backend.I32Coercion.UNARY_EXTEND8_S, 'byte'],
    [Wasm2Lang.Backend.I32Coercion.UNARY_EXTEND16_S, 'short']
  ])
);

/**
 * Method name for each i64 {@code UNARY_*} category that dispatches to a
 * static {@code Long.XXX} call.
 *
 * @const {!Object<number, string>}
 * @private
 */
Wasm2Lang.Backend.JavaCodegen.JAVA_I64_UNARY_METHODS_ = /** @type {!Object<number, string>} */ (
  Wasm2Lang.Backend.I32Coercion.buildKeyedTable([
    [Wasm2Lang.Backend.I64Coercion.UNARY_CLZ, 'Long.numberOfLeadingZeros'],
    [Wasm2Lang.Backend.I64Coercion.UNARY_CTZ, 'Long.numberOfTrailingZeros'],
    [Wasm2Lang.Backend.I64Coercion.UNARY_POPCNT, 'Long.bitCount']
  ])
);

/**
 * Target Java primitive type for each i64 sign-extend {@code UNARY_*}
 * category.  The narrowing cast is followed by an implicit widening back to
 * {@code long}, which the emitter expresses with an explicit {@code (long)}
 * prefix so the result category stays CAT_I64.
 *
 * @const {!Object<number, string>}
 * @private
 */
Wasm2Lang.Backend.JavaCodegen.JAVA_I64_UNARY_CASTS_ = /** @type {!Object<number, string>} */ (
  Wasm2Lang.Backend.I32Coercion.buildKeyedTable([
    [Wasm2Lang.Backend.I64Coercion.UNARY_EXTEND8_S, 'byte'],
    [Wasm2Lang.Backend.I64Coercion.UNARY_EXTEND16_S, 'short'],
    [Wasm2Lang.Backend.I64Coercion.UNARY_EXTEND32_S, 'int']
  ])
);

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} unaryCategory
 * @param {string} operandExpr
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitI32Unary_ = function (binaryen, unaryCategory, operandExpr) {
  void binaryen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (C.UNARY_EQZ === unaryCategory) {
    return {
      emittedString: P.renderInfix(operandExpr, '==', '0', P.PREC_EQUALITY_),
      resultCat: Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32
    };
  }
  var /** @const {string|undefined} */ method = Wasm2Lang.Backend.JavaCodegen.JAVA_I32_UNARY_METHODS_[unaryCategory];
  if (method) return {emittedString: method + '(' + operandExpr + ')', resultCat: C.SIGNED};
  var /** @const {string|undefined} */ cast = Wasm2Lang.Backend.JavaCodegen.JAVA_I32_UNARY_CASTS_[unaryCategory];
  if (cast) return {emittedString: '(' + cast + ')' + P.wrap_(operandExpr, P.PREC_UNARY_, true), resultCat: C.SIGNED};
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
  var /** @const {string|undefined} */ method = Wasm2Lang.Backend.JavaCodegen.JAVA_I64_UNARY_METHODS_[unaryCategory];
  if (method) return {emittedString: '(long)' + method + '(' + operandExpr + ')', resultCat: A.CAT_I64};
  var /** @const {string|undefined} */ cast = Wasm2Lang.Backend.JavaCodegen.JAVA_I64_UNARY_CASTS_[unaryCategory];
  if (cast) return {emittedString: '(long)(' + cast + ')' + P.wrap_(operandExpr, P.PREC_UNARY_, true), resultCat: A.CAT_I64};
  return null;
};
