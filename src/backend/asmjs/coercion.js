'use strict';

// ---------------------------------------------------------------------------
// asm.js-specific coercion overrides.  The static helpers
// ({@code renderSignedCoercion_} / {@code renderUnsignedCoercion_} /
// {@code renderDoubleCoercion_}) and the {@code renderFloatCoercion_}
// prototype method live in {@code jscommon/coercion.js}.
// ---------------------------------------------------------------------------

/**
 * Backend-internal expression category representing an {@code intish} result
 * that originated from an {@code OP_ARITHMETIC} infix ({@code +} or
 * {@code -}).  Distinct from the generic {@code I32Coercion.INTISH} used for
 * loads, helper calls, and other producers that the asm.js spec requires to
 * be coerced before any further arithmetic.
 *
 * SpiderMonkey's asm.js validator special-cases chained {@code +}/{@code -}:
 * the result of {@code int op int} reads as int again when it feeds directly
 * back into {@code +}/{@code -}, even though the spec types the result as
 * {@code intish}.  Tracking this provenance lets us emit the simplified
 * chain ({@code a+b+c|0}) for arithmetic-only inputs while still wrapping
 * loads and division results with {@code |0} where SM rejects them.
 *
 * The constant is namespaced under {@code AsmjsCodegen} and uses a value
 * outside the shared {@code I32Coercion}/{@code AbstractCodegen} cat space
 * so it never collides with the cross-backend constants.
 *
 * @const {number}
 * @private
 */
Wasm2Lang.Backend.AsmjsCodegen.INTISH_ARITH_ = 64;

/**
 * Returns true when {@code cat} is one of the asm.js intish categories
 * (spec-strict {@code INTISH} or arithmetic-chain {@code INTISH_ARITH_}).
 *
 * @protected
 * @param {number} cat
 * @return {boolean}
 */
Wasm2Lang.Backend.AsmjsCodegen.isIntishCat_ = function (cat) {
  return Wasm2Lang.Backend.I32Coercion.INTISH === cat || Wasm2Lang.Backend.AsmjsCodegen.INTISH_ARITH_ === cat;
};

/**
 * asm.js requires explicit type annotations at call/return boundaries.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} cat
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.coerceAtBoundary_ = function (binaryen, expr, cat, wasmType) {
  // Skip coercion when the expression category already satisfies the target
  // asm.js type.  i32: fixnum/signed are valid return/arg types; INT (local.get,
  // comparisons, eqz), UNSIGNED (>>>), and the intish flavors still need
  // coercion.  f32/f64: already-typed expressions (Math_fround / +expr) don't
  // need double wrapping.
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType) && (C.FIXNUM === cat || C.SIGNED === cat)) {
    return expr;
  }
  if (A.CAT_F32 === cat && Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return expr;
  }
  if (A.CAT_F64 === cat && Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return expr;
  }
  return this.renderCoercionByType_(binaryen, expr, wasmType);
};

/**
 * Asm.js returns INT (not SIGNED) for i32 value-type reads so that consumer
 * sites add the {@code |0} coercion required by the asm.js validator.  Non-i32
 * types follow the default (catForCoercedType_) mapping.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {number}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.catForValueTypeRead_ = function (binaryen, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return Wasm2Lang.Backend.I32Coercion.INT;
  }
  return Wasm2Lang.Backend.AbstractCodegen.catForCoercedType_(binaryen, wasmType);
};

/**
 * Returns the result category for a heap load.  Asm.js direct integer loads
 * come back as bare {@code HEAPxx[index]} which the spec types as
 * {@code intish} — leave the {@code |0} for consumers that need int (the
 * existing {@code prepareI32BinaryOperand_} / {@code coerceAtBoundary_}
 * paths add it).  Sub-aligned helper loads route through
 * {@code renderHelperCall_} which already wraps with the typed coercion;
 * float loads come back through {@code renderCoercionByType_}; both stay at
 * the pre-coerced default ({@code catForCoercedType_}).
 *
 * The JavaScript backend overrides this to keep the default (SIGNED) — JS
 * heap views always produce a value already in int32 range at runtime, so
 * marking the load as INTISH only causes the consumer-side hooks to insert
 * a redundant {@code |0} that JS engines do not need for int32 fast-path.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} loadType
 * @param {number} loadBytes
 * @param {number} loadAlign
 * @return {number}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.loadResultCat_ = function (binaryen, loadType, loadBytes, loadAlign) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, loadType) && (1 === loadBytes || loadAlign >= loadBytes)) {
    return C.INTISH;
  }
  return A.catForCoercedType_(binaryen, loadType);
};

/**
 * Asm.js {@code if}/{@code while}/{@code do-while} conditions must be typed
 * {@code int} per the validator — V8 rejects an intish-typed condition
 * with "Unexpected type".  When the condition expression is intish (e.g., a
 * direct heap load whose result we leave intish, or a raw arithmetic sum),
 * apply the |0 coercion before wrapping in parens.
 *
 * @override
 * @protected
 * @param {string} expr
 * @param {number=} opt_condCat
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.formatCondition_ = function (expr, opt_condCat) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {string} */ inner = expr;
  if (Wasm2Lang.Backend.AsmjsCodegen.isIntishCat_(/** @type {number} */ (opt_condCat))) {
    inner = Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(inner);
  }
  return P.formatCondition(inner);
};

