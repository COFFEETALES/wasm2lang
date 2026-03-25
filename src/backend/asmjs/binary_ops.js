'use strict';

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderArithmeticBinary_ = function (self, info, L, R) {
  void self;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_));
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderMultiplyBinary_ = function (self, info, L, R) {
  void info;
  self.markBinding_('Math_imul');
  return self.n_('Math_imul') + '(' + L + ', ' + R + ')';
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderDivisionBinary_ = function (self, info, L, R) {
  void self;
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
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderBitwiseBinary_ = function (self, info, L, R) {
  void self;
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
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderRotateBinary_ = function (self, info, L, R) {
  void self;
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
Wasm2Lang.Backend.AsmjsCodegen.renderComparisonOperand_ = function (expr, isUnsigned) {
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
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderComparisonBinary_ = function (self, info, L, R) {
  void self;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const */ renderOp = Wasm2Lang.Backend.AsmjsCodegen.renderComparisonOperand_;
  // Comparisons produce fixnum (0 or 1) in asm.js — no |0 coercion needed.
  var /** @const {number} */ precedence = '==' === info.opStr || '!=' === info.opStr ? P.PREC_EQUALITY_ : P.PREC_RELATIONAL_;
  return P.renderInfix(renderOp(L, info.unsigned), info.opStr, renderOp(R, info.unsigned), precedence);
};
