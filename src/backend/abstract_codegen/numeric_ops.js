'use strict';

// ---------------------------------------------------------------------------
// Coercion helpers, typed helper calls, direct/indirect call argument
// coercion, numeric unary/binary rendering, and binary renderer dispatch.
// ---------------------------------------------------------------------------

/**
 * Backend hook for wasm-type coercion used by the shared typed-string helpers.
 *
 * Concrete backends override this with target-language coercion rules.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderCoercionByType_ = function (binaryen, expr, wasmType) {
  return expr;
};

/**
 * Backend hook for rendering a constant value as a string literal.
 *
 * Concrete backends override this with target-language const formatting.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} value
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderConst_ = function (binaryen, value, wasmType) {
  return String(value);
};

/**
 * Decomposes an i64 value (BigInt or {@code {low, high}} pair) into a
 * {@code [unsignedLow32, signedHigh32]} tuple.  Returning a positional array
 * sidesteps the property-name renaming hazard caused by the binaryen extern
 * already defining {@code .low} / {@code .high}, which would otherwise
 * prevent Closure from mangling typedef field names on the result.
 *
 * @suppress {checkTypes}
 * @protected
 * @param {*} value
 * @return {!Array<number>}  Two-element array [low, high].
 */
Wasm2Lang.Backend.AbstractCodegen.decomposeI64_ = function (value) {
  if ('bigint' === typeof value) {
    return [Number(BigInt(value) & BigInt(0xffffffff)) >>> 0, Number((BigInt(value) >> BigInt(32)) & BigInt(0xffffffff)) | 0];
  }
  var /** @const {!Object} */ v = /** @type {!Object} */ (value);
  return [v['low'] >>> 0, v['high'] | 0];
};

/**
 * Formats a {@code (hi, lo)} pair as the canonical
 * {@code 0xHHHHHHHHLLLLLLLL} + {@code suffix} hex literal.  Shared by
 * {@link formatI64WithSuffix_} and the base {@link renderI64Const_}.
 *
 * @protected
 * @param {number} hi  Signed 32-bit upper half.
 * @param {number} lo  Unsigned 32-bit lower half.
 * @param {string} suffix
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.renderI64HexLiteral_ = function (hi, lo, suffix) {
  return '0x' + (hi >>> 0).toString(16) + ('00000000' + lo.toString(16)).slice(-8) + suffix;
};

/**
 * Renders a pointer expression with an optional static byte offset applied
 * as a bare {@code base + offset} additive infix.  When {@code offset} is
 * zero the base expression is returned unchanged; when the base is the
 * literal {@code '0'} the offset alone is returned.  Shared verbatim by the
 * asm.js, JavaScript, and Java backends — PHP overrides it on its prototype
 * to wrap the sum in the {@code _w2l_i} truncation helper.
 *
 * @protected
 * @param {string} baseExpr
 * @param {number} offset
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.renderPtrWithOffset_ = function (baseExpr, offset) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (0 === offset) return baseExpr;
  if ('0' === baseExpr) return String(offset);
  return P.renderInfix(baseExpr, '+', String(offset), P.PREC_ADDITIVE_);
};

/**
 * Renders an i64 literal with a language-specific suffix and small-value
 * shortcuts (zero, small positive, small negative).  Falls back to a hex
 * encoding of the unsigned 64-bit pattern for the general case.
 *
 * @protected
 * @param {*} value
 * @param {string} suffix  Language literal suffix ('L', 'n', etc.).
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.formatI64WithSuffix_ = function (value, suffix) {
  var /** @const {!Array<number>} */ parts = Wasm2Lang.Backend.AbstractCodegen.decomposeI64_(value);
  var /** @const {number} */ low = parts[0];
  var /** @const {number} */ high = parts[1];
  if (0 === low && 0 === high) return '0' + suffix;
  if (0 === high) return String(low) + suffix;
  if (-1 === high && low >= 0x80000000) return String(low - 4294967296) + suffix;
  return Wasm2Lang.Backend.AbstractCodegen.renderI64HexLiteral_(high, low, suffix);
};

/**
 * Backend hook for rendering an i64 constant value.  The value is either a
 * BigInt (binaryen 129+) or an object with {@code low} and {@code high}
 * 32-bit halves (older binaryen).  Only called for backends that handle i64
 * natively.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {*} value  The i64 value (BigInt or {low: number, high: number}).
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderI64Const_ = function (binaryen, value) {
  var /** @const {!Array<number>} */ parts = Wasm2Lang.Backend.AbstractCodegen.decomposeI64_(value);
  return Wasm2Lang.Backend.AbstractCodegen.renderI64HexLiteral_(parts[1], parts[0], '/*i64*/');
};

/**
 * Backend hook for rendering the default init value for a local variable.
 *
 * Concrete backends override this with target-language init formatting.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  return '0';
};

/**
 * Shared local-init ladder for the class-shaped backends: java and csharp
 * spell every scalar zero identically ({@code 0L} / {@code 0.0f} /
 * {@code 0.0} / {@code 0}) and differ only in the v128 zero expression,
 * which each backend's {@code renderLocalInit_} passes in.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @param {string} v128ZeroExpr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderManagedLocalInit_ = function (binaryen, wasmType, v128ZeroExpr) {
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  if (V.isI64(binaryen, wasmType)) {
    return '0L';
  }
  if (V.isF32(binaryen, wasmType)) {
    return '0.0f';
  }
  if (V.isF64(binaryen, wasmType)) {
    return '0.0';
  }
  if (V.isV128(binaryen, wasmType)) {
    return v128ZeroExpr;
  }
  return '0';
};

/**
 * Coerces {@code expr} to {@code wasmType}, skipping the coercion when
 * {@code cat} indicates the expression already satisfies the target type.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} cat  Expression category (I32Coercion constant or CAT_*).
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.coerceToType_ = function (binaryen, expr, cat, wasmType) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    if (C.SIGNED === cat || C.FIXNUM === cat || C.UNSIGNED === cat || C.INT === cat) return expr;
    if (A.CAT_BOOL_I32 === cat) return this.coerceBooleanOperand_(expr);
  } else if (Wasm2Lang.Backend.ValueType.isI64(binaryen, wasmType)) {
    if (A.CAT_I64 === cat) return expr;
  } else if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    if (A.CAT_F32 === cat) return expr;
  } else if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    if (A.CAT_F64 === cat) return expr;
    // Languages where float widens to double automatically (Java, PHP)
    // can skip the explicit f64 cast when the source is already f32.
    if (A.CAT_F32 === cat && this.f32WidensToF64_) return expr;
  } else if (Wasm2Lang.Backend.ValueType.isV128(binaryen, wasmType)) {
    if (A.CAT_V128 === cat) return expr;
  }
  return this.renderCoercionByType_(binaryen, expr, wasmType);
};

/**
 * Coerces an expression at a call/return boundary.  The default delegates to
 * {@code coerceToType_} (uses the expression category to skip redundant
 * coercion).  Asm.js overrides to always apply the type annotation via
 * {@code renderCoercionByType_} regardless of category, as the asm.js
 * validator requires explicit annotations at every call/return site.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} cat   Expression category (may be ignored by overrides).
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.coerceAtBoundary_ = function (binaryen, expr, cat, wasmType) {
  return this.coerceToType_(binaryen, expr, cat, wasmType);
};

/**
 * Renders a helper call with no result coercion — {@code name(args)} — and
 * marks the helper used.  This is the whole call assembly, stated once:
 * backends whose helpers already return fully-typed values install it as
 * their {@code renderHelperCall_} directly (javascript, php64 — each for its
 * own reason, documented at the install site), and the coercing default
 * below wraps it in {@code renderCoercionByType_}.
 *
 * Deliberately not {@code @protected}, for the same reason as
 * {@code formatTypedCondition_} (precedence.js): the installing backends
 * reference it by direct prototype assignment rather than through
 * {@code this}, and Closure rejects a protected access made outside the
 * declaring class's own methods.
 *
 * @param {!Binaryen} binaryen
 * @param {string} helperName
 * @param {!Array<string>} args
 * @param {number} resultType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderBareHelperCall_ = function (binaryen, helperName, args, resultType) {
  this.markHelper_(helperName);
  return this.n_(helperName) + '(' + args.join(', ') + ')';
};

/**
 * Shared typed helper-call rendering for string-expression backends.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} helperName
 * @param {!Array<string>} args
 * @param {number} resultType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderHelperCall_ = function (binaryen, helperName, args, resultType) {
  return this.renderCoercionByType_(binaryen, this.renderBareHelperCall_(binaryen, helperName, args, resultType), resultType);
};

/**
 * Builds coerced argument strings for a call_indirect expression.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} expr
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.buildCoercedCallIndirectArgs_ = function (binaryen, expr, childResults) {
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(/** @type {number} */ (expr.params));
  var /** @const {!Array<string>} */ callArgs = [];
  var /** @const */ getInfo = Wasm2Lang.Backend.AbstractCodegen.getChildResultInfo_;

  // childResults[0] = target index expression, operands start at 1.
  for (var /** @type {number} */ ai = 0, /** @const {number} */ alen = paramTypes.length; ai !== alen; ++ai) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ argInfo = getInfo(childResults, ai + 1);
    callArgs.push(this.coerceAtBoundary_(binaryen, argInfo.expressionString, argInfo.expressionCategory, paramTypes[ai]));
  }

  return callArgs;
};

