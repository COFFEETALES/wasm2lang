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
Wasm2Lang.Backend.JavaCodegen.prototype.renderNumericUnaryOp_ = function (binaryen, info, valueExpr, opt_valueCat) {
  var /** @const {string} */ name = info.opName;
  var /** @const {boolean} */ isF32 = Wasm2Lang.Backend.ValueType.isF32(binaryen, info.operandType);
  var /** @const {number} */ cat = opt_valueCat != null ? opt_valueCat : Wasm2Lang.Backend.AbstractCodegen.CAT_RAW;
  var /** @type {string} */ inner;

  // neg: Java negation preserves float type — skip coercion when input category confirms type.
  if ('neg' === name) {
    var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    return this.coerceToType_(binaryen, P.renderPrefix('-', valueExpr), cat, info.retType);
  }

  if ('abs' === name) {
    if (isF32) {
      inner = this.coerceToType_(binaryen, valueExpr, cat, info.operandType);
      return '(float)Math.abs(' + inner + ')';
    }
    return 'Math.abs(' + valueExpr + ')';
  }
  if ('ceil' === name || 'floor' === name || 'sqrt' === name || 'nearest' === name) {
    var /** @const {string} */ mathName = 'nearest' === name ? 'rint' : name;
    if (isF32) {
      inner = this.coerceToType_(binaryen, valueExpr, cat, info.operandType);
      return '(float)Math.' + mathName + '(' + inner + ')';
    }
    return 'Math.' + mathName + '(' + valueExpr + ')';
  }

  if ('convert_s_i32_to_f32' === name) return '(float)(' + valueExpr + ')';
  if ('convert_u_i32_to_f32' === name) return '(float)Integer.toUnsignedLong(' + valueExpr + ')';
  if ('convert_s_i32_to_f64' === name) return '(double)(' + valueExpr + ')';
  if ('convert_u_i32_to_f64' === name) return '(double)Integer.toUnsignedLong(' + valueExpr + ')';

  if ('demote_f64_to_f32' === name) return '(float)(' + valueExpr + ')';
  if ('promote_f32_to_f64' === name) return '(double)(' + valueExpr + ')';

  if ('trunc_s_f32_to_i32' === name || 'trunc_s_f64_to_i32' === name) {
    inner = this.coerceToType_(binaryen, valueExpr, cat, info.operandType);
    return '(int)(' + inner + ')';
  }

  if ('reinterpret_f32_to_i32' === name) {
    inner = this.coerceToType_(binaryen, valueExpr, cat, info.operandType);
    return 'Float.floatToRawIntBits(' + inner + ')';
  }
  if ('reinterpret_i32_to_f32' === name) return 'Float.intBitsToFloat(' + valueExpr + ')';

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
Wasm2Lang.Backend.JavaCodegen.prototype.renderNumericBinaryOp_ = function (binaryen, info, L, R, opt_catL, opt_catR) {
  var /** @const {boolean} */ isF32 = Wasm2Lang.Backend.ValueType.isF32(binaryen, info.retType);

  if ('min' === info.opName) {
    if (isF32) return '(float)Math.min((double)(' + L + '), (double)(' + R + '))';
    return 'Math.min(' + L + ', ' + R + ')';
  }
  if ('max' === info.opName) {
    if (isF32) return '(float)Math.max((double)(' + L + '), (double)(' + R + '))';
    return 'Math.max(' + L + ', ' + R + ')';
  }
  if ('copysign' === info.opName) {
    if (isF32) return '(float)Math.copySign((double)(' + L + '), (double)(' + R + '))';
    return 'Math.copySign(' + L + ', ' + R + ')';
  }

  if (info.isComparison) {
    return Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericBinaryOp_.call(this, binaryen, info, L, R);
  }

  // Java float/double arithmetic preserves the operand type — no cast needed.
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {number} */ prec = P.PREC_ADDITIVE_;
  if ('mul' === info.opName || 'div' === info.opName) {
    prec = P.PREC_MULTIPLICATIVE_;
  }
  return P.renderInfix(L, info.opStr, R, prec);
};

// renderNumericComparisonResult_: inherited from AbstractCodegen (ternary ? 1 : 0).
