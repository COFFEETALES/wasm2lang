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
  void binaryen;
  void wasmType;
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
  void binaryen;
  void wasmType;
  return String(value);
};

/**
 * Decomposes an i64 value (BigInt or {@code {low, high}} pair) into unsigned
 * low and signed high 32-bit halves.  Used by backends that emit i64 literals
 * with language-specific suffixes.
 *
 * @suppress {checkTypes}
 * @protected
 * @param {*} value
 * @return {{w2lI64Lo: number, w2lI64Hi: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.decomposeI64_ = function (value) {
  if ('bigint' === typeof value) {
    return {
      w2lI64Lo: Number(BigInt(value) & BigInt(0xffffffff)) >>> 0,
      w2lI64Hi: Number((BigInt(value) >> BigInt(32)) & BigInt(0xffffffff)) | 0
    };
  }
  var /** @const {!Object} */ v = /** @type {!Object} */ (value);
  return {w2lI64Lo: v['low'] >>> 0, w2lI64Hi: v['high'] | 0};
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
  var /** @const */ parts = Wasm2Lang.Backend.AbstractCodegen.decomposeI64_(value);
  var /** @const {number} */ low = parts.w2lI64Lo;
  var /** @const {number} */ high = parts.w2lI64Hi;
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
  void binaryen;
  var /** @const */ parts = Wasm2Lang.Backend.AbstractCodegen.decomposeI64_(value);
  return Wasm2Lang.Backend.AbstractCodegen.renderI64HexLiteral_(parts.w2lI64Hi, parts.w2lI64Lo, '/*i64*/');
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
  void binaryen;
  void wasmType;
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
  this.markHelper_(helperName);
  var /** @const {string} */ callName = this.n_(helperName);
  return this.renderCoercionByType_(binaryen, callName + '(' + args.join(', ') + ')', resultType);
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
    callArgs[callArgs.length] = this.coerceAtBoundary_(
      binaryen,
      argInfo.expressionString,
      argInfo.expressionCategory,
      paramTypes[ai]
    );
  }

  return callArgs;
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
  var /** @type {string} */ helperName = this.getRuntimeHelperPrefix_() + info.opName;

  if ('neg' === info.opName) {
    return this.renderCoercionByType_(binaryen, P.renderPrefix('-', valueExpr), info.retType);
  }

  if (
    'abs' === info.opName ||
    'ceil' === info.opName ||
    'floor' === info.opName ||
    'trunc' === info.opName ||
    'nearest' === info.opName ||
    'sqrt' === info.opName
  ) {
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
    callArgs[callArgs.length] = this.coerceAtBoundary_(binaryen, argInfo.expressionString, argInfo.expressionCategory, argType);
  }

  return callArgs;
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
  void binaryen;
  void info;
  return {
    emittedString: '/* unsupported SIMD binary: ' + info.opName + '(' + L + ', ' + R + ') */',
    resultCat: Wasm2Lang.Backend.AbstractCodegen.CAT_V128
  };
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
  void binaryen;
  void info;
  return {
    emittedString: '/* unsupported SIMD unary: ' + info.opName + '(' + operandExpr + ') */',
    resultCat: Wasm2Lang.Backend.AbstractCodegen.CAT_V128
  };
};

/**
 * Dispatches a classified i32 binary operation to the backend-specific
 * renderer registered in {@code binaryRenderers_}.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderBinaryOp_ = function (info, L, R) {
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_|undefined} */ fn = this.binaryRenderers_[info.category];
  return fn ? fn(this, info, L, R) : '(__unknown_binop(' + L + ', ' + R + '))';
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
  void cat;
  void opt_opInfo;
  return operand;
};

/**
 * Dispatches a classified i64 binary operation to the backend-specific
 * renderer registered in {@code i64BinaryRenderers_}.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderI64BinaryOp_ = function (info, L, R) {
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_|undefined} */ fn = this.i64BinaryRenderers_[info.category];
  return fn ? fn(this, info, L, R) : '(__unknown_i64_binop(' + L + ', ' + R + '))';
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
  void binaryen;
  void unaryCategory;
  void operandExpr;
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
  void binaryen;
  void unaryCategory;
  void operandExpr;
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
  return {emittedString: '0 /* unknown unop ' + unaryOp + ' */', resultCat: A.CAT_RAW};
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
  void self;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const */ bi = P.bitwiseInfo(info.opStr);
  return P.renderInfix(L, info.opStr, R, bi.bitwisePrecedence, bi.bitwiseAllowRightEqual);
};

/**
 * Shared plain additive binary renderer (used by Java i32+i64 unchanged).
 *
 * @param {!Wasm2Lang.Backend.AbstractCodegen} self
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.renderPlainArithmeticBinary_ = function (self, info, L, R) {
  void self;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_);
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
  void self;
  void info;
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
  return {emittedString: '0 /* unknown binop ' + binaryOp + ' */', resultCat: A.CAT_RAW};
};
