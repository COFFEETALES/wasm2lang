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
  var /** @const {string} */ left = info.unsigned ? Wasm2Lang.Backend.Php64Codegen.renderMask32_(L) : L;
  var /** @const {string} */ right = info.unsigned ? Wasm2Lang.Backend.Php64Codegen.renderMask32_(R) : R;
  var /** @const {string} */ core =
      '/' === info.opStr ? 'intdiv(' + left + ', ' + right + ')' : P.renderInfix(left, '%', right, P.PREC_MULTIPLICATIVE_);
  return self.n_('_w2l_i') + '(' + core + ')';
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
  var /** @const {string} */ op = info.opStr;
  // Shift ops need the shift amount masked to 0..31; the unsigned right shift
  // additionally masks L so the sign bit is cleared before the arithmetic `>>`.
  if ('>>>' === op || '<<' === op || '>>' === op) {
    var /** @const {string} */ leftExpr = '>>>' === op ? Wasm2Lang.Backend.Php64Codegen.renderMask32_(L) : L;
    var /** @const {string} */ physicalOp = '>>>' === op ? '>>' : op;
    return (
      self.n_('_w2l_i') +
      '(' +
      P.renderInfix(leftExpr, physicalOp, Wasm2Lang.Backend.Php64Codegen.renderShiftMask_(R), P.PREC_SHIFT_) +
      ')'
    );
  }
  // &, |, ^
  var /** @const */ bi = P.bitwiseInfo(op);
  return P.renderInfix(L, op, R, bi.bitwisePrecedence, true);
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
    leftExpr = P.wrap_(Wasm2Lang.Backend.Php64Codegen.renderMask32_(L), P.PREC_RELATIONAL_, false);
    rightExpr = P.wrap_(Wasm2Lang.Backend.Php64Codegen.renderMask32_(R), P.PREC_RELATIONAL_, false);
  }
  return P.renderInfix(leftExpr, info.opStr, rightExpr, P.PREC_RELATIONAL_);
};