/**
 * @override
 * @protected
 * @param {string} condStr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.coerceSwitchCondition_ = function (condStr) {
  return Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(condStr);
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
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  var /** @const */ J = Wasm2Lang.Backend.JsCommonCodegen;
  if (V.isI32(binaryen, wasmType)) return J.renderSignedCoercion_(expr);
  if (V.isF32(binaryen, wasmType)) return this.renderFloatCoercion_(expr);
  if (V.isF64(binaryen, wasmType)) return J.renderDoubleCoercion_(expr);
  return expr;
};

/**
 * Coerces a call (or call_indirect) result expression to its declared wasm
 * type.  Asm.js requires an explicit annotation at every call site: i32 via
 * {@code |0}, f32 via {@code Math.fround(+expr)} for FFI (double→float),
 * f64 via {@code +expr}.  The JavaScript backend overrides this to skip the
 * annotation entirely — callee {@code ReturnId} already coerces the value,
 * and stdlib/imports return JS values already shaped to their declared type.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} callExpr
 * @param {number} callType
 * @param {boolean} isImport  True when the target is a non-stdlib host import.
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.coerceCallResult_ = function (binaryen, callExpr, callType, isImport) {
  if (isImport && binaryen.f32 === callType) {
    return this.renderCoercionByType_(binaryen, Wasm2Lang.Backend.JsCommonCodegen.renderDoubleCoercion_(callExpr), callType);
  }
  return this.renderCoercionByType_(binaryen, callExpr, callType);
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} value
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderConst_ = function (binaryen, value, wasmType) {
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  if (V.isI32(binaryen, wasmType)) return String(value);
  var /** @const {string} */ literal = Wasm2Lang.Backend.AbstractCodegen.formatFloatLiteral_(value);
  if (V.isF32(binaryen, wasmType)) return this.renderFloatCoercion_(literal);
  if (V.isF64(binaryen, wasmType)) return literal;
  return String(value);
};

/**
 * @override
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  if (V.isF32(binaryen, wasmType)) return this.renderMathFroundCall_('0.0');
  if (V.isF64(binaryen, wasmType)) return '0.0';
  return '0';
};

/**
 * Renders a direct-cast import (module = {@code "cast"}) as an inline
 * expression.  Asm.js handles every cast by bridging between i32 and
 * f32/f64 using the native {@code ~~}, {@code |0}, {@code >>>0},
 * {@code Math.fround}, and {@code +} coercions.
 *
 * Subclasses that represent i64 with a host-language type incompatible
 * with asm.js coercion operators (e.g., JavaScript's BigInt — rejects
 * {@code Math.fround}, {@code |0}, {@code ~~}, {@code +expr}) override
 * this to emit their own BigInt-aware inline code and delegate to the
 * asm.js implementation for non-i64 casts.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} castBaseName
 * @param {number} castInputType
 * @param {number} callType
 * @param {string} inputExpr
 * @param {number} inputCat
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderCastImportInline_ = function (
  binaryen,
  castBaseName,
  castInputType,
  callType,
  inputExpr,
  inputCat
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ J = Wasm2Lang.Backend.JsCommonCodegen;
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  if (V.isI32(binaryen, callType)) {
    // float/double → i32: promote float to double with +, then ~~ truncation.
    var /** @type {string} */ castTruncInput = inputExpr;
    if (V.isF32(binaryen, castInputType)) {
      castTruncInput = J.renderDoubleCoercion_(castTruncInput);
    }
    return {
      emittedString: '~~' + A.Precedence_.wrap_(castTruncInput, A.Precedence_.PREC_UNARY_, false),
      resultCat: C.SIGNED
    };
  }
  // int → float/double: coerce to signed (i32) or unsigned (u32), then apply target coercion.
  var /** @const {boolean} */ castIsUnsigned = -1 !== castBaseName.indexOf('u');
  var /** @const {string} */ castInput = castIsUnsigned
      ? J.renderUnsignedCoercion_(inputExpr)
      : this.coerceAtBoundary_(binaryen, inputExpr, inputCat, castInputType);
  return {
    emittedString: this.renderCoercionByType_(binaryen, castInput, callType),
    resultCat: A.catForCoercedType_(binaryen, callType)
  };
};