/**
 * Returns whether a call_indirect needs an evaluation-order barrier.
 *
 * Wasm evaluates every operand from left to right and only then evaluates
 * the table index.  Native target syntax (`table[index](args)`) evaluates
 * the index first.  The direct form remains valid when that reordering is
 * unobservable: reads may commute with reads, and moving a constant across
 * an effect changes no state.  A barrier is required when an observable
 * index can precede a meaningful operand, or when an observable operand can
 * precede a state read performed by the index.  Calls, writes, branches,
 * atomics and implicit traps are treated conservatively as observable.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} expr
 * @param {!BinaryenModule} wasmModule
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.callIndirectNeedsOrderedEvaluation_ = function (binaryen, expr, wasmModule) {
  var /** @const {!BinaryenSideEffects} */ S = binaryen.SideEffects;
  var /** @const {number} */ readOnlyMask = S.ReadsLocal | S.ReadsGlobal | S.ReadsMemory | S.ReadsTable | S.TrapsNeverHappen;
  var /** @const {number} */ observableMask = S.Any & ~readOnlyMask;
  var /** @type {number} */ operandEffects = 0;
  var /** @const {!Array<number>} */ operands = /** @type {!Array<number>} */ (expr.operands || []);
  for (var /** @type {number} */ i = 0; i !== operands.length; ++i) {
    operandEffects |= binaryen.getSideEffects(operands[i], wasmModule);
  }
  var /** @const {number} */ targetEffects = binaryen.getSideEffects(/** @type {number} */ (expr.target), wasmModule);
  var /** @const {number} */ operandMeaningful = operandEffects & (readOnlyMask | observableMask);
  var /** @const {number} */ targetReads = targetEffects & readOnlyMask;
  return (
    (0 !== (targetEffects & observableMask) && 0 !== operandMeaningful) ||
    (0 !== (operandEffects & observableMask) && 0 !== targetReads)
  );
};

/**
 * Returns the module-scope dispatcher name used when a call_indirect needs
 * its operands evaluated before its index.  The prefix is backend-specific
 * (`$w2l_` for JS/Java, `_w2l_` for PHP) while the signature suffix keeps
 * wrappers typed and shared by all ordered sites of the same signature.
 *
 * @protected
 * @param {string} signatureKey
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getOrderedCallIndirectWrapperName_ = function (signatureKey) {
  return this.getRuntimeHelperPrefix_() + 'call_indirect_' + signatureKey;
};

/**
 * Backend hook turning a relational-condition expression into an i32 result.
 *
 * @protected
 * @param {string} conditionExpr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericComparisonResult_ = function (conditionExpr) {
  return conditionExpr + ' ? 1 : 0';
};

/**
 * Backend hook for a {@code CAT_BOOL_I32} operand about to feed an arithmetic
 * or bitwise op — call sites where the consumer will itself coerce booleans
 * to integers (asm.js/PHP/Java still need the ternary; modern JS does not).
 * Defaults to {@code renderNumericComparisonResult_}; JS overrides to a
 * no-op so the emitted binary/unary chain keeps the bare comparison.
 *
 * @protected
 * @param {string} operandExpr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.coerceBooleanOperand_ = function (operandExpr) {
  return this.renderNumericComparisonResult_(operandExpr);
};

/**
 * Attempts to negate a comparison expression string by flipping the
 * top-level operator (e.g. {@code <} → {@code >=}).  Only safe when the
 * expression contains exactly one comparison at depth 0 and no other
 * logical/ternary operators there — otherwise flipping a single operator
 * skips the De Morgan swap (e.g. {@code a == 1 | a == 2} → incorrectly
 * {@code a != 1 | a == 2} instead of {@code a != 1 & a != 2}).  Returns
 * {@code null} when unsafe; caller falls back to {@code !}.
 *
 * @private
 * @param {string} expr
 * @return {?string}
 */
Wasm2Lang.Backend.AbstractCodegen.negateComparison_ = function (expr) {
  // Check longest operators first to avoid partial matches (e.g. <= before <).
  var /** @const {!Array<!Array<string>>} */ ops = [
      [' !== ', ' === '],
      [' === ', ' !== '],
      [' <= ', ' > '],
      [' >= ', ' < '],
      [' != ', ' == '],
      [' == ', ' != '],
      [' < ', ' >= '],
      [' > ', ' <= ']
    ];
  var /** @type {number} */ depth = 0;
  var /** @type {number} */ foundIdx = -1;
  var /** @type {number} */ foundOp = -1;
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = expr.length; i < len; ++i) {
    var /** @const {string} */ ch = expr.charAt(i);
    if ('(' === ch) {
      ++depth;
      continue;
    }
    if (')' === ch) {
      --depth;
      continue;
    }
    if (0 !== depth) continue;
    // Depth-0 logical / ternary operators disqualify the expression.
    // Flipping a single inner comparison without a De Morgan swap of the
    // connective produces semantically wrong output.
    if ('|' === ch || '&' === ch || '^' === ch || '?' === ch || ':' === ch) return null;
    for (var /** @type {number} */ j = 0; j < 8; ++j) {
      var /** @const {string} */ opStr = ops[j][0];
      if (i + opStr.length <= len && opStr === expr.substr(i, opStr.length)) {
        if (-1 !== foundIdx) {
          // Two depth-0 comparisons (e.g. chained {@code a == 1 == b})
          // are not safely negated by a single flip.
          return null;
        }
        foundIdx = i;
        foundOp = j;
        break;
      }
    }
  }
  if (-1 === foundIdx) return null;
  var /** @const {string} */ hitStr = ops[foundOp][0];
  return expr.substr(0, foundIdx) + ops[foundOp][1] + expr.substr(foundIdx + hitStr.length);
};

/**
 * Shared rendering for non-i32 numeric binary operations.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @param {number=} opt_catL
 * @param {number=} opt_catR
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericBinaryOp_ = function (binaryen, info, L, R, opt_catL, opt_catR) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {number} */ precedence = P.PREC_ADDITIVE_;

  if (info.isComparison) {
    return P.renderInfix(L, info.opStr, R, P.PREC_RELATIONAL_);
  }

  if ('mul' === info.opName || 'div' === info.opName) {
    precedence = P.PREC_MULTIPLICATIVE_;
  }

  if ('min' === info.opName || 'max' === info.opName || 'copysign' === info.opName) {
    return this.renderHelperCall_(
      binaryen,
      this.getRuntimeHelperPrefix_() + info.opName + '_' + Wasm2Lang.Backend.ValueType.typeName(binaryen, info.retType),
      [L, R],
      info.retType
    );
  }

  return this.renderCoercionByType_(binaryen, P.renderInfix(L, info.opStr, R, precedence), info.retType);
};

