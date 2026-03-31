'use strict';

// ---------------------------------------------------------------------------
// Binary-op rendering (uses shared I32Coercion classification).
// ---------------------------------------------------------------------------

/**
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {number} */ len = expr.length;
  if (len >= 2 && '|' === expr.charAt(len - 2) && '0' === expr.charAt(len - 1)) {
    return expr;
  }
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr)) {
    return expr;
  }
  // Expressions whose top-level operator is &, ^, or | are already signed
  // in asm.js and do not need an extra |0 coercion.
  var /** @const {number} */ top = P.topLevel(expr);
  if (top <= P.PREC_BIT_AND_ && top >= P.PREC_BIT_OR_) {
    return expr;
  }
  return P.wrap(expr, P.PREC_BIT_OR_, true) + '|0';
};

/**
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr) && '-' !== expr.charAt(0)) {
    return expr;
  }
  return P.wrap(expr, P.PREC_SHIFT_, true) + '>>>0';
};

/**
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderDoubleCoercion_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ trimmed = expr.replace(/^\s+|\s+$/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(expr)) {
    return -1 === expr.indexOf('.') ? expr + '.0' : expr;
  }
  if (/^[+-]/.test(trimmed)) {
    return '+(' + expr + ')';
  }
  return '+' + P.wrap(expr, P.PREC_UNARY_, false);
};

/**
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderFloatCoercion_ = function (expr) {
  this.markBinding_('Math_fround');
  return this.n_('Math_fround') + '(' + Wasm2Lang.Backend.AbstractCodegen.Precedence_.stripOuter(expr) + ')';
};

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
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(condStr);
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
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(expr);
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return this.renderFloatCoercion_(expr);
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderDoubleCoercion_(expr);
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
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderConst_ = function (binaryen, value, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return String(value);
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return this.renderFloatCoercion_(Wasm2Lang.Backend.AbstractCodegen.formatFloatLiteral_(value));
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return Wasm2Lang.Backend.AbstractCodegen.formatFloatLiteral_(value);
  }
  return String(value);
};

/**
 * @override
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    this.markBinding_('Math_fround');
    return this.n_('Math_fround') + '(0.0)';
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
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitI32Unary_ = function (binaryen, unaryCategory, operandExpr) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (C.UNARY_EQZ === unaryCategory) {
    return {
      emittedString: Wasm2Lang.Backend.AbstractCodegen.Precedence_.renderPrefix('!', operandExpr),
      resultCat: C.INT
    };
  }
  if (C.UNARY_CLZ === unaryCategory) {
    this.markBinding_('Math_clz32');
    return {
      emittedString: this.n_('Math_clz32') + '(' + operandExpr + ')',
      resultCat: C.FIXNUM
    };
  }
  if (C.UNARY_CTZ === unaryCategory) {
    return {emittedString: this.renderHelperCall_(binaryen, '$w2l_ctz', [operandExpr], binaryen.i32), resultCat: C.SIGNED};
  }
  if (C.UNARY_POPCNT === unaryCategory) {
    return {emittedString: this.renderHelperCall_(binaryen, '$w2l_popcnt', [operandExpr], binaryen.i32), resultCat: C.SIGNED};
  }
  if (C.UNARY_EXTEND8_S === unaryCategory) {
    var /** @const */ P8 = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    return {
      emittedString: P8.renderInfix(P8.renderInfix(operandExpr, '<<', '24', P8.PREC_SHIFT_), '>>', '24', P8.PREC_SHIFT_),
      resultCat: C.SIGNED
    };
  }
  if (C.UNARY_EXTEND16_S === unaryCategory) {
    var /** @const */ P16 = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    return {
      emittedString: P16.renderInfix(P16.renderInfix(operandExpr, '<<', '16', P16.PREC_SHIFT_), '>>', '16', P16.PREC_SHIFT_),
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
  return C.SIGNED;
};

/** @override @protected @return {number} */
Wasm2Lang.Backend.AsmjsCodegen.prototype.numericComparisonCat_ = function () {
  return Wasm2Lang.Backend.I32Coercion.INT;
};

// buildCoercedCallArgs_, buildCoercedCallIndirectArgs_, and
// renderImplicitReturn_ are no longer overridden here — the base class
// implementations now delegate to coerceAtBoundary_ which asm.js
// overrides above to always apply the type annotation.
