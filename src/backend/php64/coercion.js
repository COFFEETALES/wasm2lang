'use strict';

/**
 * Wraps {@code expr} in a 32-bit unsigned mask.  When the input is a numeric
 * literal we constant-fold the mask away — emitting {@code (7 & 0xFFFFFFFF)}
 * costs 16 characters per site where {@code 7} would do.  Negative literals
 * fold to their two's-complement {@code uint32} representation so the
 * downstream unsigned-arithmetic semantics stay identical.
 *
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderMask32_ = function (expr) {
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr)) {
    var /** @const {number} */ n = Number(expr);
    if (n >= 0 && n <= 0xffffffff) return expr;
    if (n >= -0x80000000 && n < 0) return String(n + 0x100000000);
  }
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(expr, '&', '0xFFFFFFFF', P.PREC_BIT_AND_, true);
};

/**
 * Wraps {@code expr} in a {@code & 31} shift-count mask.  Same constant-fold
 * pattern as {@code renderMask32_}: literals already in {@code [0, 31]} pass
 * through; values outside that range fold to their masked value (negative
 * literals via two's-complement-low-5-bits).
 *
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderShiftMask_ = function (expr) {
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr)) {
    return String(Number(expr) & 31);
  }
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(expr, '&', '31', P.PREC_BIT_AND_, true);
};

/**
 * Helpers whose return value is statically guaranteed to lie within the i32
 * signed range, so wrapping a single call to one of them in {@code _w2l_i}
 * is a tautological no-op.  Used by {@code wrapI32_} to skip the redundant
 * outer wrap when its input is exactly one such call.
 *
 *   - {@code _w2l_i}: by definition truncates to i32 signed.
 *   - {@code _w2l_clz}, {@code _w2l_ctz}, {@code _w2l_popcnt}: return [0, 32].
 *   - {@code _w2l_extend8_s} / {@code _w2l_extend16_s}: clamp to signed
 *     [-128, 127] / [-32768, 32767].
 *   - {@code _w2l_imul}: wraps its product through {@code _w2l_i} internally.
 *   - {@code _w2l_trunc_*_f32/f64_to_i32}: range-checked before returning.
 *   - {@code _w2l_trunc_sat_*_f32/f64_to_i32}: clamped to i32.
 *   - {@code _w2l_reinterpret_f32_to_i32}: wraps through {@code _w2l_i}
 *     internally.
 *
 * @const {!Array<string>}
 * @private
 */
Wasm2Lang.Backend.Php64Codegen.I32_CLEAN_HELPERS_ = [
  '_w2l_i',
  '_w2l_clz',
  '_w2l_ctz',
  '_w2l_popcnt',
  '_w2l_extend8_s',
  '_w2l_extend16_s',
  '_w2l_imul',
  '_w2l_trunc_s_f32_to_i32',
  '_w2l_trunc_u_f32_to_i32',
  '_w2l_trunc_s_f64_to_i32',
  '_w2l_trunc_u_f64_to_i32',
  '_w2l_trunc_sat_s_f32_to_i32',
  '_w2l_trunc_sat_u_f32_to_i32',
  '_w2l_trunc_sat_s_f64_to_i32',
  '_w2l_trunc_sat_u_f64_to_i32',
  '_w2l_reinterpret_f32_to_i32'
];

/**
 * Wraps an expression string with the i32 coercion helper unless it is a
 * numeric constant that already fits in the i32 range, or a single call to
 * a helper whose return is statically guaranteed to be in i32 signed range
 * (see {@code I32_CLEAN_HELPERS_}).
 *
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.wrapI32_ = function (expr) {
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr)) return expr;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {number} */ len = expr.length;
  if (')' === expr.charAt(len - 1)) {
    var /** @const {!Array<string>} */ clean = Wasm2Lang.Backend.Php64Codegen.I32_CLEAN_HELPERS_;
    for (var /** @type {number} */ i = 0, /** @const {number} */ cLen = clean.length; i !== cLen; ++i) {
      var /** @const {string} */ candidatePrefix = this.n_(clean[i]) + '(';
      var /** @const {number} */ cpLen = candidatePrefix.length;
      if (len > cpLen && candidatePrefix === expr.slice(0, cpLen) && P.isFullyParenthesized(expr.slice(cpLen - 1))) {
        return expr;
      }
    }
  }
  return this.n_('_w2l_i') + '(' + P.stripOuter(expr) + ')';
};

