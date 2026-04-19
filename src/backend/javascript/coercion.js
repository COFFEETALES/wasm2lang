'use strict';

// ---------------------------------------------------------------------------
// Coercion overrides for JavaScript.
//
// Boundary annotations (function params, return values, call arguments) are
// relaxed to match the base-class default that only coerces when the
// expression category does not already satisfy the target type.  Intermediate
// expressions still follow asm.js coercion rules for i32 overflow (|0), f32
// precision (Math.fround), and unsigned semantics (>>>0).  i64 values flow as
// BigInt; i64-producing operations wrap their results with BigInt.asIntN(64)
// to preserve wasm wrap-around semantics.
// ---------------------------------------------------------------------------

/**
 * JavaScript does not require explicit type annotations at boundaries.
 * Delegates to {@code coerceToType_} which only coerces when the expression
 * category does not already satisfy the target type.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} cat
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.coerceAtBoundary_ = function (binaryen, expr, cat, wasmType) {
  return this.coerceToType_(binaryen, expr, cat, wasmType);
};

/**
 * JavaScript switch accepts any value — no signed coercion needed for the
 * discriminant when all cases are integer literals already.
 *
 * @override
 * @protected
 * @param {string} condStr
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.coerceSwitchCondition_ = function (condStr) {
  return condStr;
};

/**
 * Asm.js inherits a no-op {@code renderNumericComparisonResult_} because
 * its comparison operators already produce {@code 0}/{@code 1} integers;
 * JavaScript comparisons instead yield booleans.  For switch dispatch the
 * boolean has to be materialized into an integer (switch case matching is
 * strict {@code ===} and {@code true !== 1}), so override back to the
 * base-class {@code (cond ? 1 : 0)} materializer.  Arithmetic/bitwise/
 * boundary-coercion call sites route through {@code coerceBooleanOperand_}
 * instead, which JS no-ops since JS auto-coerces booleans in those
 * contexts via {@code ToNumber}/{@code ToInt32}.
 *
 * @override
 * @protected
 * @param {string} conditionExpr
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderNumericComparisonResult_ = function (conditionExpr) {
  return conditionExpr + ' ? 1 : 0';
};

/**
 * Skip boolean materialization at arithmetic/bitwise/boundary call sites —
 * JS auto-coerces booleans to {@code 0}/{@code 1} there.  Switch dispatch
 * still goes through {@code renderNumericComparisonResult_} and keeps the
 * ternary materialization.
 *
 * @override
 * @protected
 * @param {string} operandExpr
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.coerceBooleanOperand_ = function (operandExpr) {
  return operandExpr;
};

/**
 * JavaScript Numbers are exact for integers up to 2<sup>53</sup>, so the
 * intermediate {@code |0} that asm.js inserts on every {@code INTISH} operand
 * is not required between most i32 binary ops — bitwise/shift/comparison-eq
 * sites already invoke {@code ToInt32}/{@code ToUint32} on their operands,
 * and {@code Math.imul} normalizes via {@code ToUint32}.  Two op categories
 * still need explicit coercion:
 *   - {@code OP_DIVISION} ({@code /} and {@code %}): operate on raw Numbers,
 *     so an INTISH dividend like {@code (k - 1)} for {@code k = INT32_MIN}
 *     diverges from wasm i32 wraparound.
 *   - {@code OP_COMPARISON} (signed): comparing INTISH values that overflow
 *     int32 (e.g., {@code (INT32_MAX + 1) < 0}) yields the opposite of the
 *     wrapped int32 comparison.  Unsigned comparisons reinterpret via
 *     {@code >>>0} which already wraps, so they need no extra coercion.
 *
 * Unary call sites (eqz/clz/ctz/popcnt) pass {@code opt_opInfo === null} and
 * are no-op — those operations already invoke {@code ToInt32}/{@code ToUint32}
 * on their operand.
 *
 * @override
 * @protected
 * @param {string} operand
 * @param {number} cat
 * @param {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo=} opt_opInfo
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.prepareI32BinaryOperand_ = function (operand, cat, opt_opInfo) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (C.INTISH !== cat || !opt_opInfo) return operand;
  if (C.OP_DIVISION === opt_opInfo.category || (C.OP_COMPARISON === opt_opInfo.category && !opt_opInfo.unsigned)) {
    return Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(operand);
  }
  return operand;
};

/**
 * Asm.js collapses comparison results to integer category because its type
 * system forces 0/1 integers at the op level.  JavaScript comparisons yield
 * boolean values, so the result category stays {@code CAT_BOOL_I32}; consumers
 * that genuinely need a 0/1 integer (switch dispatch) materialize the boolean
 * themselves.  Division/modulo results are truncated to {@code SIGNED} by the
 * override in {@code binary_ops.js}, so the cat reflects the {@code |0}.
 *
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @return {number}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.i32BinaryResultCat_ = function (info) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (C.OP_COMPARISON === info.category) return Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32;
  if (C.OP_DIVISION === info.category) return C.SIGNED;
  return Wasm2Lang.Backend.AsmjsCodegen.prototype.i32BinaryResultCat_.call(this, info);
};

/**
 * Float comparison results are booleans in JavaScript, not integer 0/1.
 *
 * @override
 * @protected
 * @return {number}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.numericComparisonCat_ = function () {
  return Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32;
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderCoercionByType_ = function (binaryen, expr, wasmType) {
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  if (V.isI64(binaryen, wasmType)) {
    this.markHelper_('$w2l_bigint_asintn');
    return this.n_('$w2l_bigint_asintn') + '(64, ' + Wasm2Lang.Backend.AbstractCodegen.Precedence_.stripOuter(expr) + ')';
  }
  // JavaScript numbers are doubles by default — no explicit +x coercion needed.
  if (V.isF64(binaryen, wasmType)) return expr;
  return Wasm2Lang.Backend.AsmjsCodegen.prototype.renderCoercionByType_.call(this, binaryen, expr, wasmType);
};

/**
 * Runtime helpers self-coerce their return value: i32 helpers end the body
 * with {@code return ...|0;}, f32 helpers wrap with {@code Math.fround(...)},
 * f64 helpers return {@code +(...)}, and i64 helpers return BigInts already
 * inside the signed 64-bit range (either via {@code BigInt.asIntN(64, ...)}
 * or because the helper produces a small BigInt like a bit count or a load
 * read through {@code HEAP64}).  The outer {@code renderCoercionByType_}
 * wrap that the asm.js-targeted base implementation applies is therefore
 * redundant in modern JavaScript — strip it so call sites stay bare.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} helperName
 * @param {!Array<string>} args
 * @param {number} resultType
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderHelperCall_ = function (binaryen, helperName, args, resultType) {
  void binaryen;
  void resultType;
  this.markHelper_(helperName);
  return this.n_(helperName) + '(' + args.join(', ') + ')';
};

/**
 * JavaScript call-site results carry their declared wasm type without an
 * outer coercion wrap:
 *   - Internal functions: {@code ReturnId} ran {@code coerceAtBoundary_}
 *     on the returned expression, so the value already satisfies the
 *     declared return type ({@code |0} for i32, {@code Math.fround(...)}
 *     for f32, {@code BigInt.asIntN(64, ...)} for i64, bare Number for
 *     f64).  {@code call_indirect} targets are always user-defined, so
 *     the same invariant holds.
 *   - Stdlib calls ({@code Math.imul}, {@code Math.fround},
 *     {@code Math.clz32}, {@code Math.sqrt}, ...): each returns a JS value
 *     whose shape already matches the declared wasm type — {@code imul}
 *     and {@code clz32} return signed i32, {@code fround} returns an
 *     f32-precision Number, trig/root functions return f64 doubles.
 *   - Host imports: the FFI contract requires the host to return a value
 *     of the declared type; defensive re-coercion hides rather than
 *     surfaces a bug in the host binding.
 *
 * Caller records {@code resultCat = catForCoercedType_(callType)} which
 * already marks the bare expression as fully typed, so downstream
 * {@code coerceToType_} skips further wrapping.  The sole asm.js-specific
 * wrinkle the base class handles — promoting FFI f32 returns through
 * {@code +expr} before {@code Math.fround} — does not apply in JavaScript
 * because there is no distinct double type to bridge.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} callExpr
 * @param {number} callType
 * @param {boolean} isImport
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.coerceCallResult_ = function (binaryen, callExpr, callType, isImport) {
  void binaryen;
  void callType;
  void isImport;
  return callExpr;
};

/**
 * Renders a binaryen i64 constant as a BigInt literal.
 *
 * BigInt has no fixed width — hex literals are interpreted as their
 * mathematical value, not as a signed two's-complement bit pattern.  When
 * the input arrives as a BigInt (binaryen 129+), stringify directly so that
 * negative i64 values stay negative; only the {@code {low, high}} object
 * form requires the shared low/high hex emission.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {*} value
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderI64Const_ = function (binaryen, value) {
  void binaryen;
  if ('bigint' === typeof value) return String(value) + 'n';
  return Wasm2Lang.Backend.AbstractCodegen.formatI64WithSuffix_(value, 'n');
};

/**
 * @override
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  if (V.isI64(binaryen, wasmType)) return '0n';
  if (V.isF32(binaryen, wasmType)) return this.renderMathFroundCall_('0');
  return '0';
};

/**
 * Direct-cast imports involving i64/u64 cannot use the asm.js inline
 * operators ({@code ~~}, {@code |0}, {@code >>>0}, {@code Math.fround},
 * {@code +expr}) because BigInt rejects all of them.  Emit the BigInt↔Number
 * bridge directly so the call stays inline and no foreign import is needed.
 *
 *   i64_to_f32 / u64_to_f32 → {@code Math.fround(Number(bigIntExpr))}
 *   i64_to_f64 / u64_to_f64 → {@code Number(bigIntExpr)}
 *   f32_to_i64 / f64_to_i64 → {@code BigInt(Math.trunc(floatExpr))}
 *   f32_to_u64 / f64_to_u64 → {@code BigInt(Math.trunc(floatExpr))}
 *
 * Signed and unsigned BigInt→Number conversions emit the same code: BigInt
 * has no width, so {@code Number(x)} yields the mathematical value of the
 * stored signed BigInt.  This matches the host-import semantics used by the
 * test harness ({@code u64_to_f32: x => Math.fround(Number(x))}) and the
 * Java backend's {@code (float)(long)x} cast — both treat the i64 storage
 * value as signed.  Reinterpreting via {@code BigInt.asUintN(64, ...)} would
 * diverge from these reference implementations for negative i64 inputs.
 *
 * The caller wraps i64 results with {@code BigInt.asIntN(64, ...)} via
 * {@code renderCoercionByType_}, so float→i64/u64 emission does not need to
 * apply that wrap itself.
 *
 * Non-i64 casts (e.g. {@code i32_to_f32}) delegate to the asm.js renderer.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} castBaseName
 * @param {number} castInputType
 * @param {number} callType
 * @param {string} inputExpr
 * @param {number} inputCat
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderCastImportInline_ = function (
  binaryen,
  castBaseName,
  castInputType,
  callType,
  inputExpr,
  inputCat
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ P = A.Precedence_;
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  var /** @const {boolean} */ inputIsI64 = V.isI64(binaryen, castInputType);
  var /** @const {boolean} */ outputIsI64 = V.isI64(binaryen, callType);
  if (inputIsI64) {
    this.markHelper_('$w2l_number');
    var /** @const {string} */ numberExpr = this.n_('$w2l_number') + '(' + P.stripOuter(inputExpr) + ')';
    if (V.isF32(binaryen, callType)) {
      return {emittedString: this.renderMathFroundCall_(numberExpr), resultCat: A.CAT_F32};
    }
    return {emittedString: numberExpr, resultCat: A.CAT_F64};
  }
  if (outputIsI64) {
    this.markHelper_('$w2l_bigint');
    return {
      emittedString: this.n_('$w2l_bigint') + '(Math.trunc(' + P.stripOuter(inputExpr) + '))',
      resultCat: A.CAT_I64
    };
  }
  return Wasm2Lang.Backend.AsmjsCodegen.prototype.renderCastImportInline_.call(
    this,
    binaryen,
    castBaseName,
    castInputType,
    callType,
    inputExpr,
    inputCat
  );
};

