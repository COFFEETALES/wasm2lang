'use strict';

// ---------------------------------------------------------------------------
// Binary-op rendering (uses shared I32Coercion classification).
// ---------------------------------------------------------------------------

/**
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {number} */ len = expr.length;
  if (len >= 2 && '|' === expr.charAt(len - 2) && '0' === expr.charAt(len - 1)) {
    return expr;
  }
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr)) {
    return expr;
  }
  return P.wrap(expr, P.PREC_BIT_OR_, true) + '|0';
};

/**
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr) && '-' !== expr.charAt(0)) {
    return expr;
  }
  return P.wrap(expr, P.PREC_SHIFT_, true) + '>>>0';
};

/**
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderDoubleCoercion_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ trimmed = expr.replace(/^\s+|\s+$/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(expr)) {
    return -1 === expr.indexOf('.') ? expr + '.0' : expr;
  }
  if (/^[+-]/.test(trimmed)) {
    return '+(' + expr + ')';
  }
  return '+' + P.wrap(expr, P.PREC_UNARY_, false);
};

/**
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderFloatCoercion_ = function (expr) {
  this.markBinding_('Math_fround');
  return this.n_('Math_fround') + '(' + expr + ')';
};

/**
 * @override
 * @protected
 * @param {string} condStr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.coerceSwitchCondition_ = function (condStr) {
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(condStr);
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderCoercionByType_ = function (binaryen, expr, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(expr);
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return this.renderFloatCoercion_(expr);
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderDoubleCoercion_(expr);
  }
  return expr;
};

/**
 * @param {!Binaryen} binaryen
 * @param {number} value
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderConst_ = function (binaryen, value, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return String(value);
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return this.renderFloatCoercion_(Wasm2Lang.Backend.AbstractCodegen.formatFloatLiteral_(value));
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return Wasm2Lang.Backend.AbstractCodegen.formatFloatLiteral_(value);
  }
  return String(value);
};

/**
 * @override
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.getRuntimeHelperPrefix_ = function () {
  return '$w2l_';
};

/**
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    this.markBinding_('Math_fround');
    return this.n_('Math_fround') + '(0.0)';
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return '0.0';
  }
  return '0';
};
