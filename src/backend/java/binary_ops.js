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
  var /** @const */ bi = P.bitwiseInfo(info.opStr);
  return P.renderInfix(L, info.opStr, R, bi.bitwisePrecedence, true);
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
    return P.renderInfix('Integer.compareUnsigned(' + L + ', ' + R + ')', info.opStr, '0', P.PREC_RELATIONAL_);
  }
  return P.renderInfix(L, info.opStr, R, P.PREC_RELATIONAL_);
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.renderI64DivisionBinary_ = function (self, info, L, R) {
  void self;
  if (info.unsigned) {
    if ('/' === info.opStr) {
      return 'Long.divideUnsigned(' + L + ', ' + R + ')';
    }
    return 'Long.remainderUnsigned(' + L + ', ' + R + ')';
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
Wasm2Lang.Backend.JavaCodegen.renderI64RotateBinary_ = function (self, info, L, R) {
  void self;
  if (info.rotateLeft) {
    return 'Long.rotateLeft(' + L + ', (int)(' + R + '))';
  }
  return 'Long.rotateRight(' + L + ', (int)(' + R + '))';
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.renderI64ComparisonBinary_ = function (self, info, L, R) {
  void self;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (info.unsigned) {
    return P.renderInfix('Long.compareUnsigned(' + L + ', ' + R + ')', info.opStr, '0', P.PREC_RELATIONAL_);
  }
  return P.renderInfix(L, info.opStr, R, P.PREC_RELATIONAL_);
};