/**
 * Shared rendering for non-i32 numeric unary operations and conversions.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.UnaryOpInfo} info
 * @param {string} valueExpr
 * @param {number=} opt_valueCat
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericUnaryOp_ = function (binaryen, info, valueExpr, opt_valueCat) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ opName = info.opName;
  if ('neg' === opName) {
    return this.renderCoercionByType_(binaryen, P.renderPrefix('-', valueExpr), info.retType);
  }
  // The math-builtin set (abs/ceil/floor/trunc/nearest/sqrt) is type-overloaded
  // so the helper name carries the operand type as a suffix.
  var /** @type {string} */ helperName = this.getRuntimeHelperPrefix_() + opName;
  if (-1 !== '|abs|ceil|floor|trunc|nearest|sqrt|'.indexOf('|' + opName + '|')) {
    helperName += '_' + Wasm2Lang.Backend.ValueType.typeName(binaryen, info.operandType);
  }
  return this.renderHelperCall_(binaryen, helperName, [valueExpr], info.retType);
};

/**
 * Builds the coerced argument list for a direct wasm call expression.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} expr
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} functionSignatures
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.buildCoercedCallArgs_ = function (
  binaryen,
  expr,
  childResults,
  functionSignatures
) {
  var /** @const {string} */ callTarget = /** @type {string} */ (expr.target);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_} */ callSig = functionSignatures[callTarget] || {
      sigParams: [],
      sigRetType: /** @type {number} */ (expr.type)
    };
  var /** @const {!Array<number>} */ operands = /** @type {!Array<number>} */ (expr.operands) || [];
  var /** @const {!Array<string>} */ callArgs = [];

  for (var /** @type {number} */ ai = 0, /** @const {number} */ alen = childResults.length; ai !== alen; ++ai) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ argInfo =
        Wasm2Lang.Backend.AbstractCodegen.getChildResultInfo_(childResults, ai);
    var /** @const {number} */ argType =
        ai < callSig.sigParams.length
          ? callSig.sigParams[ai]
          : Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, operands[ai]).type;
    callArgs.push(this.coerceAtBoundary_(binaryen, argInfo.expressionString, argInfo.expressionCategory, argType));
  }

  return callArgs;
};

/**
 * Refuses a SIMD operation this backend cannot express.
 *
 * The default used to return {@code '/* unsupported SIMD … *␘/'} as the
 * expression, which is the same mistake {@code __unknown_i64_binop} was: the
 * comment is spliced into *expression* position, so the emitted module either
 * fails to parse or — worse, where the slot tolerates it — carries on with a
 * missing value.  Either way the operand had a defined meaning in the input
 * and the output silently lost it.  A recognized opcode must never reach the
 * artifact half-implemented, so this stops the build instead.
 *
 * @protected
 * @param {string} kind  {@code 'binary'} or {@code 'unary'}.
 * @param {string} opName
 * @param {string} laneType
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.refuseSIMDOp_ = function (kind, opName, laneType) {
  throw new Error(
    'Wasm2Lang codegen: this backend cannot express the SIMD ' +
      kind +
      ' operation "' +
      opName +
      '" on lane type "' +
      laneType +
      '". The operation is recognized by Wasm2Lang.Backend.SIMDOps, so the input is valid and ' +
      'the gap is in this backend. Emitting a placeholder here would produce a module that has ' +
      'silently lost the operation, so the build stops instead. Implement the op in the ' +
      "backend's simd_ops.js, or select a --language-out that supports it."
  );
};

/**
 * Backend hook for SIMD binary operations.  Returns the rendered expression
 * and category.  Concrete backends override this.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.SIMDOps.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitSIMDBinaryOp_ = function (binaryen, info, L, R) {
  this.refuseSIMDOp_('binary', info.opName, info.laneType);
  return {emittedString: '', resultCat: Wasm2Lang.Backend.AbstractCodegen.CAT_V128};
};

/**
 * Backend hook for SIMD unary operations.  Returns the rendered expression
 * and category.  Concrete backends override this.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.SIMDOps.UnaryOpInfo} info
 * @param {string} operandExpr
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitSIMDUnaryOp_ = function (binaryen, info, operandExpr) {
  this.refuseSIMDOp_('unary', info.opName, info.laneType);
  return {emittedString: '', resultCat: Wasm2Lang.Backend.AbstractCodegen.CAT_V128};
};

/**
 * Classifies a lane-carrying SIMD opcode, refusing rather than returning null.
 *
 * The three lines this replaces — classify, refuse if null, cast the result
 * non-null — appeared five times in each of the two backends that render v128,
 * in two different spellings of the refusal, and every copy carried the same
 * Closure cast.  Ten statements of one idea, and the cast is the reason they
 * could not just be inlined: {@code refuseSIMDOp_} throws, but its signature
 * says {@code void}, so the compiler cannot see that the null branch does not
 * return.  Stating that once here is what makes the callers read as the single
 * expression they are.
 *
 * {@code classify} is one of the {@code SIMDOps.classify*Op} functions; passing
 * it in rather than branching on a name keeps this ignorant of which families
 * exist.
 *
 * @protected
 * @param {function(!Binaryen, number): ?Wasm2Lang.Backend.SIMDOps.LaneOpInfo} classify
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @param {string} kind  The wasm op family, for the refusal message.
 * @return {!Wasm2Lang.Backend.SIMDOps.LaneOpInfo}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.classifyLaneOpOrRefuse_ = function (classify, binaryen, op, kind) {
  var /** @const {?Wasm2Lang.Backend.SIMDOps.LaneOpInfo} */ info = classify(binaryen, op);
  if (!info) this.refuseSIMDOp_(kind, 'op#' + op, '?');
  return /** @type {!Wasm2Lang.Backend.SIMDOps.LaneOpInfo} */ (info);
};

/**
 * The argument every SIMD memory helper takes ahead of the pointer, already
 * terminated by {@code ', '}, or {@code ''} when it takes none.
 *
 * This is the ONLY difference between the two backends' SIMDLoad and
 * SIMDLoadStoreLane emitters: java's helpers are static and receive the
 * {@code ByteBuffer} field explicitly, csharp's are instance methods that reach
 * the buffer through {@code this}.  Everything else — the classification, the
 * helper name, the binding mark, the pointer-with-offset rendering, the
 * statement-vs-expression split on {@code store} — was written twice.
 *
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.simdMemoryHelperReceiver_ = function () {
  return '';
};

/**
 * Emits a {@code v128.load*_splat} / {@code load*x*_s|u} / {@code load*_zero}.
 *
 * None of these is a plain v128 load: each reads FEWER than 16 bytes and then
 * splats, sign/zero-extends or zero-fills, so rendering one as a full-width load
 * silently returns the wrong 16 bytes.  The helper bodies live in each backend's
 * {@code emitSIMDMemoryHelpers_}; an opcode with no helper refuses by name
 * rather than reaching the default arm.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} expr
 * @param {string} ptrExpr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitSIMDLoad_ = function (binaryen, expr, ptrExpr) {
  var /** @const {!Wasm2Lang.Backend.SIMDOps.LaneOpInfo} */ info = this.classifyLaneOpOrRefuse_(
      Wasm2Lang.Backend.SIMDOps.classifyLoadOp,
      binaryen,
      /** @type {number} */ (expr.op),
      'load'
    );
  this.markBinding_('$v128');
  var /** @const {string} */ helper = '$w2l_v128_' + info.kind;
  this.markHelper_(helper);
  return (
    this.n_(helper) +
    '(' +
    this.simdMemoryHelperReceiver_() +
    Wasm2Lang.Backend.AbstractCodegen.renderPtrWithOffset_(ptrExpr, /** @type {number} */ (expr.offset)) +
    ')'
  );
};