/**
 * Runtime-helper name for each i64 {@code UNARY_*} category that dispatches
 * to a polyfill (bit-counting operations have no native BigInt equivalent).
 *
 * @const {!Object<number, string>}
 * @private
 */
Wasm2Lang.Backend.JavaScriptCodegen.JS_I64_UNARY_HELPERS_ = /** @return {!Object<number, string>} */ (function () {
  var /** @const */ I = Wasm2Lang.Backend.I64Coercion;
  var /** @const {!Object<number, string>} */ table = {};
  table[I.UNARY_CLZ] = '$w2l_i64_clz';
  table[I.UNARY_CTZ] = '$w2l_i64_ctz';
  table[I.UNARY_POPCNT] = '$w2l_i64_popcnt';
  return table;
})();

/**
 * Bit width to pass to {@code BigInt.asIntN} for each sign-extend
 * {@code UNARY_*} category.
 *
 * @const {!Object<number, number>}
 * @private
 */
Wasm2Lang.Backend.JavaScriptCodegen.JS_I64_UNARY_EXTEND_WIDTHS_ = /** @return {!Object<number, number>} */ (function () {
  var /** @const */ I = Wasm2Lang.Backend.I64Coercion;
  var /** @const {!Object<number, number>} */ table = {};
  table[I.UNARY_EXTEND8_S] = 8;
  table[I.UNARY_EXTEND16_S] = 16;
  table[I.UNARY_EXTEND32_S] = 32;
  return table;
})();

