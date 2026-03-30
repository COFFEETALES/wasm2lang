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
 * Backend hook for rendering an i64 constant value.  The value is a
 * binaryen i64 representation (an object with {@code low} and {@code high}
 * 32-bit halves).  Only called for backends that handle i64 natively.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {*} value  The i64 value ({low: number, high: number}).
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderI64Const_ = function (binaryen, value) {
  void binaryen;
  var /** @const {!Object} */ v = /** @type {!Object} */ (value);
  return '0x' + (v['high'] >>> 0).toString(16) + ('00000000' + (v['low'] >>> 0).toString(16)).slice(-8) + '/*i64*/';
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
    if (C.SIGNED === cat || C.FIXNUM === cat) return expr;
    if (A.CAT_BOOL_I32 === cat) return this.renderNumericComparisonResult_(expr);
  } else if (Wasm2Lang.Backend.ValueType.isI64(binaryen, wasmType)) {
    if (A.CAT_I64 === cat) return expr;
  } else if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    if (A.CAT_F32 === cat) return expr;
  } else if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    if (A.CAT_F64 === cat) return expr;
    // Languages where float widens to double automatically (Java, PHP)
    // can skip the explicit f64 cast when the source is already f32.
    if (A.CAT_F32 === cat && this.f32WidensToF64_) return expr;
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
 * @param {!Object<string, *>} expr
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.buildCoercedCallIndirectArgs_ = function (binaryen, expr, childResults) {
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(/** @type {number} */ (expr['params']));
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
 * @param {!Object<string, *>} expr
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
  var /** @const {string} */ callTarget = /** @type {string} */ (expr['target']);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_} */ callSig = functionSignatures[callTarget] || {
      sigParams: [],
      sigRetType: /** @type {number} */ (expr['type'])
    };
  var /** @const {!Array<number>} */ operands = /** @type {!Array<number>} */ (expr['operands']) || [];
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
  if (A.CAT_BOOL_I32 === operandCat) operandExpr = this.renderNumericComparisonResult_(operandExpr);
  var /** @const {number} */ unCat = C.classifyUnaryOp(binaryen, unaryOp);
  if (-1 !== unCat) {
    var /** @const {?{emittedString: string, resultCat: number}} */ i32Result = this.emitI32Unary_(
        binaryen,
        unCat,
        operandExpr
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
      emittedString: this.renderNumericUnaryOp_(binaryen, numInfo, operandExpr, operandCat),
      resultCat: A.catForCoercedType_(binaryen, numInfo.retType)
    };
  }
  return {emittedString: '0 /* unknown unop ' + unaryOp + ' */', resultCat: A.CAT_RAW};
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
  if (A.CAT_BOOL_I32 === catL) L = this.renderNumericComparisonResult_(L);
  if (A.CAT_BOOL_I32 === catR) R = this.renderNumericComparisonResult_(R);
  var /** @const {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} */ binInfo = C.classifyBinaryOp(binaryen, binaryOp);
  if (binInfo) {
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
  return {emittedString: '0 /* unknown binop ' + binaryOp + ' */', resultCat: A.CAT_RAW};
};