/**
 * Emits a {@code v128.load*_lane} / {@code v128.store*_lane}.
 *
 * The lane index counts in the op's OWN lane width — an 8-bit lane op indexes 16
 * lanes, a 64-bit one indexes 2 — so a fixed 32-bit rendering is wrong for three
 * of the four widths, in both the index and the number of bytes moved.
 *
 * {@code isStatement} is true for the store forms, which produce a full
 * statement (indented, terminated) and therefore leave the caller's result
 * category alone; the load forms are expressions of category v128.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} expr
 * @param {string} indent  Leading whitespace for the statement form.
 * @param {string} ptrExpr
 * @param {string} valueExpr
 * @return {{emittedString: string, isStatement: boolean}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitSIMDLoadStoreLane_ = function (binaryen, expr, indent, ptrExpr, valueExpr) {
  var /** @const {!Wasm2Lang.Backend.SIMDOps.LaneOpInfo} */ info = this.classifyLaneOpOrRefuse_(
      Wasm2Lang.Backend.SIMDOps.classifyLoadStoreLaneOp,
      binaryen,
      /** @type {number} */ (expr.op),
      'load/store lane'
    );
  this.markBinding_('$v128');
  var /** @const {string} */ helper = '$w2l_v128_' + info.kind;
  this.markHelper_(helper);
  var /** @const {string} */ args =
      this.simdMemoryHelperReceiver_() +
      Wasm2Lang.Backend.AbstractCodegen.renderPtrWithOffset_(ptrExpr, /** @type {number} */ (expr.offset)) +
      ', ' +
      valueExpr +
      ', ' +
      String(expr.index);
  if (0 === info.kind.indexOf('store')) {
    return {emittedString: indent + this.n_(helper) + '(' + args + ');\n', isStatement: true};
  }
  return {emittedString: this.n_(helper) + '(' + args + ')', isStatement: false};
};

/**
 * Renders the shift count of a lane-typed vector shift.
 *
 * wasm reduces the count modulo the lane bit width; neither the Vector API's
 * lanewise shifts nor {@code Vector128.ShiftLeft} does, so a count at or above
 * the width would produce a value from the wrong lane geometry entirely.  Both
 * backends had the reduction written out, with the same constant-folding
 * shortcut so the common case stays a literal — the only thing that differed
 * was the method name wrapped around the result, which stays where it is.
 *
 * @param {string} laneType
 * @param {string} countExpr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.renderLaneShiftCount_ = function (laneType, countExpr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {number} */ laneBits = Wasm2Lang.Backend.SIMDOps.laneInfo(laneType).laneBits;
  if (Wasm2Lang.Backend.I32Coercion.isConstant(countExpr)) {
    return String(Number(countExpr) & (laneBits - 1));
  }
  return P.renderInfix(countExpr, '&', String(laneBits - 1), P.PREC_BIT_AND_, true);
};

/**
 * Dispatches a classified i32 binary operation to the backend-specific
 * renderer registered in {@code binaryRenderers_}.
 *
 * An unregistered category is a gap in this backend's renderer table, not
 * something a module can legitimately reach — so it stops the build.  See
 * {@code renderI64BinaryOp_} for why the previous placeholder call was worse
 * than a hard failure.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderBinaryOp_ = function (info, L, R) {
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_|undefined} */ fn = this.binaryRenderers_[info.category];
  if (!fn) {
    throw new Error(
      'Wasm2Lang codegen: no i32 binary renderer for category ' +
        String(info.category) +
        ' (op "' +
        String(info.opStr) +
        '"). This is a missing entry in the backend renderer table.'
    );
  }
  return fn(this, info, L, R);
};

/**
 * Prepares an i32 binary operand for use as input to a binary operation.
 * Asm.js overrides to coerce INTISH operands to SIGNED (asm.js binary ops
 * require INT, not INTISH).  Other backends no-op.
 *
 * The optional {@code opInfo} carries the classified binary-op metadata when
 * the operand feeds a binary op; it is {@code null} when called from a unary
 * site.  JavaScript uses it to selectively coerce INTISH operands only when
 * the consuming op (division, signed comparison) cares about wraparound.
 *
 * @protected
 * @param {string} operand
 * @param {number} cat  Expression category of the operand.
 * @param {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo=} opt_opInfo
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.prepareI32BinaryOperand_ = function (operand, cat, opt_opInfo) {
  return operand;
};

/**
 * Dispatches a classified i64 binary operation to the backend-specific
 * renderer registered in {@code i64BinaryRenderers_}.
 *
 * Reaching this with no renderer means the module still carries i64 that the
 * target cannot express.  Only java, csharp and javascript register i64
 * renderers; asm.js and php64 declare {@code needsI64Lowering()} and expect
 * {@code i64-to-i32-lowering} to have erased i64 during normalization, so for
 * them an unregistered category is proof the lowering never ran.
 *
 * That happens through a supported route: the lowering is a NORMALIZE-time
 * binaryen pass chosen from the target backend, and
 * {@code --pre-normalized --normalize-wasm binaryen:none} skips the whole
 * binaryen phase.  A `.wasm` normalized for a native-i64 target (javascript,
 * java, csharp) therefore cannot be emitted as asm.js or php64 — which
 * contradicts "Backend independence" in the normalization rules, and is worth
 * fixing at the pipeline level rather than here.
 *
 * Until then this must FAIL, not paper over it.  The previous fallback emitted
 * {@code __unknown_i64_binop(...)}, a call to a function that is never defined:
 * on the reference module that produced 13 753 of them in output that looked
 * perfectly ordinary and died with {@code ReferenceError} on the first i64
 * operation.  Same reasoning as the {@code w2l_codegen_meta} version check —
 * valid-looking source that has quietly lost its meaning is far harder to
 * diagnose than a hard stop.
 *
 * The throw is in the TRANSPILER and aborts the build; it never reaches the
 * emitted module, so the asm.js subset's ban on `throw` does not apply.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderI64BinaryOp_ = function (info, L, R) {
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_|undefined} */ fn = this.i64BinaryRenderers_[info.category];
  if (!fn) {
    throw new Error(
      'Wasm2Lang codegen: this backend cannot express the i64 operation "' +
        String(info.opStr) +
        '" (category ' +
        String(info.category) +
        '), because the module still contains i64 that i64-to-i32-lowering should have removed. ' +
        'The lowering runs during normalization and is selected from --language-out, and ' +
        '--normalize-wasm binaryen:none skips it. Re-normalize the input for THIS backend, ' +
        'or normalize for asmjs/php64, whose lowered output every backend can consume.'
    );
  }
  return fn(this, info, L, R);
};

