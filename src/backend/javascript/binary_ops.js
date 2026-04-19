'use strict';

// ---------------------------------------------------------------------------
// BigInt-based i64 binary-op renderers.
//
// BigInt arithmetic is unbounded, so wasm wrap-around semantics are restored
// by wrapping every overflowing result with {@code BigInt.asIntN(64, ...)}.
// Unsigned division/comparison reinterprets both operands with
// {@code BigInt.asUintN(64, ...)} to flip the top-bit-is-sign convention.
// Shifts mask the right operand by 63n (wasm truncates shift amounts).
// Rotations are delegated to helpers.
// ---------------------------------------------------------------------------

/**
 * Wraps an i64-producing expression with a call to the mangleable
 * {@code $w2l_bigint_asintn} helper — equivalent to
 * {@code BigInt.asIntN(64, expr)} but routed through a helper so the
 * identifier participates in the mangler profile.
 * @private
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.wrapI64_ = function (self, expr) {
  self.markHelper_('$w2l_bigint_asintn');
  return self.n_('$w2l_bigint_asintn') + '(64, ' + Wasm2Lang.Backend.AbstractCodegen.Precedence_.stripOuter(expr) + ')';
};

/**
 * Signed i32 comparisons in JavaScript compare raw JS Numbers — operands
 * coming from local/global gets and bitwise ops are already integer-valued,
 * so no {@code |0} is needed.  Unsigned comparisons still reinterpret both
 * sides via {@code >>>0} so negative signed values map to their uint32
 * representation before comparison.
 *
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.renderI32ComparisonBinary_ = function (self, info, L, R) {
  void self;
  return Wasm2Lang.Backend.AbstractCodegen.renderComparisonInfix_(
    info,
    L,
    R,
    Wasm2Lang.Backend.JsCommonCodegen.renderUnsignedCoercion_
  );
};

/**
 * The {@code $w2l_rotl}/{@code $w2l_rotr} helpers self-coerce their result
 * via a trailing {@code |0} inside the helper body, so the outer
 * {@code renderSignedCoercion_} wrap that the shared jscommon renderer
 * applies is redundant in modern JavaScript.  Emit the bare call so the
 * surrounding expression reads as plain JavaScript.
 *
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.renderI32RotateBinary_ = function (self, info, L, R) {
  var /** @const {string} */ helperName = info.rotateLeft ? '$w2l_rotl' : '$w2l_rotr';
  self.markHelper_(helperName);
  return self.n_(helperName) + '(' + L + ', ' + R + ')';
};

/**
 * JavaScript division (and {@code %}) of integer operands produces a JS
 * Number — for {@code /} the result is fractional ({@code 7 / 2 === 3.5}),
 * which would propagate into subsequent additive ops and diverge from wasm
 * i32 semantics.  Wrap the quotient in {@code |0} to truncate toward zero;
 * modulo of integer operands is already integer-valued so it skips the wrap.
 * Unsigned operations still reinterpret both operands via {@code >>>0} for
 * uint32 semantics.
 *
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.renderI32DivisionBinary_ = function (self, info, L, R) {
  void self;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ J = Wasm2Lang.Backend.JsCommonCodegen;
  var /** @const {string} */ quotient = A.renderUnsignedAwareInfix_(
      info,
      L,
      R,
      J.renderUnsignedCoercion_,
      A.Precedence_.PREC_MULTIPLICATIVE_
    );
  return '/' === info.opStr ? J.renderSignedCoercion_(quotient) : quotient;
};

/**
 * Re-interprets an i64 operand as unsigned for division/comparison.
 * @private
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.asUint64_ = function (self, expr) {
  self.markHelper_('$w2l_bigint_asuintn');
  return self.n_('$w2l_bigint_asuintn') + '(64, ' + Wasm2Lang.Backend.AbstractCodegen.Precedence_.stripOuter(expr) + ')';
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.renderI64ArithmeticBinary_ = function (self, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return Wasm2Lang.Backend.JavaScriptCodegen.wrapI64_(self, P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_));
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.renderI64MultiplyBinary_ = function (self, info, L, R) {
  void info;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return Wasm2Lang.Backend.JavaScriptCodegen.wrapI64_(self, P.renderInfix(L, '*', R, P.PREC_MULTIPLICATIVE_));
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.renderI64DivisionBinary_ = function (self, info, L, R) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ M = Wasm2Lang.Backend.JavaScriptCodegen;
  /** @param {string} expr @return {string} */
  var asUint = function (expr) {
    return M.asUint64_(self, expr);
  };
  return M.wrapI64_(self, A.renderUnsignedAwareInfix_(info, L, R, asUint, A.Precedence_.PREC_MULTIPLICATIVE_));
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.renderI64BitwiseBinary_ = function (self, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const */ M = Wasm2Lang.Backend.JavaScriptCodegen;
  var /** @const {string} */ op = info.opStr;
  if ('>>>' === op || '<<' === op || '>>' === op) {
    // BigInt has no unsigned right shift — reinterpret L as uint64 and use
    // arithmetic `>>`.  Left-shift and unsigned right-shift can produce
    // values outside the signed 64-bit range, so rewrap; arithmetic `>>` on
    // an already-signed value preserves the range and needs no rewrap.
    var /** @const {string} */ leftExpr = '>>>' === op ? M.asUint64_(self, L) : L;
    var /** @const {string} */ physicalOp = '>>>' === op ? '>>' : op;
    var /** @const {string} */ shiftExpr = P.renderInfix(leftExpr, physicalOp, '(' + R + ' & 63n)', P.PREC_SHIFT_);
    return '>>' === op ? shiftExpr : M.wrapI64_(self, shiftExpr);
  }
  return Wasm2Lang.Backend.AbstractCodegen.renderPlainBitwiseBinary_(self, info, L, R);
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.renderI64RotateBinary_ = function (self, info, L, R) {
  var /** @const {string} */ helperName = info.rotateLeft ? '$w2l_i64_rotl' : '$w2l_i64_rotr';
  self.markHelper_(helperName);
  return self.n_(helperName) + '(' + L + ', ' + R + ')';
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.renderI64ComparisonBinary_ = function (self, info, L, R) {
  /** @param {string} expr @return {string} */
  var asUint = function (expr) {
    return Wasm2Lang.Backend.JavaScriptCodegen.asUint64_(self, expr);
  };
  return Wasm2Lang.Backend.AbstractCodegen.renderComparisonInfix_(info, L, R, asUint);
};
