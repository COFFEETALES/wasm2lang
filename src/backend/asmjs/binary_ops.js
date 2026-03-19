'use strict';

/**
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderArithmeticBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_));
};

/**
 * @this {!Wasm2Lang.Backend.AsmjsCodegen}
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderMultiplyBinaryOp_ = function (info, L, R) {
  void info;
  this.markBinding_('Math_imul');
  // Math.imul(intish, intish) returns signed in asm.js — no |0 needed.
  return this.n_('Math_imul') + '(' + L + ', ' + R + ')';
};

/**
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderDivisionBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (info.unsigned) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(
      P.renderInfix(
        Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(L),
        info.opStr,
        Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(R),
        P.PREC_MULTIPLICATIVE_
      )
    );
  }
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(
    P.renderInfix(
      Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(L),
      info.opStr,
      Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(R),
      P.PREC_MULTIPLICATIVE_
    )
  );
};

/**
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderBitwiseBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {number} */ precedence = P.PREC_BIT_OR_;
  var /** @type {boolean} */ allowRightEqual = true;

  if ('&' === info.opStr) {
    precedence = P.PREC_BIT_AND_;
  } else if ('^' === info.opStr) {
    precedence = P.PREC_BIT_XOR_;
  } else if ('<<' === info.opStr || '>>' === info.opStr || '>>>' === info.opStr) {
    precedence = P.PREC_SHIFT_;
    allowRightEqual = false;
  }

  return P.renderInfix(L, info.opStr, R, precedence, allowRightEqual);
};

/**
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderRotateBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ shiftMask = P.renderInfix(R, '&', '31', P.PREC_BIT_AND_, true);
  var /** @const {string} */ reverseShift = P.renderInfix('32', '-', shiftMask, P.PREC_ADDITIVE_);

  if (info.rotateLeft) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(
      P.renderInfix(
        P.renderInfix(L, '<<', shiftMask, P.PREC_SHIFT_),
        '|',
        P.renderInfix(Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(L), '>>>', reverseShift, P.PREC_SHIFT_),
        P.PREC_BIT_OR_,
        true
      )
    );
  }
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(
    P.renderInfix(
      P.renderInfix(Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(L), '>>>', shiftMask, P.PREC_SHIFT_),
      '|',
      P.renderInfix(L, '<<', reverseShift, P.PREC_SHIFT_),
      P.PREC_BIT_OR_,
      true
    )
  );
};

/**
 * @param {string} expr
 * @param {boolean} isUnsigned
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderComparisonOperand_ = function (expr, isUnsigned) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;

  if (C.isConstant(expr) && !isUnsigned) {
    return expr;
  }
  if (isUnsigned) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(expr);
  }
  return P.wrap(Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(expr), P.PREC_RELATIONAL_, false);
};

/**
 * @this {!Wasm2Lang.Backend.AsmjsCodegen}
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderComparisonBinaryOp_ = function (info, L, R) {
  // Comparisons produce fixnum (0 or 1) in asm.js — no |0 coercion needed.
  return (
    '(' +
    this.renderComparisonOperand_(L, info.unsigned) +
    ' ' +
    info.opStr +
    ' ' +
    this.renderComparisonOperand_(R, info.unsigned) +
    ')'
  );
};

/**
 * Backend-specific binary-op syntax hooks used by the shared
 * {@code AbstractCodegen.renderBinaryOpByCategory_} dispatcher.
 *
 * @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryOpRenderer_}
 */
Wasm2Lang.Backend.AsmjsCodegen.binaryOpRenderer_ = {
  renderArithmetic: Wasm2Lang.Backend.AsmjsCodegen.prototype.renderArithmeticBinaryOp_,
  renderMultiply: Wasm2Lang.Backend.AsmjsCodegen.prototype.renderMultiplyBinaryOp_,
  renderDivision: Wasm2Lang.Backend.AsmjsCodegen.prototype.renderDivisionBinaryOp_,
  renderBitwise: Wasm2Lang.Backend.AsmjsCodegen.prototype.renderBitwiseBinaryOp_,
  renderRotate: Wasm2Lang.Backend.AsmjsCodegen.prototype.renderRotateBinaryOp_,
  renderComparison: Wasm2Lang.Backend.AsmjsCodegen.prototype.renderComparisonBinaryOp_
};

/**
 * Renders an i32 binary operation using the shared category dispatcher plus
 * asm.js-specific syntax hooks.
 *
 * @this {!Wasm2Lang.Backend.AsmjsCodegen}
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L  Left operand code.
 * @param {string} R  Right operand code.
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderBinaryOp_ = function (info, L, R) {
  return this.renderBinaryOpByCategory_(info, L, R, Wasm2Lang.Backend.AsmjsCodegen.binaryOpRenderer_);
};