/**
 * Runtime-helper name for each i32 {@code UNARY_*} category that dispatches
 * to a polyfill (CTZ/POPCNT have no single-instruction JS equivalent).
 *
 * @const {!Object<number, string>}
 * @private
 */
Wasm2Lang.Backend.AsmjsCodegen.ASMJS_I32_UNARY_HELPERS_ = /** @type {!Object<number, string>} */ (
  Wasm2Lang.Backend.I32Coercion.buildKeyedTable([
    [Wasm2Lang.Backend.I32Coercion.UNARY_CTZ, '$w2l_ctz'],
    [Wasm2Lang.Backend.I32Coercion.UNARY_POPCNT, '$w2l_popcnt']
  ])
);

/**
 * Shift amount used to express {@code extendN_s} as a paired left/right-
 * shift (fills the high bits via sign-extending right shift).  Keyed by the
 * numeric {@code UNARY_*} constant.
 *
 * @const {!Object<number, number>}
 * @private
 */
Wasm2Lang.Backend.AsmjsCodegen.ASMJS_I32_UNARY_EXTEND_SHIFTS_ = /** @type {!Object<number, number>} */ (
  Wasm2Lang.Backend.I32Coercion.buildKeyedTable([
    [Wasm2Lang.Backend.I32Coercion.UNARY_EXTEND8_S, 24],
    [Wasm2Lang.Backend.I32Coercion.UNARY_EXTEND16_S, 16]
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
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitI32Unary_ = function (binaryen, unaryCategory, operandExpr) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (C.UNARY_EQZ === unaryCategory) {
    return {emittedString: P.renderPrefix('!', operandExpr), resultCat: C.INT};
  }
  if (C.UNARY_CLZ === unaryCategory) {
    this.markBinding_('Math_clz32');
    return {emittedString: this.n_('Math_clz32') + '(' + operandExpr + ')', resultCat: C.FIXNUM};
  }
  var /** @const {string|undefined} */ helperName = Wasm2Lang.Backend.AsmjsCodegen.ASMJS_I32_UNARY_HELPERS_[unaryCategory];
  if (helperName) {
    return {emittedString: this.renderHelperCall_(binaryen, helperName, [operandExpr], binaryen.i32), resultCat: C.SIGNED};
  }
  var /** @const {number|undefined} */ shift = Wasm2Lang.Backend.AsmjsCodegen.ASMJS_I32_UNARY_EXTEND_SHIFTS_[unaryCategory];
  if (shift) {
    var /** @const {string} */ shiftStr = String(shift);
    return {
      emittedString: P.renderInfix(P.renderInfix(operandExpr, '<<', shiftStr, P.PREC_SHIFT_), '>>', shiftStr, P.PREC_SHIFT_),
      resultCat: C.SIGNED
    };
  }
  return null;
};

/**
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @return {number}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.i32BinaryResultCat_ = function (info) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  switch (info.category) {
    case C.OP_COMPARISON:
      return C.INT;
    case C.OP_BITWISE:
      return info.unsigned ? C.UNSIGNED : C.SIGNED;
    case C.OP_MULTIPLY:
    case C.OP_ROTATE:
    case C.OP_DIVISION:
      // OP_DIVISION emits an outer |0 (see renderI32DivisionBinary_) so its
      // result reads as signed for downstream chains.
      return C.SIGNED;
    case C.OP_ARITHMETIC:
      // INTISH_ARITH_ marks the result as the SpiderMonkey-lenient flavor of
      // intish — chaining through another +/- skips the |0 coercion.
      return Wasm2Lang.Backend.AsmjsCodegen.INTISH_ARITH_;
    default:
      return C.INTISH;
  }
};

/** @override @protected @return {number} */
Wasm2Lang.Backend.AsmjsCodegen.prototype.numericComparisonCat_ = function () {
  return Wasm2Lang.Backend.I32Coercion.INT;
};

/**
 * Renders an i32 {@code /} or {@code %} as the shared
 * {@code (L|0) op (R|0)} infix wrapped in an outer {@code |0}.  The outer
 * coercion is required so the result reads as {@code signed} in the asm.js
 * type lattice — SpiderMonkey's validator rejects the bare division result
 * as an operand to {@code +}, {@code -}, or comparison, even though the
 * spec types {@code int / int} as {@code intish}.  Wrapping the quotient
 * keeps single-pass chains like {@code (a-b) + (c/d)} valid.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderI32DivisionBinary_ = function (self, info, L, R) {
  var /** @const {string} */ quotient = Wasm2Lang.Backend.JsCommonCodegen.renderDivisionBinary_(self, info, L, R);
  return Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(quotient);
};

/**
 * Operators that tolerate {@code intish} operands without an intermediate
 * {@code |0} coercion: any chain of {@code ((x op y|0) op z |0) ... |0} is
 * strictly equivalent to {@code x op y op z ... |0} (modulo-2^32 closure of
 * the operator) so the intermediate coercion is wasted bytes.
 *
 *   - {@code OP_BITWISE} (|, &, ^, <<, >>, >>>): the operator's internal
 *     ToInt32/ToUint32 step coerces operands; spec types these as
 *     {@code intish op intish : signed/unsigned}.
 *   - {@code OP_ARITHMETIC} (+, -): JS Numbers stay exact for int32 sums up
 *     to 2^53, so the trailing {@code |0} truncates the same int32 bit-
 *     pattern whether or not intermediate {@code |0}s ran.  SpiderMonkey's
 *     asm.js validator accepts {@code intish + intish}, {@code (a-b)+(c-d)},
 *     and the full chained form; V8's asm.js validator also accepts both.
 *
 * Note on {@code OP_MULTIPLY}: although the asm.js spec types
 * {@code Math.imul(intish, intish) : signed}, V8's asm.js validator emits
 * "Invalid asm.js: Bad function argument type" when an intish-typed
 * expression is passed directly as a {@code Math.imul} argument and falls
 * back to plain JS execution.  Keep the {@code |0} coercion for
 * {@code OP_MULTIPLY} operands so the validator stays happy on both engines
 * (SpiderMonkey accepts either form).
 *
 * Division, comparison, and rotate-via-helper still require an {@code int}
 * operand: division/comparison because SpiderMonkey's validator rejects
 * intish there, and rotate because the runtime helper accepts a plain int
 * argument and would interpret an int64-shaped value incorrectly.
 *
 * @override
 * @protected
 * @param {string} operand
 * @param {number} cat
 * @param {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo=} opt_opInfo
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.prepareI32BinaryOperand_ = function (operand, cat, opt_opInfo) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const {boolean} */ isArith = Wasm2Lang.Backend.AsmjsCodegen.INTISH_ARITH_ === cat;
  if (C.INTISH !== cat && !isArith) return operand;
  if (opt_opInfo) {
    var /** @const {number} */ opCat = opt_opInfo.category;
    // Bitwise (|, &, ^, <<, >>, >>>) accepts any intish flavor — the operator
    // does its own ToInt32/ToUint32.
    if (C.OP_BITWISE === opCat) return operand;
    // Arithmetic (+, -) accepts only the SM-lenient INTISH_ARITH_ flavor.
    // Spec-strict INTISH (from loads, helper calls, etc.) must be coerced
    // first because SpiderMonkey rejects {@code intish + int} when the
    // intish was not itself produced by another +/-.
    if (C.OP_ARITHMETIC === opCat && isArith) return operand;
  }
  return Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(operand);
};

// buildCoercedCallArgs_, buildCoercedCallIndirectArgs_, and
// renderImplicitReturn_ are no longer overridden here — the base class
// implementations now delegate to coerceAtBoundary_ which asm.js
// overrides above to always apply the type annotation.
