'use strict';

// ---------------------------------------------------------------------------
// asm.js-specific coercion overrides.  The static helpers
// ({@code renderSignedCoercion_} / {@code renderUnsignedCoercion_} /
// {@code renderDoubleCoercion_}) and the {@code renderFloatCoercion_}
// prototype method live in {@code jscommon/coercion.js}.
// ---------------------------------------------------------------------------

/**
 * asm.js requires explicit type annotations at call/return boundaries.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} cat
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.coerceAtBoundary_ = function (binaryen, expr, cat, wasmType) {
  // Skip coercion when the expression category already satisfies the target
  // asm.js type.  i32: fixnum/signed are valid return/arg types; INT (local.get,
  // comparisons, eqz) and UNSIGNED (>>>) still need coercion.  f32/f64:
  // already-typed expressions (Math_fround / +expr) don't need double wrapping.
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType) && (C.FIXNUM === cat || C.SIGNED === cat)) {
    return expr;
  }
  if (A.CAT_F32 === cat && Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return expr;
  }
  if (A.CAT_F64 === cat && Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return expr;
  }
  return this.renderCoercionByType_(binaryen, expr, wasmType);
};

/**
 * @override
 * @protected
 * @param {string} condStr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.coerceSwitchCondition_ = function (condStr) {
  return Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(condStr);
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderCoercionByType_ = function (binaryen, expr, wasmType) {
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  var /** @const */ J = Wasm2Lang.Backend.JsCommonCodegen;
  if (V.isI32(binaryen, wasmType)) return J.renderSignedCoercion_(expr);
  if (V.isF32(binaryen, wasmType)) return this.renderFloatCoercion_(expr);
  if (V.isF64(binaryen, wasmType)) return J.renderDoubleCoercion_(expr);
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
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderConst_ = function (binaryen, value, wasmType) {
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  if (V.isI32(binaryen, wasmType)) return String(value);
  var /** @const {string} */ literal = Wasm2Lang.Backend.AbstractCodegen.formatFloatLiteral_(value);
  if (V.isF32(binaryen, wasmType)) return this.renderFloatCoercion_(literal);
  if (V.isF64(binaryen, wasmType)) return literal;
  return String(value);
};

/**
 * @override
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  if (V.isF32(binaryen, wasmType)) return this.renderMathFroundCall_('0.0');
  if (V.isF64(binaryen, wasmType)) return '0.0';
  return '0';
};

/**
 * Renders a direct-cast import (module = {@code "cast"}) as an inline
 * expression.  Asm.js handles every cast by bridging between i32 and
 * f32/f64 using the native {@code ~~}, {@code |0}, {@code >>>0},
 * {@code Math.fround}, and {@code +} coercions.
 *
 * Subclasses that represent i64 with a host-language type incompatible
 * with asm.js coercion operators (e.g., JavaScript's BigInt — rejects
 * {@code Math.fround}, {@code |0}, {@code ~~}, {@code +expr}) override
 * this to emit their own BigInt-aware inline code and delegate to the
 * asm.js implementation for non-i64 casts.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} castBaseName
 * @param {number} castInputType
 * @param {number} callType
 * @param {string} inputExpr
 * @param {number} inputCat
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderCastImportInline_ = function (
  binaryen,
  castBaseName,
  castInputType,
  callType,
  inputExpr,
  inputCat
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ J = Wasm2Lang.Backend.JsCommonCodegen;
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  if (V.isI32(binaryen, callType)) {
    // float/double → i32: promote float to double with +, then ~~ truncation.
    var /** @type {string} */ castTruncInput = inputExpr;
    if (V.isF32(binaryen, castInputType)) {
      castTruncInput = J.renderDoubleCoercion_(castTruncInput);
    }
    return {
      emittedString: '~~' + A.Precedence_.wrap_(castTruncInput, A.Precedence_.PREC_UNARY_, false),
      resultCat: C.SIGNED
    };
  }
  // int → float/double: coerce to signed (i32) or unsigned (u32), then apply target coercion.
  var /** @const {boolean} */ castIsUnsigned = -1 !== castBaseName.indexOf('u');
  var /** @const {string} */ castInput = castIsUnsigned
      ? J.renderUnsignedCoercion_(inputExpr)
      : this.coerceAtBoundary_(binaryen, inputExpr, inputCat, castInputType);
  return {
    emittedString: this.renderCoercionByType_(binaryen, castInput, callType),
    resultCat: A.catForCoercedType_(binaryen, callType)
  };
};