/**
 * Operators that tolerate an {@code intish} (int64-shaped) operand in PHP
 * without an intermediate {@code _w2l_i(...)} truncation: a chain of
 * {@code _w2l_i(...((op)...))} on the same operator class collapses into a
 * single trailing {@code _w2l_i} when the operator is closed mod 2^32 in PHP
 * int64 arithmetic.
 *
 *   - {@code OP_ARITHMETIC} (+, -): int64 sums of int32 values stay well
 *     inside PHP_INT_MAX (~2^63), so the final {@code _w2l_i} truncation
 *     gives the same result as truncating at every step.
 *   - {@code OP_MULTIPLY} ({@code _w2l_imul}): the helper masks each operand
 *     into 16-bit halves before multiplying, so high bits in an intish
 *     operand are discarded the same way {@code _w2l_i} would.
 *   - {@code OP_BITWISE} {@code &}, {@code |}, {@code ^}: the result's low
 *     32 bits depend only on the operands' low 32 bits, and the consumer's
 *     final {@code _w2l_i} masks any high bits away.
 *
 * Operands of the remaining ops must be truncated to int32 first:
 *   - {@code <<} can lift an int32 to 2^62 territory, but an intish multiplied
 *     by 2^31 risks overflowing PHP_INT_MAX and silently promoting to float.
 *   - {@code >>} arithmetic-shifts and the sign of the int64 view differs
 *     from the sign of the int32 view; result diverges.
 *   - {@code >>>} reinterprets via a 32-bit mask, but the implementation
 *     masks then arithmetic-shifts, so the input still needs to be int32.
 *   - Division/modulo and comparison consume the int32 sign/value directly.
 *   - Rotate goes through a helper that expects an int32-shaped argument.
 *
 * @override
 * @protected
 * @param {string} operand
 * @param {number} cat
 * @param {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo=} opt_opInfo
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.prepareI32BinaryOperand_ = function (operand, cat, opt_opInfo) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (C.INTISH !== cat) return operand;
  if (opt_opInfo) {
    var /** @const {number} */ opCat = opt_opInfo.category;
    if (C.OP_ARITHMETIC === opCat) return operand;
    if (C.OP_MULTIPLY === opCat) return operand;
    if (C.OP_BITWISE === opCat) {
      var /** @const {string} */ op = opt_opInfo.opStr;
      if ('&' === op || '|' === op || '^' === op) return operand;
    }
  }
  return this.wrapI32_(operand);
};

/**
 * Result category for PHP i32 binary operations.  Operations whose renderer
 * no longer wraps in {@code _w2l_i(...)} return {@code INTISH} so consumers
 * pick up the truncation on demand through {@code prepareI32BinaryOperand_}.
 *
 *   - {@code OP_ARITHMETIC} ({@code +}, {@code -}): renderer emits bare
 *     infix → INTISH.
 *   - {@code OP_BITWISE} non-shift ({@code &}, {@code |}, {@code ^}): no
 *     {@code _w2l_i} wrap; low 32 bits are correct but high bits may carry
 *     from an intish operand → INTISH.
 *   - {@code OP_BITWISE} shifts ({@code <<}, {@code >>}, {@code >>>}):
 *     renderer wraps in {@code _w2l_i} → SIGNED.
 *   - {@code OP_MULTIPLY} ({@code _w2l_imul}): helper returns int32 → SIGNED.
 *   - {@code OP_DIVISION} ({@code intdiv}/{@code %} inside {@code _w2l_i}):
 *     wrap present → SIGNED.
 *   - {@code OP_ROTATE} (helper-wrapped): SIGNED.
 *   - {@code OP_COMPARISON}: PHP yields {@code bool}, materialized later.
 *
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @return {number}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.i32BinaryResultCat_ = function (info) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  switch (info.category) {
    case C.OP_COMPARISON:
      return A.CAT_BOOL_I32;
    case C.OP_ARITHMETIC:
      return C.INTISH;
    case C.OP_BITWISE:
      var /** @const {string} */ op = info.opStr;
      if ('<<' === op || '>>' === op || '>>>' === op) return C.SIGNED;
      return C.INTISH;
    default:
      return C.SIGNED;
  }
};

