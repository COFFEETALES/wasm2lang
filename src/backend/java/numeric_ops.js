'use strict';

/**
 * Simple-cast unary ops: op name → Java cast expression.
 *
 * @private
 * @const {!Object<string, string>}
 */
Wasm2Lang.Backend.JavaCodegen.CAST_UNARY_OPS_ = {
  'convert_s_i32_to_f32': '(float)',
  'convert_s_i32_to_f64': '(double)',
  'demote_f64_to_f32': '(float)',
  'promote_f32_to_f64': '(double)',
  'wrap_i64_to_i32': '(int)',
  'extend_s_i32_to_i64': '(long)',
  'convert_s_i64_to_f32': '(float)',
  'convert_s_i64_to_f64': '(double)'
};

/**
 * Helper-delegated unary ops: op name → true.
 * Each maps to {@code $w2l_} + name as the helper function.
 *
 * @private
 * @const {!Object<string, boolean>}
 */
Wasm2Lang.Backend.JavaCodegen.HELPER_UNARY_OPS_ = {
  'trunc_s_f32_to_i32': true,
  'trunc_s_f64_to_i32': true,
  'trunc_s_f32_to_i64': true,
  'trunc_s_f64_to_i64': true,
  'trunc_u_f32_to_i64': true,
  'trunc_u_f64_to_i64': true,
  'convert_u_i64_to_f32': true,
  'convert_u_i64_to_f64': true,
  'trunc_sat_s_f32_to_i64': true,
  'trunc_sat_u_f32_to_i64': true,
  'trunc_sat_s_f64_to_i64': true,
  'trunc_sat_u_f64_to_i64': true
};

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
  var /** @const {number} */ cat = null != opt_valueCat ? opt_valueCat : Wasm2Lang.Backend.AbstractCodegen.CAT_RAW;
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

  // Simple casts: convert_s_i32_to_f32 → (float)(expr), etc.
  var /** @type {string|void} */ castOp = Wasm2Lang.Backend.JavaCodegen.CAST_UNARY_OPS_[name];
  if (castOp) return castOp + '(' + valueExpr + ')';

  // Unsigned integer conversions.
  if ('convert_u_i32_to_f32' === name) return '(float)Integer.toUnsignedLong(' + valueExpr + ')';
  if ('convert_u_i32_to_f64' === name) return '(double)Integer.toUnsignedLong(' + valueExpr + ')';
  if ('extend_u_i32_to_i64' === name) return 'Integer.toUnsignedLong(' + valueExpr + ')';

  // Reinterpret ops.
  if ('reinterpret_f32_to_i32' === name) {
    inner = this.coerceToType_(binaryen, valueExpr, cat, info.operandType);
    return 'Float.floatToRawIntBits(' + inner + ')';
  }
  if ('reinterpret_i32_to_f32' === name) return 'Float.intBitsToFloat(' + valueExpr + ')';
  if ('reinterpret_i64_to_f64' === name) return 'Double.longBitsToDouble(' + valueExpr + ')';
  if ('reinterpret_f64_to_i64' === name) return 'Double.doubleToRawLongBits(' + valueExpr + ')';

  // Helper-delegated ops: mark helper, call with optional f32 coercion.
  if (Wasm2Lang.Backend.JavaCodegen.HELPER_UNARY_OPS_[name]) {
    var /** @const {string} */ helperName = '$w2l_' + name;
    this.markHelper_(helperName);
    var /** @type {string} */ arg = isF32 ? this.coerceToType_(binaryen, valueExpr, cat, info.operandType) : valueExpr;
    return this.n_(helperName) + '(' + arg + ')';
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
