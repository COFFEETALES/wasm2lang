'use strict';

// ---------------------------------------------------------------------------
// Coercion overrides for JavaScript.
//
// Boundary annotations (function params, return values, call arguments) are
// relaxed to match the base-class default that only coerces when the
// expression category does not already satisfy the target type.  Intermediate
// expressions still follow asm.js coercion rules for i32 overflow (|0), f32
// precision (Math.fround), and unsigned semantics (>>>0).  i64 values flow as
// BigInt; i64-producing operations wrap their results with BigInt.asIntN(64)
// to preserve wasm wrap-around semantics.
// ---------------------------------------------------------------------------

/**
 * JavaScript does not require explicit type annotations at boundaries.
 * Delegates to {@code coerceToType_} which only coerces when the expression
 * category does not already satisfy the target type.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} cat
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.coerceAtBoundary_ = function (binaryen, expr, cat, wasmType) {
  return this.coerceToType_(binaryen, expr, cat, wasmType);
};

/**
 * JavaScript switch accepts any value — no signed coercion needed for the
 * discriminant when all cases are integer literals already.
 *
 * @override
 * @protected
 * @param {string} condStr
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.coerceSwitchCondition_ = function (condStr) {
  return condStr;
};

/**
 * JavaScript comparisons yield {@code true}/{@code false}, not 0/1 — so the
 * asm.js override (return expression unchanged) is wrong here.  Use the
 * base-class ternary form so boolean results materialize as an integer when
 * consumed by switch dispatch or bitwise combinators.  Wrap the materialized
 * ternary in parens because the result may be embedded in a higher-precedence
 * context such as the condition of an outer ternary (Select), where
 * {@code expr ? 1 : 0 ? a : b} would otherwise re-associate as
 * {@code expr ? 1 : (0 ? a : b)}.
 *
 * @override
 * @protected
 * @param {string} conditionExpr
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderNumericComparisonResult_ = function (conditionExpr) {
  return '(' + conditionExpr + ' ? 1 : 0)';
};

/**
 * Asm.js collapses comparison results to integer category because its type
 * system forces 0/1 integers at the op level.  JavaScript comparisons yield
 * boolean values, so the result category must stay {@code CAT_BOOL_I32} so
 * that consumers (switch discriminants, bitwise combinators, coercion to
 * integer types) know to materialize the boolean via {@code ? 1 : 0}.
 *
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @return {number}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.i32BinaryResultCat_ = function (info) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (C.OP_COMPARISON === info.category) return Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32;
  return Wasm2Lang.Backend.AsmjsCodegen.prototype.i32BinaryResultCat_.call(this, info);
};

/**
 * Float comparison results are booleans in JavaScript, not integer 0/1.
 *
 * @override
 * @protected
 * @return {number}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.numericComparisonCat_ = function () {
  return Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32;
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderCoercionByType_ = function (binaryen, expr, wasmType) {
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  if (V.isI64(binaryen, wasmType)) {
    return 'BigInt.asIntN(64, ' + Wasm2Lang.Backend.AbstractCodegen.Precedence_.stripOuter(expr) + ')';
  }
  // JavaScript numbers are doubles by default — no explicit +x coercion needed.
  if (V.isF64(binaryen, wasmType)) return expr;
  return Wasm2Lang.Backend.AsmjsCodegen.prototype.renderCoercionByType_.call(this, binaryen, expr, wasmType);
};

/**
 * Renders a binaryen i64 constant as a BigInt literal.
 *
 * BigInt has no fixed width — hex literals are interpreted as their
 * mathematical value, not as a signed two's-complement bit pattern.  When
 * the input arrives as a BigInt (binaryen 129+), stringify directly so that
 * negative i64 values stay negative; only the {@code {low, high}} object
 * form requires the shared low/high hex emission.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {*} value
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderI64Const_ = function (binaryen, value) {
  void binaryen;
  if ('bigint' === typeof value) return String(value) + 'n';
  return Wasm2Lang.Backend.AbstractCodegen.formatI64WithSuffix_(value, 'n');
};

/**
 * @override
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  if (V.isI64(binaryen, wasmType)) return '0n';
  if (V.isF32(binaryen, wasmType)) return this.renderMathFroundCall_('0');
  return '0';
};

/**
 * Runtime-helper name for each i64 {@code UNARY_*} category that dispatches
 * to a polyfill (bit-counting operations have no native BigInt equivalent).
 *
 * @const {!Object<number, string>}
 * @private
 */
Wasm2Lang.Backend.JavaScriptCodegen.JS_I64_UNARY_HELPERS_ = /** @return {!Object<number, string>} */ (function () {
  var /** @const */ I = Wasm2Lang.Backend.I64Coercion;
  var /** @const {!Object<number, string>} */ table = {};
  table[I.UNARY_CLZ] = '$w2l_i64_clz';
  table[I.UNARY_CTZ] = '$w2l_i64_ctz';
  table[I.UNARY_POPCNT] = '$w2l_i64_popcnt';
  return table;
})();

/**
 * Bit width to pass to {@code BigInt.asIntN} for each sign-extend
 * {@code UNARY_*} category.
 *
 * @const {!Object<number, number>}
 * @private
 */
Wasm2Lang.Backend.JavaScriptCodegen.JS_I64_UNARY_EXTEND_WIDTHS_ = /** @return {!Object<number, number>} */ (function () {
  var /** @const */ I = Wasm2Lang.Backend.I64Coercion;
  var /** @const {!Object<number, number>} */ table = {};
  table[I.UNARY_EXTEND8_S] = 8;
  table[I.UNARY_EXTEND16_S] = 16;
  table[I.UNARY_EXTEND32_S] = 32;
  return table;
})();

/**
 * BigInt-based i64 unary operations (eqz, clz, ctz, popcnt, sign-extend).
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} unaryCategory
 * @param {string} operandExpr
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.emitI64Unary_ = function (binaryen, unaryCategory, operandExpr) {
  var /** @const */ I = Wasm2Lang.Backend.I64Coercion;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ P = A.Precedence_;
  if (I.UNARY_EQZ === unaryCategory) {
    return {
      emittedString: P.renderInfix(operandExpr, '==', '0n', P.PREC_EQUALITY_),
      resultCat: A.CAT_BOOL_I32
    };
  }
  var /** @const {string|undefined} */ helperName = Wasm2Lang.Backend.JavaScriptCodegen.JS_I64_UNARY_HELPERS_[unaryCategory];
  if (helperName) {
    return {emittedString: this.renderHelperCall_(binaryen, helperName, [operandExpr], binaryen.i64), resultCat: A.CAT_I64};
  }
  var /** @const {number|undefined} */ extendWidth =
      Wasm2Lang.Backend.JavaScriptCodegen.JS_I64_UNARY_EXTEND_WIDTHS_[unaryCategory];
  if (extendWidth) {
    return {emittedString: 'BigInt.asIntN(' + extendWidth + ', ' + P.stripOuter(operandExpr) + ')', resultCat: A.CAT_I64};
  }
  return null;
};