/**
 * Returns the expression category for an i32 binary operation result.
 * Asm.js overrides this to return FIXNUM for comparisons and UNSIGNED
 * for unsigned bitwise ops.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.i32BinaryResultCat_ = function (info) {
  return Wasm2Lang.Backend.I32Coercion.OP_COMPARISON === info.category
    ? Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32
    : Wasm2Lang.Backend.I32Coercion.SIGNED;
};

/**
 * Returns the expression category for an i64 binary operation result.
 * Comparisons produce an i32 boolean; everything else produces CAT_I64.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.i64BinaryResultCat_ = function (info) {
  return Wasm2Lang.Backend.I32Coercion.OP_COMPARISON === info.category
    ? Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32
    : Wasm2Lang.Backend.AbstractCodegen.CAT_I64;
};

/**
 * Returns the expression category for a numeric comparison result.
 * Asm.js overrides to FIXNUM; Java/PHP use CAT_BOOL_I32.
 *
 * @protected
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.numericComparisonCat_ = function () {
  return Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32;
};

/**
 * Backend hook for i32 unary operations (eqz, clz, ctz, popcnt).
 * Returns the rendered expression and category, or null if the unary
 * category is not an i32 unary.  Concrete backends override this.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} unaryCategory  Result of {@code I32Coercion.classifyUnaryOp}.
 * @param {string} operandExpr
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitI32Unary_ = function (binaryen, unaryCategory, operandExpr) {
  return null;
};

/**
 * Backend hook for i64 unary operations (eqz, clz, ctz, popcnt, extend*).
 * Returns the rendered expression and category, or null if the backend
 * does not handle i64 natively.  Concrete backends override this.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} unaryCategory  Result of {@code I64Coercion.classifyUnaryOp}.
 * @param {string} operandExpr
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitI64Unary_ = function (binaryen, unaryCategory, operandExpr) {
  return null;
};

/**
 * Width spec consumed by {@link emitManagedIntUnary_}: the data that
 * distinguishes the four java/csharp integer-unary dispatch bodies.  The two
 * backends share the dispatch skeleton verbatim; everything that varies by
 * WIDTH lives in a spec, and the two spellings that vary by BACKEND are the
 * {@code renderUnaryBitOpArg_} / {@code renderUnaryExtendCast_} hooks.
 *
 * @typedef {{
 *   eqzCat: number,
 *   zeroLit: string,
 *   methods: !Object<number, string>,
 *   casts: !Object<number, string>,
 *   bitOpArgType: string,
 *   widenPrefix: string,
 *   resultCat: number
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.ManagedUnarySpec_;

/**
 * Renders the operand of a bit-counting unary method call
 * ({@code clz} / {@code ctz} / {@code popcnt}).  Java's {@code Integer} /
 * {@code Long} statics take the operand as-is (the default); C# overrides to
 * route it through {@code narrowingCast_}, because {@code BitOperations}
 * overloads on the unsigned types.
 *
 * @protected
 * @param {string} operandExpr
 * @param {string} unsignedType  The C# unsigned parameter type
 *     ({@code 'uint'} / {@code 'ulong'}); unused by the default.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderUnaryBitOpArg_ = function (operandExpr, unsignedType) {
  return operandExpr;
};

/**
 * Renders a sign-extend narrowing cast.  Java spells it as a plain prefix
 * cast (the default); C# overrides to {@code narrowingCast_}, which wraps
 * constant operands that would overflow in {@code unchecked(...)}.
 *
 * @protected
 * @param {string} castType
 * @param {string} operandExpr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderUnaryExtendCast_ = function (castType, operandExpr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return '(' + castType + ')' + P.wrap_(operandExpr, P.PREC_UNARY_, true);
};

/**
 * Shared java/csharp integer-unary dispatch: EQZ special case, bit-op
 * method-table lookup, sign-extend cast-table lookup, {@code null} for
 * anything else.  The four per-backend bodies this replaces differed only in
 * the two cast spellings hooked above and the per-width data carried by
 * {@code spec}.
 *
 * @protected
 * @param {number} unaryCategory
 * @param {string} operandExpr
 * @param {!Wasm2Lang.Backend.AbstractCodegen.ManagedUnarySpec_} spec
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitManagedIntUnary_ = function (unaryCategory, operandExpr, spec) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ P = A.Precedence_;
  if (spec.eqzCat === unaryCategory) {
    return {
      emittedString: P.renderInfix(operandExpr, '==', spec.zeroLit, P.PREC_EQUALITY_),
      resultCat: A.CAT_BOOL_I32
    };
  }
  var /** @const {string|undefined} */ method = spec.methods[unaryCategory];
  if (method) {
    return {
      emittedString: spec.widenPrefix + method + '(' + this.renderUnaryBitOpArg_(operandExpr, spec.bitOpArgType) + ')',
      resultCat: spec.resultCat
    };
  }
  var /** @const {string|undefined} */ cast = spec.casts[unaryCategory];
  if (cast) {
    return {emittedString: spec.widenPrefix + this.renderUnaryExtendCast_(cast, operandExpr), resultCat: spec.resultCat};
  }
  return null;
};

/**
 * Shared UnaryId dispatch.  Classifies as i32 unary, numeric unary,
 * or unknown; renders accordingly.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} unaryOp
 * @param {string} operandExpr
 * @param {number} operandCat
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitUnaryId_ = function (binaryen, unaryOp, operandExpr, operandCat) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const {number} */ unCat = C.classifyUnaryOp(binaryen, unaryOp);
  // Eqz on a comparison: negate the operator directly rather than wrapping
  // with `!` or materializing to integer then testing for zero.
  // Produces `$l0 >= $l3` instead of `($l0 < $l3 ? 1 : 0) == 0` (Java/PHP)
  // or `!(($l0|0) < ($l3|0))` (asm.js).
  if (C.UNARY_EQZ === unCat) {
    var /** @const {?string} */ negated = A.negateComparison_(operandExpr);
    if (negated) return {emittedString: negated, resultCat: operandCat};
    if (A.CAT_BOOL_I32 === operandCat) {
      return {emittedString: A.Precedence_.renderPrefix('!', operandExpr), resultCat: A.CAT_BOOL_I32};
    }
  }
  if (A.CAT_BOOL_I32 === operandCat) operandExpr = this.coerceBooleanOperand_(operandExpr);
  if (-1 !== unCat) {
    var /** @const {?{emittedString: string, resultCat: number}} */ i32Result = this.emitI32Unary_(
        binaryen,
        unCat,
        this.prepareI32BinaryOperand_(operandExpr, operandCat)
      );
    if (i32Result) return i32Result;
  }
  var /** @const {number} */ i64Cat = Wasm2Lang.Backend.I64Coercion.classifyUnaryOp(binaryen, unaryOp);
  if (-1 !== i64Cat) {
    var /** @const {?{emittedString: string, resultCat: number}} */ i64Result = this.emitI64Unary_(
        binaryen,
        i64Cat,
        operandExpr
      );
    if (i64Result) return i64Result;
  }
  var /** @const {?Wasm2Lang.Backend.NumericOps.UnaryOpInfo} */ numInfo = Wasm2Lang.Backend.NumericOps.classifyUnaryOp(
      binaryen,
      unaryOp
    );
  if (numInfo) {
    return {
      emittedString: this.renderNumericUnaryOp_(
        binaryen,
        numInfo,
        this.prepareI32BinaryOperand_(operandExpr, operandCat),
        operandCat
      ),
      resultCat: A.catForCoercedType_(binaryen, numInfo.retType)
    };
  }
  var /** @const {?Wasm2Lang.Backend.SIMDOps.UnaryOpInfo} */ simdUnInfo = Wasm2Lang.Backend.SIMDOps.classifyUnaryOp(
      binaryen,
      unaryOp
    );
  if (simdUnInfo) {
    this.markBinding_('$v128');
    return this.emitSIMDUnaryOp_(binaryen, simdUnInfo, operandExpr);
  }
  throw new Error(
    'Wasm2Lang codegen: this backend has no emitter for unary op ' +
      unaryOp +
      '. The previous behaviour emitted the literal 0 with a comment, which is a ' +
      'wrong value that looks like a right one; the build stops instead.'
  );
};

/**
 * Shared bitwise binary renderer (used by asm.js + Java unchanged).
 *
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.renderPlainBitwiseBinary_ = function (self, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const */ bi = P.bitwiseInfo(info.opStr);
  return P.renderInfix(L, info.opStr, R, bi.bitwisePrecedence, bi.bitwiseAllowRightEqual);
};