/**
 * PHP's host {@code int} is 64-bit, so an {@code INTISH} expression carries
 * an int64-shaped value that has not yet been wrapped to int32.  Casting
 * such a value directly to {@code float}/{@code double}/{@code i64} reads
 * the int64 numerical value, not the wasm-observable int32 wrap — which
 * diverges from wasm semantics whenever the int64 view sits outside
 * [-2^31, 2^31-1].  When the boundary target is not i32, force the i32
 * truncation first so the subsequent coercion sees the same int32 that
 * wasm would observe.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} cat
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.coerceToType_ = function (binaryen, expr, cat, wasmType) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (C.INTISH === cat && !Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    expr = this.wrapI32_(expr);
    cat = C.SIGNED;
  }
  return Wasm2Lang.Backend.AbstractCodegen.prototype.coerceToType_.call(this, binaryen, expr, cat, wasmType);
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
    return '(float)' + P.wrap_(expr, P.PREC_UNARY_, true);
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
 * @override
 * @protected
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

/** @override @protected @return {string} */
Wasm2Lang.Backend.Php64Codegen.prototype.infiniteLoopKeyword_ = function () {
  return 'for (;;)';
};

/**
 * @override
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
  if ('0' === baseExpr) return String(offset);
  return this.n_('_w2l_i') + '(' + P.renderInfix(baseExpr, '+', String(offset), P.PREC_ADDITIVE_) + ')';
};

// formatCondition_: inherited from AbstractCodegen (delegates to Precedence_).

/**
 * PHP helper function name for each {@code I32Coercion.UNARY_*} category that
 * dispatches directly to a runtime helper.  Keyed by the numeric UNARY_*
 * constant so the emitter can skip an if-chain in favor of a single lookup.
 *
 * @const {!Object<number, string>}
 * @private
 */
Wasm2Lang.Backend.Php64Codegen.PHP_I32_UNARY_HELPERS_ = /** @type {!Object<number, string>} */ (
  Wasm2Lang.Backend.I32Coercion.buildKeyedTable([
    [Wasm2Lang.Backend.I32Coercion.UNARY_CLZ, '_w2l_clz'],
    [Wasm2Lang.Backend.I32Coercion.UNARY_CTZ, '_w2l_ctz'],
    [Wasm2Lang.Backend.I32Coercion.UNARY_POPCNT, '_w2l_popcnt'],
    [Wasm2Lang.Backend.I32Coercion.UNARY_EXTEND8_S, '_w2l_extend8_s'],
    [Wasm2Lang.Backend.I32Coercion.UNARY_EXTEND16_S, '_w2l_extend16_s']
  ])
);

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} unaryCategory
 * @param {string} operandExpr
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitI32Unary_ = function (binaryen, unaryCategory, operandExpr) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (C.UNARY_EQZ === unaryCategory) {
    // PHP's logical NOT on an integer operand returns {@code true} for zero
    // and {@code false} otherwise — same bool result as {@code 0 === v} but
    // fewer characters.  The boolean propagates unchanged because
    // {@code coerceBooleanOperand_} is a no-op here.
    return {
      emittedString: P.renderPrefix('!', operandExpr),
      resultCat: Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32
    };
  }
  var /** @const {string|undefined} */ helperName = Wasm2Lang.Backend.Php64Codegen.PHP_I32_UNARY_HELPERS_[unaryCategory];
  if (helperName) {
    return {emittedString: this.renderHelperCall_(binaryen, helperName, [operandExpr], binaryen.i32), resultCat: C.SIGNED};
  }
  return null;
};
