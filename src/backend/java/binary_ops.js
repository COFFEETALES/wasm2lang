'use strict';

/**
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderArithmeticBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_);
};

/**
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderMultiplyBinaryOp_ = function (info, L, R) {
  void info;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(L, '*', R, P.PREC_MULTIPLICATIVE_);
};

/**
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderDivisionBinaryOp_ = function (info, L, R) {
  if (info.unsigned) {
    if ('/' === info.opStr) {
      return 'Integer.divideUnsigned(' + L + ', ' + R + ')';
    }
    return 'Integer.remainderUnsigned(' + L + ', ' + R + ')';
  }
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(L, info.opStr, R, P.PREC_MULTIPLICATIVE_);
};

/**
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderBitwiseBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {number} */ precedence = P.PREC_BIT_OR_;

  if ('&' === info.opStr) {
    precedence = P.PREC_BIT_AND_;
  } else if ('^' === info.opStr) {
    precedence = P.PREC_BIT_XOR_;
  } else if ('<<' === info.opStr || '>>' === info.opStr || '>>>' === info.opStr) {
    precedence = P.PREC_SHIFT_;
  }

  return P.renderInfix(L, info.opStr, R, precedence, true);
};

/**
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderRotateBinaryOp_ = function (info, L, R) {
  if (info.rotateLeft) {
    return 'Integer.rotateLeft(' + L + ', ' + R + ')';
  }
  return 'Integer.rotateRight(' + L + ', ' + R + ')';
};

/**
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderComparisonBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (info.unsigned) {
    return '(Integer.compareUnsigned(' + L + ', ' + R + ') ' + info.opStr + ' 0 ? 1 : 0)';
  }
  return '(' + P.renderInfix(L, info.opStr, R, P.PREC_RELATIONAL_) + ' ? 1 : 0)';
};

/**
 * @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryOpRenderer_}
 */
Wasm2Lang.Backend.JavaCodegen.binaryOpRenderer_ = {
  renderArithmetic: Wasm2Lang.Backend.JavaCodegen.prototype.renderArithmeticBinaryOp_,
  renderMultiply: Wasm2Lang.Backend.JavaCodegen.prototype.renderMultiplyBinaryOp_,
  renderDivision: Wasm2Lang.Backend.JavaCodegen.prototype.renderDivisionBinaryOp_,
  renderBitwise: Wasm2Lang.Backend.JavaCodegen.prototype.renderBitwiseBinaryOp_,
  renderRotate: Wasm2Lang.Backend.JavaCodegen.prototype.renderRotateBinaryOp_,
  renderComparison: Wasm2Lang.Backend.JavaCodegen.prototype.renderComparisonBinaryOp_
};

/**
 * @this {!Wasm2Lang.Backend.JavaCodegen}
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderBinaryOp_ = function (info, L, R) {
  return this.renderBinaryOpByCategory_(info, L, R, Wasm2Lang.Backend.JavaCodegen.binaryOpRenderer_);
};
