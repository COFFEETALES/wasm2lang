'use strict';

// ---------------------------------------------------------------------------
// Static i32 binary-op renderers shared by asm.js and modern-JS backends.
// Uses the shared I32Coercion classification.
// ---------------------------------------------------------------------------

/**
 * Renders an i32 additive infix.  When the parent operator is {@code +},
 * the right operand can be left unparenthesized even if it is itself an
 * additive expression — left-associative reduction makes
 * {@code a + (b op c)} equivalent to {@code a + b op c} (verified across
 * {@code +}/{@code +}, {@code +}/{@code -} pairings for any int32 inputs).
 *
 * The {@code -} parent keeps the default {@code allowRightEqual = false}
 * because {@code a - (b + c) = a - b - c} would render incorrectly as
 * {@code a - b + c} (different result) without the wrap, and
 * {@code a - (b - c) = a - b + c} would render as {@code a - b - c}.
 *
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderArithmeticBinary_ = function (self, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_, '+' === info.opStr);
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderMultiplyBinary_ = function (self, info, L, R) {
  self.markBinding_('Math_imul');
  return self.n_('Math_imul') + '(' + L + ', ' + R + ')';
};

/**
 * Renders an i32 division/remainder as a call to the checked helper installed
 * by {@code --trap-sites}, or returns {@code null} when instrumentation is off
 * so the caller falls through to the plain infix form.
 *
 * The operands are coerced to {@code int} before the call because an asm.js
 * call argument must be {@code int}/{@code double}/{@code float} — an
 * {@code intish} sub-expression (an uncoerced {@code a + b}) is not accepted —
 * and the call itself is coerced because the helper's return type is
 * {@code signed}.
 *
 * A divisor that is a non-zero integer literal cannot trap, so those sites keep
 * the plain inline form: instrumenting them would put a call and a branch on a
 * hot path to detect a condition the operand makes impossible.  This is not an
 * optimization the input compiler already did — the operand is a wasm constant,
 * but the DECISION not to guard exists only here, because only this layer emits
 * the guard.  On the reference module it removes most of the instrumented
 * division sites.
 *
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {?string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderCheckedI32Division_ = function (self, info, L, R) {
  if (!self.trapSitesEnabled_) return null;
  if (Wasm2Lang.Backend.JsCommonCodegen.isNonTrappingDivisor_(info, R)) return null;
  var /** @const */ J = Wasm2Lang.Backend.JsCommonCodegen;
  var /** @const {string} */ helperName =
      ('/' === info.opStr ? '$w2l_div_' : '$w2l_rem_') + (info.unsigned ? 'u' : 's') + '_i32';
  self.markHelper_(helperName);
  return J.renderSignedCoercion_(
    self.n_(helperName) + '(' + J.renderSignedCoercion_(L) + ', ' + J.renderSignedCoercion_(R) + ')'
  );
};

/**
 * Returns {@code true} when {@code R} is an integer literal for which neither
 * trap condition can hold.
 *
 * Zero is excluded because it always traps.  {@code -1} is excluded for signed
 * division only, where it is the divisor half of the INT_MIN/-1 overflow —
 * signed remainder by -1 is defined (wasm gives 0) and unsigned operands never
 * see -1 as a divisor value of 0xFFFFFFFF that could overflow.
 *
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} R
 * @return {boolean}
 */
Wasm2Lang.Backend.JsCommonCodegen.isNonTrappingDivisor_ = function (info, R) {
  if (!/^-?[0-9]+$/.test(R)) return false;
  var /** @const {number} */ value = Number(R);
  if (0 === value) return false;
  if (-1 === value && '/' === info.opStr && !info.unsigned) return false;
  return true;
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderDivisionBinary_ = function (self, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {function(string): string} */ coerce = info.unsigned
      ? Wasm2Lang.Backend.JsCommonCodegen.renderUnsignedCoercion_
      : Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_;
  return P.renderInfix(coerce(L), info.opStr, coerce(R), P.PREC_MULTIPLICATIVE_);
};

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.JsCommonCodegen.renderBitwiseBinary_ = Wasm2Lang.Backend.AbstractCodegen.renderPlainBitwiseBinary_;

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderRotateBinary_ = function (self, info, L, R) {
  var /** @const {string} */ helperName = info.rotateLeft ? '$w2l_rotl' : '$w2l_rotr';
  self.markHelper_(helperName);
  return Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(self.n_(helperName) + '(' + L + ', ' + R + ')');
};

/**
 * @param {string} expr
 * @param {boolean} isUnsigned
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderComparisonOperand_ = function (expr, isUnsigned) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;

  if (C.isConstant(expr) && !isUnsigned) {
    return expr;
  }
  if (isUnsigned) {
    return Wasm2Lang.Backend.JsCommonCodegen.renderUnsignedCoercion_(expr);
  }
  return P.wrap_(Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(expr), P.PREC_RELATIONAL_, false);
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderComparisonBinary_ = function (self, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const */ renderOp = Wasm2Lang.Backend.JsCommonCodegen.renderComparisonOperand_;
  // Comparisons produce fixnum (0 or 1) in asm.js — no |0 coercion needed.
  var /** @const {number} */ precedence = '==' === info.opStr || '!=' === info.opStr ? P.PREC_EQUALITY_ : P.PREC_RELATIONAL_;
  return P.renderInfix(renderOp(L, info.unsigned), info.opStr, renderOp(R, info.unsigned), precedence);
};
