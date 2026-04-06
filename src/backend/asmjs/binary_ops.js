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
  return P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_);
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
    return P.renderInfix(
      Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(L),
      info.opStr,
      Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(R),
      P.PREC_MULTIPLICATIVE_
    );
  }
  return P.renderInfix(
    Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(L),
    info.opStr,
    Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(R),
    P.PREC_MULTIPLICATIVE_
  );
};

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.AsmjsCodegen.renderBitwiseBinary_ = Wasm2Lang.Backend.AbstractCodegen.renderPlainBitwiseBinary_;

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderRotateBinary_ = function (self, info, L, R) {
  var /** @const {string} */ helperName = info.rotateLeft ? '$w2l_rotl' : '$w2l_rotr';
  self.markHelper_(helperName);
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(self.n_(helperName) + '(' + L + ', ' + R + ')');
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
