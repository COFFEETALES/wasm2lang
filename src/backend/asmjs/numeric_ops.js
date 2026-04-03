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
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderNumericUnaryOp_ = function (binaryen, info, valueExpr, opt_valueCat) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ name = info.opName;
  var /** @const {boolean} */ isF32 = Wasm2Lang.Backend.ValueType.isF32(binaryen, info.operandType);

  if ('abs' === name || 'ceil' === name || 'floor' === name || 'sqrt' === name) {
    this.markBinding_('Math_' + name);
    var /** @const {string} */ mathFn = this.n_('Math_' + name);
    if (isF32) {
      this.markBinding_('Math_fround');
      return this.n_('Math_fround') + '(' + mathFn + '(' + P.renderPrefix('+', valueExpr) + '))';
    }
    return P.renderPrefix('+', mathFn + '(' + valueExpr + ')');
  }

  if ('convert_s_i32_to_f32' === name) {
    this.markBinding_('Math_fround');
    return this.n_('Math_fround') + '(' + Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(valueExpr) + ')';
  }
  if ('convert_u_i32_to_f32' === name) {
    this.markBinding_('Math_fround');
    return this.n_('Math_fround') + '(' + P.wrap(valueExpr, P.PREC_SHIFT_, false) + '>>>0)';
  }
  if ('convert_s_i32_to_f64' === name) {
    return '+(' + Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(valueExpr) + ')';
  }
  if ('convert_u_i32_to_f64' === name) {
    return '+(' + P.wrap(valueExpr, P.PREC_SHIFT_, false) + '>>>0)';
  }

  if ('demote_f64_to_f32' === name) {
    this.markBinding_('Math_fround');
    return this.n_('Math_fround') + '(' + valueExpr + ')';
  }
  if ('promote_f32_to_f64' === name) {
    return P.renderPrefix('+', valueExpr);
  }

  if ('trunc_s_f32_to_i32' === name) {
    return this.renderHelperCall_(binaryen, '$w2l_trunc_s_f32_to_i32', [valueExpr], info.retType);
  }
  if ('trunc_s_f64_to_i32' === name) {
    return this.renderHelperCall_(binaryen, '$w2l_trunc_s_f64_to_i32', [valueExpr], info.retType);
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
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderNumericBinaryOp_ = function (binaryen, info, L, R, opt_catL, opt_catR) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;

  if ('min' === info.opName || 'max' === info.opName) {
    this.markBinding_('Math_' + info.opName);
    var /** @const {string} */ fn = this.n_('Math_' + info.opName);
    if (Wasm2Lang.Backend.ValueType.isF32(binaryen, info.retType)) {
      this.markBinding_('Math_fround');
      return this.n_('Math_fround') + '(' + fn + '(' + P.renderPrefix('+', L) + ', ' + P.renderPrefix('+', R) + '))';
    }
    return P.renderPrefix('+', fn + '(' + L + ', ' + R + ')');
  }

  return Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericBinaryOp_.call(this, binaryen, info, L, R);
};

/**
 * @override
 * @protected
 * @param {string} conditionExpr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderNumericComparisonResult_ = function (conditionExpr) {
  // Comparisons produce fixnum (0 or 1) in asm.js — no |0 coercion needed.
  return conditionExpr;
};