/**
 * Shared plain additive binary renderer (used by Java i32+i64 unchanged).
 *
 * The {@code +} parent permits an unwrapped right-side additive operand
 * because left-associative reduction gives the same integer result
 * ({@code a + (b op c) === a + b op c} for any integer {@code a}, {@code b},
 * {@code c} and {@code op ∈ +/-}).  The {@code -} parent keeps the wrap so
 * {@code a - (b + c)} doesn't degrade to the wrong {@code a - b + c}.
 *
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.renderPlainArithmeticBinary_ = function (self, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_, '+' === info.opStr);
};

/**
 * Shared plain multiply binary renderer (used by Java i32+i64 unchanged).
 *
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.renderPlainMultiplyBinary_ = function (self, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(L, '*', R, P.PREC_MULTIPLICATIVE_);
};

/**
 * Renders {@code L info.opStr R} via {@link Precedence_.renderInfix}, passing
 * each operand through {@code coerceFn} when {@code info.unsigned} is true.
 * Collapses the "info.unsigned ? coerce(x) : x" pairing that every backend's
 * unsigned-aware division/comparison renderer would otherwise duplicate.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @param {function(string): string} coerceFn
 * @param {number} precedence
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.renderUnsignedAwareInfix_ = function (info, L, R, coerceFn, precedence) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ left = info.unsigned ? coerceFn(L) : L;
  var /** @const {string} */ right = info.unsigned ? coerceFn(R) : R;
  return P.renderInfix(left, info.opStr, right, precedence);
};

/**
 * Specializes {@link renderUnsignedAwareInfix_} for comparison ops.  The
 * precedence is picked from {@code info.opStr}: {@code ==}/{@code !=} land at
 * {@code PREC_EQUALITY_}, every other comparison at {@code PREC_RELATIONAL_}.
 * Collapses the op→precedence ternary that each backend's i32/i64 comparison
 * renderer would otherwise inline.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @param {function(string): string} coerceFn
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.renderComparisonInfix_ = function (info, L, R, coerceFn) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ P = A.Precedence_;
  var /** @const {number} */ precedence = '==' === info.opStr || '!=' === info.opStr ? P.PREC_EQUALITY_ : P.PREC_RELATIONAL_;
  return A.renderUnsignedAwareInfix_(info, L, R, coerceFn, precedence);
};

/**
 * Shared BinaryId dispatch.  Classifies the op as either i32 or numeric,
 * renders it, and returns the result string and category.
 * Asm.js overrides to use different resultCat for i32 binary ops.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} binaryOp
 * @param {string} L
 * @param {string} R
 * @param {number} catL
 * @param {number} catR
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitBinaryId_ = function (binaryen, binaryOp, L, R, catL, catR) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (A.CAT_BOOL_I32 === catL) L = this.coerceBooleanOperand_(L);
  if (A.CAT_BOOL_I32 === catR) R = this.coerceBooleanOperand_(R);
  var /** @const {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} */ binInfo = C.classifyBinaryOp(binaryen, binaryOp);
  if (binInfo) {
    L = this.prepareI32BinaryOperand_(L, catL, binInfo);
    R = this.prepareI32BinaryOperand_(R, catR, binInfo);
    return {emittedString: this.renderBinaryOp_(binInfo, L, R), resultCat: this.i32BinaryResultCat_(binInfo)};
  }
  var /** @const {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} */ i64Info = Wasm2Lang.Backend.I64Coercion.classifyBinaryOp(
      binaryen,
      binaryOp
    );
  if (i64Info) {
    return {emittedString: this.renderI64BinaryOp_(i64Info, L, R), resultCat: this.i64BinaryResultCat_(i64Info)};
  }
  var /** @const {?Wasm2Lang.Backend.NumericOps.BinaryOpInfo} */ numInfo = Wasm2Lang.Backend.NumericOps.classifyBinaryOp(
      binaryen,
      binaryOp
    );
  if (numInfo) {
    return {
      emittedString: this.renderNumericBinaryOp_(binaryen, numInfo, L, R, catL, catR),
      resultCat: numInfo.isComparison ? this.numericComparisonCat_() : A.catForCoercedType_(binaryen, numInfo.retType)
    };
  }
  var /** @const {?Wasm2Lang.Backend.SIMDOps.BinaryOpInfo} */ simdInfo = Wasm2Lang.Backend.SIMDOps.classifyBinaryOp(
      binaryen,
      binaryOp
    );
  if (simdInfo) {
    this.markBinding_('$v128');
    return this.emitSIMDBinaryOp_(binaryen, simdInfo, L, R);
  }
  throw new Error(
    'Wasm2Lang codegen: this backend has no emitter for binary op ' +
      binaryOp +
      '. The previous behaviour emitted the literal 0 with a comment, which is a ' +
      'wrong value that looks like a right one; the build stops instead.'
  );
};

/**
 * Finds the first place a module uses a value type the backend cannot express,
 * and describes it well enough to act on.
 *
 * Shared by every whole-module type refusal, because they all need the same
 * four places and getting one of them wrong is what made the per-renderer
 * refusals leaky: a type enters a module through a VALUE, not only through an
 * opcode, so the scan has to cover global types, function params, results and
 * locals, and the type of every expression - the last through the one shared
 * walker, per CLAUDE.md's traversal rule.
 *
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wasmModule
 * @param {function(number): boolean} isMatch  tests one (possibly tuple) type
 * @return {string}  a human-readable location, or '' when the type is absent
 */
Wasm2Lang.Backend.AbstractCodegen.findValueTypeUse_ = function (binaryen, wasmModule, isMatch) {
  var /** @type {string} */ where = '';
  var matches = /** @param {number} t @return {boolean} */ function (t) {
    if (isMatch(t)) return true;
    // A multi-value result is an expanded tuple type; expandType reports its
    // members, and a single non-tuple type expands to itself.
    var /** @const {!Array<number>} */ parts = binaryen.expandType(t);
    for (var pi = 0; pi !== parts.length; ++pi) {
      if (isMatch(parts[pi])) return true;
    }
    return false;
  };

  var /** @const {number} */ globalCount = wasmModule.getNumGlobals();
  for (var g = 0; !where && g !== globalCount; ++g) {
    var /** @const {!BinaryenGlobalInfo} */ gInfo = binaryen.getGlobalInfo(wasmModule.getGlobalByIndex(g));
    if (matches(gInfo.type)) where = 'global "' + gInfo.name + '"';
  }

  var /** @const {number} */ funcCount = wasmModule.getNumFunctions();
  for (var f = 0; !where && f !== funcCount; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ fInfo = binaryen.getFunctionInfo(wasmModule.getFunctionByIndex(f));
    if (matches(fInfo.params)) where = 'a parameter of function "' + fInfo.name + '"';
    else if (matches(fInfo.results)) where = 'the result of function "' + fInfo.name + '"';
    if (!where) {
      for (var v = 0; v !== fInfo.vars.length; ++v) {
        if (matches(fInfo.vars[v])) {
          where = 'a local of function "' + fInfo.name + '"';
          break;
        }
      }
    }
    if (!where && fInfo.body) {
      var /** @const {string} */ fName = fInfo.name;
      Wasm2Lang.Wasm.Tree.TraversalKernel.forEachExpression(binaryen, wasmModule, fInfo.body, function (nodeCtx) {
        if (where) return 'skip-subtree';
        var /** @const {!BinaryenExpressionInfo} */ info = nodeCtx.expression;
        if (matches(info.type)) {
          where = 'an expression in function "' + fName + '"';
          return 'skip-subtree';
        }
        return undefined;
      });
    }
  }
  return where;
};

