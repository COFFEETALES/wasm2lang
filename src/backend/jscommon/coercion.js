'use strict';

// ---------------------------------------------------------------------------
// Static coercion helpers shared by asm.js and modern-JS backends.
//
// These encode the classic asm.js idioms for forcing a value into a specific
// JavaScript-observable type:
//   {@code x|0}      — signed 32-bit integer
//   {@code x>>>0}    — unsigned 32-bit integer
//   {@code +x}       — double-precision float
//   {@code Math.fround(x)} — single-precision float (emitted by a prototype
//                              override so it can call markBinding_)
//
// Modern-JS reuses these because they are the cheapest way to express the
// same coercions in any JS engine: even though modern-JS does not run the
// asm.js validator, the emitted integer coercions fold into fast int32
// representations and the floating coercions preserve NaN-boxing semantics.
// ---------------------------------------------------------------------------

/**
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {number} */ len = expr.length;
  if (len >= 2 && '|' === expr.charAt(len - 2) && '0' === expr.charAt(len - 1)) return expr;
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr)) return expr;
  // Expressions whose top-level operator is &, ^, or | are already signed
  // in asm.js and do not need an extra |0 coercion.  Signed shifts (<<, >>)
  // also produce signed; the unsigned shift >>> produces unsigned and would
  // be reinterpreted by |0, so it does not qualify.
  var /** @const {number} */ top = P.topLevel(expr);
  if (top <= P.PREC_BIT_AND_ && top >= P.PREC_BIT_OR_) return expr;
  if (top === P.PREC_SHIFT_ && !P.hasTopLevelToken(expr, '>>>')) return expr;
  return P.wrap_(expr, P.PREC_BIT_OR_, true) + '|0';
};

/**
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderUnsignedCoercion_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr) && '-' !== expr.charAt(0)) return expr;
  // The unsigned shift >>> already produces an unsigned i32; a second >>>0
  // wrap is a no-op.  Signed shifts and bitwise &|^ produce signed values
  // that need explicit reinterpretation, so they still get the >>>0.
  if (P.topLevel(expr) === P.PREC_SHIFT_ && P.hasTopLevelToken(expr, '>>>')) return expr;
  return P.wrap_(expr, P.PREC_SHIFT_, true) + '>>>0';
};

/**
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderDoubleCoercion_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (/^-?\d+(?:\.\d+)?$/.test(expr)) return -1 === expr.indexOf('.') ? expr + '.0' : expr;
  if (/^[+-]/.test(expr.replace(/^\s+|\s+$/g, ''))) return '+(' + expr + ')';
  return '+' + P.wrap_(expr, P.PREC_UNARY_, false);
};

/**
 * Marks the {@code Math.fround} binding and emits a call around the already-
 * composed inner expression.  Prefer this over a manual
 * {@code markBinding_ + n_('Math_fround') + '(...)'} pair so each backend
 * pays for the import exactly once and reads consistently.
 *
 * @protected
 * @param {string} innerExpr
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderMathFroundCall_ = function (innerExpr) {
  this.markBinding_('Math_fround');
  return this.n_('Math_fround') + '(' + innerExpr + ')';
};

/**
 * @protected
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderFloatCoercion_ = function (expr) {
  return this.renderMathFroundCall_(Wasm2Lang.Backend.AbstractCodegen.Precedence_.stripOuter(expr));
};
