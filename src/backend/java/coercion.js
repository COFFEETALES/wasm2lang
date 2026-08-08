'use strict';

/** @override @protected */
Wasm2Lang.Backend.JavaCodegen.prototype.renderCoercionByType_ =
  Wasm2Lang.Backend.AbstractCodegen.prototype.renderPrimitiveCastCoercion_;

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
  return Wasm2Lang.Backend.AbstractCodegen.formatI64WithSuffix_(value, 'L');
};

/**
 * @override
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  return this.renderManagedLocalInit_(binaryen, wasmType, 'IntVector.zero(IntVector.SPECIES_128)');
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
  var /** @type {string} */ result = 'IntVector.broadcast(IntVector.SPECIES_128, ' + lanes[0] + ')';
  for (i = 1; i < 4; ++i) {
    result += '.withLane(' + i + ', ' + lanes[i] + ')';
  }
  return result;
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
 * i32 width spec for the shared {@code emitManagedIntUnary_} dispatch.
 * {@code bitOpArgType} is unused on Java — the default
 * {@code renderUnaryBitOpArg_} passes the operand bare.
 *
 * @const {!Wasm2Lang.Backend.AbstractCodegen.ManagedUnarySpec_}
 * @private
 */
Wasm2Lang.Backend.JavaCodegen.JAVA_I32_UNARY_SPEC_ = {
  eqzCat: Wasm2Lang.Backend.I32Coercion.UNARY_EQZ,
  zeroLit: '0',
  methods: Wasm2Lang.Backend.JavaCodegen.JAVA_I32_UNARY_METHODS_,
  casts: Wasm2Lang.Backend.JavaCodegen.JAVA_I32_UNARY_CASTS_,
  bitOpArgType: '',
  widenPrefix: '',
  resultCat: Wasm2Lang.Backend.I32Coercion.SIGNED
};

/**
 * i64 width spec for the shared {@code emitManagedIntUnary_} dispatch.  The
 * {@code (long)} widen prefix makes the narrowing casts' implicit widening
 * explicit so the result category stays CAT_I64-truthful.
 *
 * @const {!Wasm2Lang.Backend.AbstractCodegen.ManagedUnarySpec_}
 * @private
 */
Wasm2Lang.Backend.JavaCodegen.JAVA_I64_UNARY_SPEC_ = {
  eqzCat: Wasm2Lang.Backend.I64Coercion.UNARY_EQZ,
  zeroLit: '0L',
  methods: Wasm2Lang.Backend.JavaCodegen.JAVA_I64_UNARY_METHODS_,
  casts: Wasm2Lang.Backend.JavaCodegen.JAVA_I64_UNARY_CASTS_,
  bitOpArgType: '',
  widenPrefix: '(long)',
  resultCat: Wasm2Lang.Backend.AbstractCodegen.CAT_I64
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
  return this.emitManagedIntUnary_(unaryCategory, operandExpr, Wasm2Lang.Backend.JavaCodegen.JAVA_I32_UNARY_SPEC_);
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
  return this.emitManagedIntUnary_(unaryCategory, operandExpr, Wasm2Lang.Backend.JavaCodegen.JAVA_I64_UNARY_SPEC_);
};
