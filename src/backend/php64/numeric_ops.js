'use strict';

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.UnaryOpInfo} info
 * @param {string} valueExpr
 * @param {number=} opt_valueCat
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderNumericUnaryOp_ = function (binaryen, info, valueExpr, opt_valueCat) {
  var /** @const {string} */ name = info.opName;
  var /** @const {boolean} */ isF32 = Wasm2Lang.Backend.ValueType.isF32(binaryen, info.operandType);
  var /** @const {string} */ nF32 = this.n_('_w2l_f32');
  var /** @const */ self = this;
  // Operand coercion dispatcher shared by every op below.  When the caller
  // provided a precise {@code opt_valueCat}, route through
  // {@code coerceToType_} so already-compatible categories skip the wrap;
  // otherwise fall back to type-based coercion (the safe-but-unconditional
  // {@code renderCoercionByType_}).
  /** @param {number} wasmType @return {string} */
  var coerceOperand = function (wasmType) {
    return null != opt_valueCat
      ? self.coerceToType_(binaryen, valueExpr, /** @type {number} */ (opt_valueCat), wasmType)
      : self.renderCoercionByType_(binaryen, valueExpr, wasmType);
  };

  if ('abs' === name || 'ceil' === name || 'floor' === name || 'sqrt' === name) {
    var /** @const {string} */ mathArg = coerceOperand(info.operandType);
    if (isF32) {
      return nF32 + '(' + name + '(' + mathArg + '))';
    }
    return name + '(' + mathArg + ')';
  }

  if ('convert_s_i32_to_f32' === name) {
    return nF32 + '(' + coerceOperand(binaryen.i32) + ')';
  }
  if ('convert_s_i32_to_f64' === name) {
    return '(float)' + coerceOperand(binaryen.i32);
  }

  if ('demote_f64_to_f32' === name) {
    return nF32 + '(' + coerceOperand(info.operandType) + ')';
  }
  if ('promote_f32_to_f64' === name) {
    // PHP float is f64 — the f32 operand is already a PHP float, promotion is a no-op.
    return valueExpr;
  }

  // f64/f32 neg: negation of a float is always float — WASM typing guarantees
  // the operand is already the correct float type, skip the coercion wrapper.
  if ('neg' === name) {
    var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    return isF32 ? nF32 + '(' + P.renderPrefix('-', valueExpr) + ')' : P.renderPrefix('-', valueExpr);
  }

  return Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericUnaryOp_.call(this, binaryen, info, valueExpr, opt_valueCat);
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @param {number=} opt_catL
 * @param {number=} opt_catR
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderNumericBinaryOp_ = function (binaryen, info, L, R, opt_catL, opt_catR) {
  var /** @const */ self = this;
  /** @param {string} expr @param {number=} cat @return {string} */
  var coerce = function (expr, cat) {
    return null != cat
      ? self.coerceToType_(binaryen, expr, /** @type {number} */ (cat), info.retType)
      : self.renderCoercionByType_(binaryen, expr, info.retType);
  };

  if ('min' === info.opName || 'max' === info.opName) {
    var /** @const {string} */ fn = info.opName;
    if (Wasm2Lang.Backend.ValueType.isF32(binaryen, info.retType)) {
      return this.n_('_w2l_f32') + '(' + fn + '(' + coerce(L, opt_catL) + ', ' + coerce(R, opt_catR) + '))';
    }
    return fn + '(' + coerce(L, opt_catL) + ', ' + coerce(R, opt_catR) + ')';
  }

  // f64 arithmetic: coerce operands individually — PHP float arithmetic
  // preserves the float type, so the outer (float) wrap is unnecessary.
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, info.retType) && !info.isComparison && '' !== info.opStr) {
    var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    var /** @type {number} */ precedence = P.PREC_ADDITIVE_;
    if ('mul' === info.opName || 'div' === info.opName) {
      precedence = P.PREC_MULTIPLICATIVE_;
    }
    return P.renderInfix(coerce(L, opt_catL), info.opStr, coerce(R, opt_catR), precedence);
  }

  return Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericBinaryOp_.call(this, binaryen, info, L, R);
};

// renderNumericComparisonResult_: inherited from AbstractCodegen (ternary ? 1 : 0).