/**
 * Refuses an expression kind this backend has no emitter for.
 *
 * One shared throw rather than a copy per backend: the four {@code emitLeave_}
 * switches had byte-identical default arms, which is the shape that drifts -
 * the next backend to gain a case updates its own copy of the message and the
 * others quietly disagree about what the rule is.
 *
 * The rule itself is not negotiable, which is why it is worth centralising.  A
 * placeholder here (the arm used to assign {@code '/* unknown expr id=N *' + '/'})
 * is spliced into expression position and produces a module that PARSES and
 * computes the wrong value.  Measured on asm.js 2026-08-03: an unhandled
 * {@code i8x16.swizzle} left its 16 mask bytes as 16 arguments to a
 * one-parameter function and the artifact still ran.  Same ban as
 * {@code __unknown_i64_binop}: stop instead.
 *
 * @protected
 * @param {number} id
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.refuseExpressionId_ = function (id) {
  throw new Error(
    'Wasm2Lang codegen: this backend has no emitter for expression id ' +
      id +
      '. Emitting a placeholder would produce a module that parses and silently ' +
      'computes the wrong value, so the build stops instead.'
  );
};

/**
 * Whether this backend expresses v128 in the target language at all.
 *
 * Two backends do: java through {@code jdk.incubator.vector} and csharp through
 * {@code System.Runtime.Intrinsics.Vector128}.  For the other three there is no
 * SIMD type to map onto, and wasm2lang deliberately does NOT emulate one - a
 * four-word software carrier is not a transpilation of v128, it is a
 * reimplementation of it, which is the input compiler's job and not this one's.
 *
 * A backend that answers false must never reach a v128 renderer.  The processor
 * rejects the module up front (see {@code rejectUnsupportedTypes_}); this
 * predicate is what it asks.
 *
 * @protected
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.supportsSIMD_ = function () {
  return false;
};

/**
 * Stops the build when a module carries a value type the selected backend
 * cannot express.  Two cases today, and they are the same defect twice.
 *
 * WHY THIS IS A WHOLE-MODULE CHECK, AND WHY IT IS UP FRONT.  Refusing at each
 * renderer is what the code used to do, and it left a hole big enough to ship
 * through, in both dimensions:
 *
 *   v128 - only SIMD *binary* and *unary* ops reached a refusal, so a module
 *   whose SIMD is pure data movement (shuffle, swizzle, extract, replace,
 *   load/store lane, a v128 constant, a v128 global) emitted a complete,
 *   syntactically valid artifact with the operations silently dropped.
 *   Measured on asm.js 2026-08-03: an {@code i8x16.swizzle} module compiled to
 *   a call passing the 16 mask bytes as 16 arguments to a one-parameter
 *   function, plus calls to {@code $w2l_store_i128_a1}, which nothing defines.
 *
 *   i64 on a lowering backend - only {@code renderI64BinaryOp_} refuses, so a
 *   module with i64 values and no i64 *binary* op emitted just as quietly.
 *   Measured the same day, asm.js, {@code binaryen:none}: an
 *   {@code (i64.store (local.get $p) (global.get $g))} became
 *   {@code HEAP8[0] = $g_g;} - the pointer operand gone and an eight-byte
 *   access reduced to one - and an i64 parameter annotation came out as
 *   {@code $l0 = $l0;}, which asm.js does not accept.  That path is reachable
 *   through a flow CLAUDE.md documents as supported: normalize for a
 *   native-i64 target, then emit as asmjs or php64 with {@code --pre-normalized}.
 *
 * Both are the failure class the {@code __unknown_i64_binop} ban exists to
 * prevent, so both stop here rather than at whichever renderer happens to be
 * reached first.
 *
 * The check is deliberately conservative: a module that merely DECLARES the
 * type somewhere unreachable is still refused.  Emitting most of it and hoping
 * the path is dead would put the burden of that judgement on the user at run
 * time, which is the trade this project consistently refuses.
 *
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Backend.AbstractCodegen} codegen
 * @param {string} languageOut
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.rejectUnsupportedTypes_ = function (binaryen, wasmModule, codegen, languageOut) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ V = Wasm2Lang.Backend.ValueType;

  if (!codegen.supportsSIMD_()) {
    var /** @const {string} */ v128Where = A.findValueTypeUse_(binaryen, wasmModule, function (t) {
        return V.isV128(binaryen, t);
      });
    if (v128Where) {
      throw new Error(
        'Wasm2Lang codegen: --language-out ' +
          languageOut +
          ' cannot express v128 - the target language has no SIMD type - but the module uses it (' +
          v128Where +
          '). wasm2lang maps wasm SIMD onto a language primitive where one exists (java: jdk.incubator.vector, ' +
          'csharp: System.Runtime.Intrinsics.Vector128) and refuses otherwise; it does not emulate v128 in ' +
          'software, because a lane-by-lane reimplementation is optimizer work the input compiler already owns. ' +
          'Emit for java or csharp, or rebuild the input without SIMD (clang: drop -msimd128; rustc: drop ' +
          'target-feature=+simd128).'
      );
    }
  }

  if (codegen.needsI64Lowering()) {
    var /** @const {string} */ i64Where = A.findValueTypeUse_(binaryen, wasmModule, function (t) {
        return V.isI64(binaryen, t);
      });
    if (i64Where) {
      throw new Error(
        'Wasm2Lang codegen: this backend cannot express the i64 operation type, because the module still ' +
          'contains i64 (' +
          i64Where +
          ') that i64-to-i32-lowering should have removed. The lowering runs during normalization and is ' +
          'selected from --language-out, so --normalize-wasm binaryen:none skips it and a module normalized ' +
          'for a native-i64 target keeps its i64. Re-normalize the input for THIS backend (--language-out ' +
          languageOut +
          '), or normalize for asmjs/php64, whose lowered output every backend can consume.'
      );
    }
  }
};

