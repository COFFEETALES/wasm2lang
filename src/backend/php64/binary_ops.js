'use strict';

// ---------------------------------------------------------------------------
// Binary-op rendering (uses shared I32Coercion classification).
// ---------------------------------------------------------------------------

/**
 * @this {!Wasm2Lang.Backend.Php64Codegen}
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderArithmeticBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return this.n_('_w2l_i') + '(' + P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_) + ')';
};

/**
 * @this {!Wasm2Lang.Backend.Php64Codegen}
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderMultiplyBinaryOp_ = function (info, L, R) {
  void info;
  this.markHelper_('_w2l_imul');
  return this.n_('_w2l_imul') + '(' + L + ', ' + R + ')';
};

/**
 * @this {!Wasm2Lang.Backend.Php64Codegen}
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderDivisionBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ nI = this.n_('_w2l_i');
  if ('/' === info.opStr) {
    if (info.unsigned) {
      return (
        nI +
        '(intdiv(' +
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(L) +
        ', ' +
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(R) +
        '))'
      );
    }
    return nI + '(intdiv(' + L + ', ' + R + '))';
  }
  // Remainder (%).
  if (info.unsigned) {
    return (
      nI +
      '(' +
      P.renderInfix(
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(L),
        '%',
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(R),
        P.PREC_MULTIPLICATIVE_
      ) +
      ')'
    );
  }
  return nI + '(' + P.renderInfix(L, '%', R, P.PREC_MULTIPLICATIVE_) + ')';
};

/**
 * @this {!Wasm2Lang.Backend.Php64Codegen}
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderBitwiseBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ nI = this.n_('_w2l_i');
  if ('>>>' === info.opStr) {
    // Unsigned right shift (not native in PHP).
    return (
      nI +
      '(' +
      P.renderInfix(
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(L),
        '>>',
        Wasm2Lang.Backend.Php64Codegen.renderShiftMask_(R),
        P.PREC_SHIFT_
      ) +
      ')'
    );
  }
  if ('<<' === info.opStr) {
    return nI + '(' + P.renderInfix(L, '<<', Wasm2Lang.Backend.Php64Codegen.renderShiftMask_(R), P.PREC_SHIFT_) + ')';
  }
  if ('>>' === info.opStr) {
    return nI + '(' + P.renderInfix(L, '>>', Wasm2Lang.Backend.Php64Codegen.renderShiftMask_(R), P.PREC_SHIFT_) + ')';
  }
  // &, |, ^
  return P.renderInfix(
    L,
    info.opStr,
    R,
    '&' === info.opStr ? P.PREC_BIT_AND_ : '^' === info.opStr ? P.PREC_BIT_XOR_ : P.PREC_BIT_OR_,
    true
  );
};

/**
 * @this {!Wasm2Lang.Backend.Php64Codegen}
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderRotateBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ nI = this.n_('_w2l_i');
  var /** @const {string} */ shiftMask = Wasm2Lang.Backend.Php64Codegen.renderShiftMask_(R);
  var /** @const {string} */ reverseShift = P.renderInfix('32', '-', shiftMask, P.PREC_ADDITIVE_);

  if (info.rotateLeft) {
    return (
      nI +
      '(' +
      P.renderInfix(
        P.renderInfix(L, '<<', shiftMask, P.PREC_SHIFT_),
        '|',
        P.renderInfix(Wasm2Lang.Backend.Php64Codegen.renderMask32_(L), '>>', reverseShift, P.PREC_SHIFT_),
        P.PREC_BIT_OR_,
        true
      ) +
      ')'
    );
  }
  return (
    nI +
    '(' +
    P.renderInfix(
      P.renderInfix(Wasm2Lang.Backend.Php64Codegen.renderMask32_(L), '>>', shiftMask, P.PREC_SHIFT_),
      '|',
      P.renderInfix(L, '<<', reverseShift, P.PREC_SHIFT_),
      P.PREC_BIT_OR_,
      true
    ) +
    ')'
  );
};

/**
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderComparisonBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {string} */ leftExpr = L;
  var /** @type {string} */ rightExpr = R;

  if (info.unsigned) {
    leftExpr = P.wrap(Wasm2Lang.Backend.Php64Codegen.renderMask32_(L), P.PREC_RELATIONAL_, false);
    rightExpr = P.wrap(Wasm2Lang.Backend.Php64Codegen.renderMask32_(R), P.PREC_RELATIONAL_, false);
  }
  return '(' + P.renderInfix(leftExpr, info.opStr, rightExpr, P.PREC_RELATIONAL_) + ' ? 1 : 0)';
};

/**
 * @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryOpRenderer_}
 */
Wasm2Lang.Backend.Php64Codegen.binaryOpRenderer_ = {
  renderArithmetic: Wasm2Lang.Backend.Php64Codegen.prototype.renderArithmeticBinaryOp_,
  renderMultiply: Wasm2Lang.Backend.Php64Codegen.prototype.renderMultiplyBinaryOp_,
  renderDivision: Wasm2Lang.Backend.Php64Codegen.prototype.renderDivisionBinaryOp_,
  renderBitwise: Wasm2Lang.Backend.Php64Codegen.prototype.renderBitwiseBinaryOp_,
  renderRotate: Wasm2Lang.Backend.Php64Codegen.prototype.renderRotateBinaryOp_,
  renderComparison: Wasm2Lang.Backend.Php64Codegen.prototype.renderComparisonBinaryOp_
};

/**
 * @this {!Wasm2Lang.Backend.Php64Codegen}
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderBinaryOp_ = function (info, L, R) {
  return this.renderBinaryOpByCategory_(info, L, R, Wasm2Lang.Backend.Php64Codegen.binaryOpRenderer_);
};
