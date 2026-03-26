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
  for (var /** number */ ai = 0, /** @const {number} */ alen = paramTypes.length; ai !== alen; ++ai) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ argInfo = getInfo(childResults, ai + 1);
    callArgs[callArgs.length] = this.coerceToType_(
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
  return '(' + conditionExpr + ' ? 1 : 0)';
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
    return this.renderNumericComparisonResult_(P.renderInfix(L, info.opStr, R, P.PREC_RELATIONAL_));
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

  for (var /** number */ ai = 0, /** @const {number} */ alen = childResults.length; ai !== alen; ++ai) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ argInfo =
        Wasm2Lang.Backend.AbstractCodegen.getChildResultInfo_(childResults, ai);
    var /** @const {number} */ argType =
        ai < callSig.sigParams.length ? callSig.sigParams[ai] : binaryen.getExpressionInfo(operands[ai]).type;
    callArgs[callArgs.length] = this.coerceToType_(binaryen, argInfo.expressionString, argInfo.expressionCategory, argType);
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