/**
 * Trap emitter for helper bodies: each call allocates its own --trap-sites id
 * while the body string is being concatenated, so textual order is allocation
 * order.  Without the flag it renders the historical bare throw.  One
 * definition instead of the closure that used to be repeated verbatim in the
 * java, csharp and php64 helper emitters.
 *
 * @protected
 * @param {string} helperName
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.truncTrapThrow_ = function (helperName) {
  return this.renderHelperTrapThrow_(Wasm2Lang.Backend.TrapKind.TRUNC_F2I_RANGE, helperName);
};

/**
 * Opening text of the NaN test in the shared truncation helper bodies, up to
 * and including the opening parenthesis.  The default is the Java spelling;
 * C# overrides.
 *
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.truncNanCheckOpen_ = function () {
  return 'Double.isNaN(';
};

/**
 * The round-toward-zero expression the shared truncation helper bodies assign
 * back to their parameter.  Java routes through its {@code $w2l_trunc_f64}
 * helper (whose emission the {@code HELPER_DEPS_} entries keep alive); C#
 * overrides to {@code System.Math.Truncate}.
 *
 * @protected
 * @param {string} operandExpr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderTruncF64Ref_ = function (operandExpr) {
  return this.n_('$w2l_trunc_f64') + '(' + operandExpr + ')';
};

/**
 * Positive saturation clamp literal per width suffix ({@code 'i32'} /
 * {@code 'i64'}).  Java spells the i32 clamp as a plain literal and the i64
 * clamp through {@code Long}; C# overrides with {@code int.MaxValue}-style
 * names.
 *
 * @protected
 * @param {string} suffix
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.truncSatMaxLit_ = function (suffix) {
  return 'i32' === suffix ? '2147483647' : 'Long.MAX_VALUE';
};

/**
 * Negative saturation clamp literal per width suffix; see
 * {@link truncSatMaxLit_}.
 *
 * @protected
 * @param {string} suffix
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.truncSatMinLit_ = function (suffix) {
  return 'i32' === suffix ? '-2147483648' : 'Long.MIN_VALUE';
};

/**
 * The statement line(s) returning the unsigned truncation result once the
 * value is known to be inside unsigned range.  Java has no unsigned
 * primitive, so it branches to fold the high half into the sign bit; C#
 * overrides with a single cast through the unsigned type.
 *
 * @protected
 * @param {string} suffix  Width suffix: {@code 'i32'} or {@code 'i64'}.
 * @param {string} pad2
 * @param {string} l0
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderTruncUnsignedTail_ = function (suffix, pad2, l0) {
  if ('i32' === suffix) {
    return (
      pad2 +
      'if (' +
      l0 +
      ' >= 2147483648.0) return (int)(' +
      l0 +
      ' - 2147483648.0) + -2147483648;\n' +
      pad2 +
      'return (int)' +
      l0 +
      ';\n'
    );
  }
  return (
    pad2 +
    'if (' +
    l0 +
    ' >= 9.223372036854776E18) return (long)(' +
    l0 +
    ' - 9.223372036854776E18) + Long.MIN_VALUE;\n' +
    pad2 +
    'return (long)' +
    l0 +
    ';\n'
  );
};

/**
 * Emits one width of the trapping / saturating f64→int truncation helper
 * family for the class-shaped backends — {@code trunc_s}, {@code trunc_u},
 * {@code trunc_sat_s}, {@code trunc_sat_u}, in that order.  Java and C#
 * spell the control shape and every range literal identically; what differs
 * is confined to the spelling hooks above.
 *
 * Each name reaches {@code emitOrCollectHelper_} exactly where the unrolled
 * calls used to — Java keeps its interleaved {@code convert_u} helpers
 * between the i32 and i64 batches — so the collect-pass roster, and with it
 * every encoder slot {@code precomputeMangledNames_} assigns positionally,
 * is unchanged.  The {@code truncTrapThrow_} calls fire in body-text order
 * during concatenation, so {@code --trap-sites} ids are allocated in the
 * same order as before.
 *
 * @protected
 * @param {function(string, string): void} emitHelper  The backend's local
 *     {@code h(name, body)} closure.
 * @param {string} pad1
 * @param {string} pad2
 * @param {string} suffix  Width suffix: {@code 'i32'} or {@code 'i64'}.
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitTruncF64HelperFamily_ = function (emitHelper, pad1, pad2, suffix) {
  var /** @const */ self = this;
  var /** @const {string} */ l0 = this.localN_(0);
  var /** @const {boolean} */ isI32 = 'i32' === suffix;
  var /** @const {string} */ retType = isI32 ? 'int' : 'long';
  var /** @const {string} */ retCast = isI32 ? '(int)' : '(long)';
  var /** @const {string} */ zeroLit = isI32 ? '0' : '0L';
  var /** @const {string} */ minusOneLit = isI32 ? '-1' : '-1L';
  var /** @const {string} */ signedBound = isI32 ? '2147483648.0' : '9.223372036854776E18';
  var /** @const {string} */ signedNegBound = isI32 ? '-2147483648.0' : '-9.223372036854776E18';
  var /** @const {string} */ unsignedBound = isI32 ? '4294967296.0' : '1.8446744073709552E19';
  var /** @const {string} */ satMinGuard = isI32 ? '-2147483649.0' : '-9.223372036854776E18';
  var /** @const {string} */ nanOpen = this.truncNanCheckOpen_();
  var /** @const {string} */ truncLine = pad2 + l0 + ' = ' + this.renderTruncF64Ref_(l0) + ';\n';
  var head = /** @param {string} name @return {string} */ function (name) {
    return pad1 + 'static ' + retType + ' ' + self.n_(name) + '(double ' + l0 + ') {\n';
  };

  var /** @const {string} */ sName = '$w2l_trunc_s_f64_to_' + suffix;
  // prettier-ignore
  emitHelper(sName,
    head(sName) +
    pad2 + 'if (' + nanOpen + l0 + ')) ' + this.truncTrapThrow_(sName) + '\n' +
    truncLine +
    pad2 + 'if (' + l0 + ' >= ' + signedBound + ' || ' + l0 + ' < ' + signedNegBound + ') ' + this.truncTrapThrow_(sName) + '\n' +
    pad2 + 'return ' + retCast + l0 + ';\n' +
    pad1 + '}');

  var /** @const {string} */ uName = '$w2l_trunc_u_f64_to_' + suffix;
  // prettier-ignore
  emitHelper(uName,
    head(uName) +
    pad2 + 'if (' + nanOpen + l0 + ')) ' + this.truncTrapThrow_(uName) + '\n' +
    truncLine +
    pad2 + 'if (' + l0 + ' >= ' + unsignedBound + ' || ' + l0 + ' < 0.0) ' + this.truncTrapThrow_(uName) + '\n' +
    this.renderTruncUnsignedTail_(suffix, pad2, l0) +
    pad1 + '}');

  var /** @const {string} */ ssName = '$w2l_trunc_sat_s_f64_to_' + suffix;
  // prettier-ignore
  emitHelper(ssName,
    head(ssName) +
    pad2 + 'if (' + nanOpen + l0 + ')) return ' + zeroLit + ';\n' +
    truncLine +
    pad2 + 'if (' + l0 + ' >= ' + signedBound + ') return ' + this.truncSatMaxLit_(suffix) + ';\n' +
    pad2 + 'if (' + l0 + ' <= ' + satMinGuard + ') return ' + this.truncSatMinLit_(suffix) + ';\n' +
    pad2 + 'return ' + retCast + l0 + ';\n' +
    pad1 + '}');

  var /** @const {string} */ suName = '$w2l_trunc_sat_u_f64_to_' + suffix;
  // prettier-ignore
  emitHelper(suName,
    head(suName) +
    pad2 + 'if (' + nanOpen + l0 + ')) return ' + zeroLit + ';\n' +
    truncLine +
    pad2 + 'if (' + l0 + ' >= ' + unsignedBound + ') return ' + minusOneLit + ';\n' +
    pad2 + 'if (' + l0 + ' < 0.0) return ' + zeroLit + ';\n' +
    this.renderTruncUnsignedTail_(suffix, pad2, l0) +
    pad1 + '}');
};

/**
 * Emits the f32→f64 cast-and-delegate stubs shared by the class-shaped
 * backends.  Each name's f64 twin is derived by substring replacement, the
 * return type from the name's target suffix, and the {@code (float)}
 * re-narrowing cast applies only to the float-returning {@code $w2l_trunc_f32}
 * — which only Java registers, so for every int/long-returning stub the cast
 * prefix is empty and C#'s names produce the same text they always did.
 *
 * Each backend passes its own name array, in its existing order, from its
 * existing call position: {@code precomputeMangledNames_} assigns encoder
 * slots positionally over the collect-pass order, so the array contents and
 * order are part of the mangler contract.
 *
 * @protected
 * @param {function(string, string): void} emitHelper  The backend's local
 *     {@code h(name, body)} closure.
 * @param {!Array<string>} names
 * @param {string} pad1
 * @param {string} pad2
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitF32DelegateFamily_ = function (emitHelper, names, pad1, pad2) {
  var /** @const {string} */ l0 = this.localN_(0);
  for (var /** @type {number} */ di = 0; di < names.length; ++di) {
    var /** @const {string} */ dName = names[di];
    var /** @const {string} */ dTarget = dName.replace('_f32', '_f64');
    var /** @type {string} */ dRet;
    var /** @type {string} */ dCast;
    if (dName.indexOf('_to_i64') !== -1) {
      dRet = 'long';
      dCast = '';
    } else if (dName.indexOf('_to_i32') !== -1) {
      dRet = 'int';
      dCast = '';
    } else {
      dRet = 'float';
      dCast = '(float)';
    }
    // prettier-ignore
    emitHelper(dName,
      pad1 + 'static ' + dRet + ' ' + this.n_(dName) + '(float ' + l0 + ') {\n' +
      pad2 + 'return ' + dCast + this.n_(dTarget) + '((double)' + l0 + ');\n' +
      pad1 + '}');
  }
};