/**
 * Runtime-helper name for each i32 {@code UNARY_*} category that dispatches
 * to a polyfill (CTZ/POPCNT have no single-instruction JS equivalent).
 *
 * @const {!Object<number, string>}
 * @private
 */
Wasm2Lang.Backend.AsmjsCodegen.ASMJS_I32_UNARY_HELPERS_ = /** @return {!Object<number, string>} */ (function () {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const {!Object<number, string>} */ table = {};
  table[C.UNARY_CTZ] = '$w2l_ctz';
  table[C.UNARY_POPCNT] = '$w2l_popcnt';
  return table;
})();

/**
 * Shift amount used to express {@code extendN_s} as a paired left/right-
 * shift (fills the high bits via sign-extending right shift).  Keyed by the
 * numeric {@code UNARY_*} constant.
 *
 * @const {!Object<number, number>}
 * @private
 */
Wasm2Lang.Backend.AsmjsCodegen.ASMJS_I32_UNARY_EXTEND_SHIFTS_ = /** @return {!Object<number, number>} */ (function () {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const {!Object<number, number>} */ table = {};
  table[C.UNARY_EXTEND8_S] = 24;
  table[C.UNARY_EXTEND16_S] = 16;
  return table;
})();

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} unaryCategory
 * @param {string} operandExpr
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitI32Unary_ = function (binaryen, unaryCategory, operandExpr) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (C.UNARY_EQZ === unaryCategory) {
    return {emittedString: P.renderPrefix('!', operandExpr), resultCat: C.INT};
  }
  if (C.UNARY_CLZ === unaryCategory) {
    this.markBinding_('Math_clz32');
    return {emittedString: this.n_('Math_clz32') + '(' + operandExpr + ')', resultCat: C.FIXNUM};
  }
  var /** @const {string|undefined} */ helperName = Wasm2Lang.Backend.AsmjsCodegen.ASMJS_I32_UNARY_HELPERS_[unaryCategory];
  if (helperName) {
    return {emittedString: this.renderHelperCall_(binaryen, helperName, [operandExpr], binaryen.i32), resultCat: C.SIGNED};
  }
  var /** @const {number|undefined} */ shift = Wasm2Lang.Backend.AsmjsCodegen.ASMJS_I32_UNARY_EXTEND_SHIFTS_[unaryCategory];
  if (shift) {
    var /** @const {string} */ shiftStr = String(shift);
    return {
      emittedString: P.renderInfix(P.renderInfix(operandExpr, '<<', shiftStr, P.PREC_SHIFT_), '>>', shiftStr, P.PREC_SHIFT_),
      resultCat: C.SIGNED
    };
  }
  return null;
};

/**
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @return {number}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.i32BinaryResultCat_ = function (info) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (C.OP_COMPARISON === info.category) return C.INT;
  if (C.OP_BITWISE === info.category && info.unsigned) return C.UNSIGNED;
  if (C.OP_BITWISE === info.category) return C.SIGNED;
  if (C.OP_MULTIPLY === info.category) return C.SIGNED;
  if (C.OP_ROTATE === info.category) return C.SIGNED;
  return C.INTISH;
};

/** @override @protected @return {number} */
Wasm2Lang.Backend.AsmjsCodegen.prototype.numericComparisonCat_ = function () {
  return Wasm2Lang.Backend.I32Coercion.INT;
};

/**
 * @override
 * @protected
 * @param {string} operand
 * @param {number} cat
 * @param {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo=} opt_opInfo
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.prepareI32BinaryOperand_ = function (operand, cat, opt_opInfo) {
  void opt_opInfo;
  if (Wasm2Lang.Backend.I32Coercion.INTISH === cat) {
    return Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(operand);
  }
  return operand;
};

// buildCoercedCallArgs_, buildCoercedCallIndirectArgs_, and
// renderImplicitReturn_ are no longer overridden here — the base class
// implementations now delegate to coerceAtBoundary_ which asm.js
// overrides above to always apply the type annotation.
