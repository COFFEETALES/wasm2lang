'use strict';

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.renderArithmeticBinary_ = function (self, info, L, R) {
  void self;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_);
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.renderMultiplyBinary_ = function (self, info, L, R) {
  void self;
  void info;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(L, '*', R, P.PREC_MULTIPLICATIVE_);
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.renderDivisionBinary_ = function (self, info, L, R) {
  void self;
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
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.renderBitwiseBinary_ = function (self, info, L, R) {
  void self;
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
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.renderRotateBinary_ = function (self, info, L, R) {
  void self;
  if (info.rotateLeft) {
    return 'Integer.rotateLeft(' + L + ', ' + R + ')';
  }
  return 'Integer.rotateRight(' + L + ', ' + R + ')';
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.renderComparisonBinary_ = function (self, info, L, R) {
  void self;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (info.unsigned) {
    return '(Integer.compareUnsigned(' + L + ', ' + R + ') ' + info.opStr + ' 0 ? 1 : 0)';
  }
  return '(' + P.renderInfix(L, info.opStr, R, P.PREC_RELATIONAL_) + ' ? 1 : 0)';
};