/**
 * BigInt-based i64 unary operations (eqz, clz, ctz, popcnt, sign-extend).
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} unaryCategory
 * @param {string} operandExpr
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.emitI64Unary_ = function (binaryen, unaryCategory, operandExpr) {
  var /** @const */ I = Wasm2Lang.Backend.I64Coercion;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ P = A.Precedence_;
  if (I.UNARY_EQZ === unaryCategory) {
    return {
      emittedString: P.renderInfix(operandExpr, '==', '0n', P.PREC_EQUALITY_),
      resultCat: A.CAT_BOOL_I32
    };
  }
  var /** @const {string|undefined} */ helperName = Wasm2Lang.Backend.JavaScriptCodegen.JS_I64_UNARY_HELPERS_[unaryCategory];
  if (helperName) {
    return {emittedString: this.renderHelperCall_(binaryen, helperName, [operandExpr], binaryen.i64), resultCat: A.CAT_I64};
  }
  var /** @const {number|undefined} */ extendWidth =
      Wasm2Lang.Backend.JavaScriptCodegen.JS_I64_UNARY_EXTEND_WIDTHS_[unaryCategory];
  if (extendWidth) {
    this.markHelper_('$w2l_bigint_asintn');
    return {
      emittedString: this.n_('$w2l_bigint_asintn') + '(' + extendWidth + ', ' + P.stripOuter(operandExpr) + ')',
      resultCat: A.CAT_I64
    };
  }
  return null;
};
