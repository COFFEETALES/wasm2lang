'use strict';

// ---------------------------------------------------------------------------
// Binary-op rendering (uses shared I32Coercion classification).
// ---------------------------------------------------------------------------

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderArithmeticBinary_ = function (self, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return self.n_('_w2l_i') + '(' + P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_) + ')';
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderMultiplyBinary_ = function (self, info, L, R) {
  void info;
  self.markHelper_('_w2l_imul');
  return self.n_('_w2l_imul') + '(' + L + ', ' + R + ')';
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderDivisionBinary_ = function (self, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ nI = self.n_('_w2l_i');
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
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderBitwiseBinary_ = function (self, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ nI = self.n_('_w2l_i');
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
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderRotateBinary_ = function (self, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ nI = self.n_('_w2l_i');
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
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderComparisonBinary_ = function (self, info, L, R) {
  void self;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {string} */ leftExpr = L;
  var /** @type {string} */ rightExpr = R;

  if (info.unsigned) {
    leftExpr = P.wrap(Wasm2Lang.Backend.Php64Codegen.renderMask32_(L), P.PREC_RELATIONAL_, false);
    rightExpr = P.wrap(Wasm2Lang.Backend.Php64Codegen.renderMask32_(R), P.PREC_RELATIONAL_, false);
  }
  return '(' + P.renderInfix(leftExpr, info.opStr, rightExpr, P.PREC_RELATIONAL_) + ' ? 1 : 0)';
};
