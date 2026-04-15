'use strict';

// ---------------------------------------------------------------------------
// Static i32 binary-op renderers shared by asm.js and modern-JS backends.
// Uses the shared I32Coercion classification.
// ---------------------------------------------------------------------------

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderArithmeticBinary_ = function (self, info, L, R) {
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
Wasm2Lang.Backend.JsCommonCodegen.renderMultiplyBinary_ = function (self, info, L, R) {
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
Wasm2Lang.Backend.JsCommonCodegen.renderDivisionBinary_ = function (self, info, L, R) {
  void self;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {function(string): string} */ coerce = info.unsigned
      ? Wasm2Lang.Backend.JsCommonCodegen.renderUnsignedCoercion_
      : Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_;
  return P.renderInfix(coerce(L), info.opStr, coerce(R), P.PREC_MULTIPLICATIVE_);
};

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.JsCommonCodegen.renderBitwiseBinary_ = Wasm2Lang.Backend.AbstractCodegen.renderPlainBitwiseBinary_;

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderRotateBinary_ = function (self, info, L, R) {
  var /** @const {string} */ helperName = info.rotateLeft ? '$w2l_rotl' : '$w2l_rotr';
  self.markHelper_(helperName);
  return Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(self.n_(helperName) + '(' + L + ', ' + R + ')');
};

/**
 * @param {string} expr
 * @param {boolean} isUnsigned
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderComparisonOperand_ = function (expr, isUnsigned) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;

  if (C.isConstant(expr) && !isUnsigned) {
    return expr;
  }
  if (isUnsigned) {
    return Wasm2Lang.Backend.JsCommonCodegen.renderUnsignedCoercion_(expr);
  }
  return P.wrap_(Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(expr), P.PREC_RELATIONAL_, false);
};

/**
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.renderComparisonBinary_ = function (self, info, L, R) {
  void self;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const */ renderOp = Wasm2Lang.Backend.JsCommonCodegen.renderComparisonOperand_;
  // Comparisons produce fixnum (0 or 1) in asm.js — no |0 coercion needed.
  var /** @const {number} */ precedence = '==' === info.opStr || '!=' === info.opStr ? P.PREC_EQUALITY_ : P.PREC_RELATIONAL_;
  return P.renderInfix(renderOp(L, info.unsigned), info.opStr, renderOp(R, info.unsigned), precedence);
};
