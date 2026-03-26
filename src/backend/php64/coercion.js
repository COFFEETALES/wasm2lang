'use strict';

/**
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderMask32_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(expr, '&', '0xFFFFFFFF', P.PREC_BIT_AND_, true);
};

/**
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderShiftMask_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(expr, '&', '31', P.PREC_BIT_AND_, true);
};

/**
 * Wraps an expression string with the i32 coercion helper unless it is a
 * numeric constant that already fits in the i32 range.
 *
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.wrapI32_ = function (expr) {
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr)) return expr;
  var /** @const {string} */ helperName = this.n_('_w2l_i');
  var /** @const {string} */ prefix = helperName + '(';
  // Avoid double-wrapping: if the expression is already a helper call,
  // it is already i32-truncated.
  var /** @const {number} */ len = expr.length;
  var /** @const {number} */ prefixLen = prefix.length;
  if (
    len > prefixLen &&
    prefix === expr.slice(0, prefixLen) &&
    ')' === expr.charAt(len - 1) &&
    Wasm2Lang.Backend.AbstractCodegen.Precedence_.isFullyParenthesized(expr.slice(prefixLen - 1))
  ) {
    return expr;
  }
  return prefix + Wasm2Lang.Backend.AbstractCodegen.Precedence_.stripOuter(expr) + ')';
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderCoercionByType_ = function (binaryen, expr, wasmType) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return this.wrapI32_(expr);
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return this.n_('_w2l_f32') + '(' + P.stripOuter(expr) + ')';
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    if (0 === expr.indexOf('(float)')) return expr;
    return '(float)' + P.wrap(expr, P.PREC_UNARY_, true);
  }
  return expr;
};

/**
 * PHP helpers declare typed return values (`: int`, `: float`), so the
 * coercion wrapper that the base implementation adds is always redundant.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} helperName
 * @param {!Array<string>} args
 * @param {number} resultType
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderHelperCall_ = function (binaryen, helperName, args, resultType) {
  this.markHelper_(helperName);
  return this.n_(helperName) + '(' + args.join(', ') + ')';
};

/**
 * @param {!Binaryen} binaryen
 * @param {number} value
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderConst_ = function (binaryen, value, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return String(value);
  }
  return Wasm2Lang.Backend.AbstractCodegen.formatFloatLiteral_(value);
};

/**
 * @override
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.getRuntimeHelperPrefix_ = function () {
  return '_w2l_';
};

/**
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return '0';
  }
  return '0.0';
};

// ---------------------------------------------------------------------------
// Static helpers.
// ---------------------------------------------------------------------------

/**
 * @param {string} baseExpr
 * @param {number} offset
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderPtrWithOffset_ = function (baseExpr, offset) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (0 === offset) return baseExpr;
  return this.n_('_w2l_i') + '(' + P.renderInfix(baseExpr, '+', String(offset), P.PREC_ADDITIVE_) + ')';
};

// formatCondition_: inherited from AbstractCodegen (delegates to Precedence_).
