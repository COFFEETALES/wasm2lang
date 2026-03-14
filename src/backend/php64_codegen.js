'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.Php64Codegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
};

Wasm2Lang.Backend.Php64Codegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.Php64Codegen.prototype.constructor = Wasm2Lang.Backend.Php64Codegen;
Wasm2Lang.Backend.registerBackend('php64', Wasm2Lang.Backend.Php64Codegen);

/**
 * Inter-helper dependencies (opcode-specific helpers only).
 * Core helpers (_w2l_i, _w2l_f32) are always emitted and omitted here.
 *
 * @private
 * @const {!Object<string, !Array<string>>}
 */
Wasm2Lang.Backend.Php64Codegen.HELPER_DEPS_ = {
  '_w2l_clz': [],
  '_w2l_ctz': [],
  '_w2l_popcnt': [],
  '_w2l_imul': [],
  '_w2l_copysign_f64': [],
  '_w2l_copysign_f32': ['_w2l_copysign_f64'],
  '_w2l_trunc_f64': [],
  '_w2l_trunc_f32': ['_w2l_trunc_f64'],
  '_w2l_nearest_f64': [],
  '_w2l_nearest_f32': ['_w2l_nearest_f64'],
  '_w2l_trunc_s_f32_to_i32': ['_w2l_trunc_f64'],
  '_w2l_trunc_u_f32_to_i32': ['_w2l_trunc_u_f64_to_i32'],
  '_w2l_trunc_s_f64_to_i32': ['_w2l_trunc_f64'],
  '_w2l_trunc_u_f64_to_i32': ['_w2l_trunc_f64'],
  '_w2l_trunc_sat_s_f32_to_i32': ['_w2l_trunc_sat_s_f64_to_i32'],
  '_w2l_trunc_sat_u_f32_to_i32': ['_w2l_trunc_sat_u_f64_to_i32'],
  '_w2l_trunc_sat_s_f64_to_i32': ['_w2l_trunc_f64'],
  '_w2l_trunc_sat_u_f64_to_i32': ['_w2l_trunc_f64'],
  '_w2l_convert_u_i32_to_f32': [],
  '_w2l_convert_u_i32_to_f64': [],
  '_w2l_reinterpret_f32_to_i32': [],
  '_w2l_reinterpret_i32_to_f32': []
};

/**
 * Records a helper as used and transitively marks its dependencies.
 *
 * @override
 * @protected
 * @param {string} name
 */
Wasm2Lang.Backend.Php64Codegen.prototype.markHelper_ = function (name) {
  if (!this.usedHelpers_ || this.usedHelpers_[name]) {
    return;
  }
  this.usedHelpers_[name] = true;
  var /** @const {!Array<string>|undefined} */ deps = Wasm2Lang.Backend.Php64Codegen.HELPER_DEPS_[name];
  if (deps) {
    for (var /** number */ i = 0, /** @const {number} */ len = deps.length; i !== len; ++i) {
      this.markHelper_(deps[i]);
    }
  }
};

/**
 * Emits the static memory block as a PHP snippet declaring a binary string
 * built in a single concatenation expression.
 *
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitMetadata = function (wasmModule, options) {
  var /** @const {string} */ bufferName = /** @type {string} */ (options.emitMetadata);
  var /** @const {string} */ memVar = '$' + bufferName;
  var /** @const {number} */ heapSize = this.resolveHeapSize_(options, 'PHP64_HEAP_SIZE', 65536);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_} */ staticMemory = this.collectStaticMemory_(wasmModule);
  var /** @const {number} */ startWordIndex = staticMemory.startWordIndex;
  var /** @const {!Int32Array} */ i32 = staticMemory.words;
  var /** @const {!Array<string>} */ lines = [];

  lines[lines.length] = '<?php';

  // Check whether any word in the static data span is non-zero.
  var /** @type {boolean} */ hasNonZero = false;
  for (var /** number */ k = 0, /** @const {number} */ i32Len = i32.length; k !== i32Len; ++k) {
    if (0 !== i32[k]) {
      hasNonZero = true;
      break;
    }
  }

  if (!hasNonZero) {
    // All-zero data — single str_repeat is sufficient.
    lines[lines.length] = memVar + ' = str_repeat("\\x00", ' + heapSize + ');';
    return lines.join('\n');
  }

  // Build a single concatenation expression:
  var /** @const {number} */ startByte = startWordIndex * 4;
  var /** @const {number} */ dataByteLength = i32.length * 4;
  var /** @const {number} */ suffixBytes = heapSize - startByte - dataByteLength;
  var /** @const {!Array<string>} */ concatParts = [];

  if (0 < startByte) {
    concatParts[concatParts.length] = 'str_repeat("\\x00", ' + startByte + ')';
  }

  var /** @const {!Array<string>} */ wordStrs = [];
  for (var /** number */ w = 0, /** @const {number} */ wLen = i32.length; w !== wLen; ++w) {
    wordStrs[wordStrs.length] = String(i32[w]);
  }
  concatParts[concatParts.length] = "pack('V*', " + wordStrs.join(', ') + ')';

  if (0 < suffixBytes) {
    concatParts[concatParts.length] = 'str_repeat("\\x00", ' + suffixBytes + ')';
  }

  lines[lines.length] = memVar + ' = ' + concatParts.join(' . ') + ';';

  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Binary-op rendering (uses shared I32Coercion classification).
// ---------------------------------------------------------------------------

/**
 * @private
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderMask32_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(expr, '&', '0xFFFFFFFF', P.PREC_BIT_AND_, true);
};

/**
 * @private
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderShiftMask_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(expr, '&', '31', P.PREC_BIT_AND_, true);
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderArithmeticBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return '_w2l_i(' + P.renderInfix(L, info.operator, R, P.PREC_ADDITIVE_) + ')';
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderMultiplyBinaryOp_ = function (info, L, R) {
  void info;
  this.markHelper_('_w2l_imul');
  return '_w2l_imul(' + L + ', ' + R + ')';
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderDivisionBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if ('/' === info.operator) {
    if (info.unsigned) {
      return (
        '_w2l_i(intdiv(' +
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(L) +
        ', ' +
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(R) +
        '))'
      );
    }
    return '_w2l_i(intdiv(' + L + ', ' + R + '))';
  }
  // Remainder (%).
  if (info.unsigned) {
    return (
      '_w2l_i(' +
      P.renderInfix(
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(L),
        '%',
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(R),
        P.PREC_MULTIPLICATIVE_
      ) +
      ')'
    );
  }
  return '_w2l_i(' + P.renderInfix(L, '%', R, P.PREC_MULTIPLICATIVE_) + ')';
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderBitwiseBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if ('>>>' === info.operator) {
    // Unsigned right shift (not native in PHP).
    return (
      '_w2l_i(' +
      P.renderInfix(
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(L),
        '>>',
        Wasm2Lang.Backend.Php64Codegen.renderShiftMask_(R),
        P.PREC_SHIFT_
      ) +
      ')'
    );
  }
  if ('<<' === info.operator) {
    return '_w2l_i(' + P.renderInfix(L, '<<', Wasm2Lang.Backend.Php64Codegen.renderShiftMask_(R), P.PREC_SHIFT_) + ')';
  }
  if ('>>' === info.operator) {
    return '_w2l_i(' + P.renderInfix(L, '>>', Wasm2Lang.Backend.Php64Codegen.renderShiftMask_(R), P.PREC_SHIFT_) + ')';
  }
  // &, |, ^
  return P.renderInfix(
    L,
    info.operator,
    R,
    '&' === info.operator ? P.PREC_BIT_AND_ : '^' === info.operator ? P.PREC_BIT_XOR_ : P.PREC_BIT_OR_,
    true
  );
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderRotateBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ shiftMask = Wasm2Lang.Backend.Php64Codegen.renderShiftMask_(R);
  var /** @const {string} */ reverseShift = P.renderInfix('32', '-', shiftMask, P.PREC_ADDITIVE_);

  if (info.rotateLeft) {
    return (
      '_w2l_i(' +
      P.renderInfix(
        P.renderInfix(L, '<<', shiftMask, P.PREC_SHIFT_),
        '|',
        P.renderInfix(Wasm2Lang.Backend.Php64Codegen.renderMask32_(L), '>>', reverseShift, P.PREC_SHIFT_),
        P.PREC_BIT_OR_,
        true
      ) +
      ')'
    );
  }
  return (
    '_w2l_i(' +
    P.renderInfix(
      P.renderInfix(Wasm2Lang.Backend.Php64Codegen.renderMask32_(L), '>>', shiftMask, P.PREC_SHIFT_),
      '|',
      P.renderInfix(L, '<<', reverseShift, P.PREC_SHIFT_),
      P.PREC_BIT_OR_,
      true
    ) +
    ')'
  );
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderComparisonBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {string} */ leftExpr = L;
  var /** @type {string} */ rightExpr = R;

  if (info.unsigned) {
    leftExpr = P.wrap(Wasm2Lang.Backend.Php64Codegen.renderMask32_(L), P.PREC_RELATIONAL_, false);
    rightExpr = P.wrap(Wasm2Lang.Backend.Php64Codegen.renderMask32_(R), P.PREC_RELATIONAL_, false);
  }
  return '(' + P.renderInfix(leftExpr, info.operator, rightExpr, P.PREC_RELATIONAL_) + ' ? 1 : 0)';
};

/**
 * @private
 * @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryOpRenderer_}
 */
Wasm2Lang.Backend.Php64Codegen.binaryOpRenderer_ = {
  renderArithmetic: Wasm2Lang.Backend.Php64Codegen.prototype.renderArithmeticBinaryOp_,
  renderMultiply: Wasm2Lang.Backend.Php64Codegen.prototype.renderMultiplyBinaryOp_,
  renderDivision: Wasm2Lang.Backend.Php64Codegen.prototype.renderDivisionBinaryOp_,
  renderBitwise: Wasm2Lang.Backend.Php64Codegen.prototype.renderBitwiseBinaryOp_,
  renderRotate: Wasm2Lang.Backend.Php64Codegen.prototype.renderRotateBinaryOp_,
  renderComparison: Wasm2Lang.Backend.Php64Codegen.prototype.renderComparisonBinaryOp_
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderBinaryOp_ = function (info, L, R) {
  return this.renderBinaryOpByCategory_(info, L, R, Wasm2Lang.Backend.Php64Codegen.binaryOpRenderer_);
};

// ---------------------------------------------------------------------------
// Code-gen traversal state.
// ---------------------------------------------------------------------------

/**
 * @private
 * @typedef {{
 *   name: string,
 *   kind: string
 * }}
 */
Wasm2Lang.Backend.Php64Codegen.LabelEntry_;

/**
 * @private
 * @typedef {{
 *   binaryen: !Binaryen,
 *   functionInfo: !BinaryenFunctionInfo,
 *   functionSignatures: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>,
 *   globalTypes: !Object<string, number>,
 *   labelStack: !Array<!Wasm2Lang.Backend.Php64Codegen.LabelEntry_>,
 *   importedNames: !Object<string, string>,
 *   indent: number
 * }}
 */
Wasm2Lang.Backend.Php64Codegen.EmitState_;

// ---------------------------------------------------------------------------
// PHP-safe identifiers.
// ---------------------------------------------------------------------------

/**
 * PHP identifiers may only contain {@code [a-zA-Z0-9_\x80-\xff]}.  Binaryen
 * names can contain {@code $}, {@code .} and other characters invalid in PHP.
 * This helper replaces every such character with {@code _} and applies the
 * standard leading-digit guard.
 *
 * @private
 * @param {string} name
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.phpSafeName_ = function (name) {
  return Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(name.replace(/[^a-zA-Z0-9_]/g, '_'));
};

/**
 * Wraps an expression string with {@code _w2l_i()} unless it is a numeric
 * constant that already fits in the i32 range.
 *
 * @private
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.wrapI32_ = function (expr) {
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr)) return expr;
  // Avoid double-wrapping _w2l_i(_w2l_i(...)): if the expression is
  // already a _w2l_i() call, it is already i32-truncated.
  var /** @const {number} */ len = expr.length;
  if (
    len > 7 &&
    '_w2l_i(' === expr.slice(0, 7) &&
    ')' === expr.charAt(len - 1) &&
    Wasm2Lang.Backend.AbstractCodegen.Precedence_.isFullyParenthesized(expr.slice(6))
  ) {
    return expr;
  }
  return '_w2l_i(' + expr + ')';
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
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return Wasm2Lang.Backend.Php64Codegen.wrapI32_(expr);
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return '_w2l_f32(' + expr + ')';
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return '(float)(' + expr + ')';
  }
  return expr;
};

/**
 * @private
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
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.UnaryOpInfo} info
 * @param {string} valueExpr
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderNumericUnaryOp_ = function (binaryen, info, valueExpr) {
  var /** @const {string} */ name = info.name;
  var /** @const {boolean} */ isF32 = Wasm2Lang.Backend.ValueType.isF32(binaryen, info.operandType);

  if ('abs' === name || 'ceil' === name || 'floor' === name || 'sqrt' === name) {
    if (isF32) {
      return '_w2l_f32(' + name + '((float)(' + valueExpr + ')))';
    }
    return name + '((float)(' + valueExpr + '))';
  }

  if ('convert_s_i32_to_f32' === name) {
    return '_w2l_f32(_w2l_i(' + valueExpr + '))';
  }
  if ('convert_s_i32_to_f64' === name) {
    return '(float)_w2l_i(' + valueExpr + ')';
  }

  if ('demote_f64_to_f32' === name) {
    return '_w2l_f32((float)(' + valueExpr + '))';
  }
  if ('promote_f32_to_f64' === name) {
    return '(float)_w2l_f32(' + valueExpr + ')';
  }

  return Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericUnaryOp_.call(this, binaryen, info, valueExpr);
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderNumericBinaryOp_ = function (binaryen, info, L, R) {
  if ('min' === info.name || 'max' === info.name) {
    var /** @const {string} */ fn = info.name;
    if (Wasm2Lang.Backend.ValueType.isF32(binaryen, info.resultType)) {
      return '_w2l_f32(' + fn + '((float)(' + L + '), (float)(' + R + ')))';
    }
    return fn + '((float)(' + L + '), (float)(' + R + '))';
  }

  return Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericBinaryOp_.call(this, binaryen, info, L, R);
};

/**
 * @override
 * @protected
 * @param {string} conditionExpr
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderNumericComparisonResult_ = function (conditionExpr) {
  return '(' + conditionExpr + ' ? 1 : 0)';
};

/**
 * @private
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
 * @private
 * @param {string} baseExpr
 * @param {number} offset
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderPtrWithOffset_ = function (baseExpr, offset) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (0 === offset) return baseExpr;
  return '_w2l_i(' + P.renderInfix(baseExpr, '+', String(offset), P.PREC_ADDITIVE_) + ')';
};

/**
 * @private
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.formatCondition_ = function (expr) {
  return Wasm2Lang.Backend.AbstractCodegen.Precedence_.formatCondition(expr);
};

// ---------------------------------------------------------------------------
// Expression emitter (leave callback).
// ---------------------------------------------------------------------------

/**
 * @private
 * @param {!Wasm2Lang.Backend.Php64Codegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitLeave_ = function (state, nodeCtx, childResults) {
  var /** @const {!Object<string, *>} */ expr = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {number} */ id = /** @type {number} */ (expr['id']);
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {number} */ ind = state.indent;
  var /** @type {string} */ result = '';
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @type {number} */ resultCat = A.CAT_VOID;

  // Helper: get child result string by index in childResults.
  var /** @const {function(number): string} */ cr = function (i) {
      if (i >= childResults.length) return '0';
      var /** @const {*} */ v = childResults[i].childTraversalResult;
      if ('string' === typeof v) return v;
      if (v && 'string' === typeof v['s']) return v['s'];
      return '0';
    };

  // Helper: get child result category by index.
  var /** @const {function(number): number} */ cc = function (i) {
      if (i >= childResults.length) return A.CAT_VOID;
      var /** @const {*} */ v = childResults[i].childTraversalResult;
      return v && 'number' === typeof v['c'] ? /** @type {number} */ (v['c']) : A.CAT_VOID;
    };

  if (binaryen.ConstId === id) {
    var /** @const {number} */ constType = /** @type {number} */ (expr['type']);
    result = this.renderConst_(binaryen, /** @type {number} */ (expr['value']), constType);
    resultCat = Wasm2Lang.Backend.ValueType.isI32(binaryen, constType)
      ? C.FIXNUM
      : Wasm2Lang.Backend.ValueType.isF32(binaryen, constType)
        ? A.CAT_F32
        : A.CAT_RAW;
  } else if (binaryen.LocalGetId === id) {
    result = '$l' + String(/** @type {number} */ (expr['index']));
    resultCat = A.CAT_RAW;
  } else if (binaryen.GlobalGetId === id) {
    result = '$g_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(/** @type {string} */ (expr['name']));
    resultCat = A.CAT_RAW;
  } else if (binaryen.BinaryId === id) {
    var /** @const {number} */ binaryOp = /** @type {number} */ (expr['op']);
    var /** @const {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} */ binInfo = Wasm2Lang.Backend.I32Coercion.classifyBinaryOp(
        binaryen,
        binaryOp
      );
    if (binInfo) {
      result = this.renderBinaryOp_(binInfo, cr(0), cr(1));
      resultCat = C.SIGNED;
    } else {
      var /** @const {?Wasm2Lang.Backend.NumericOps.BinaryOpInfo} */ numericBinInfo =
          Wasm2Lang.Backend.NumericOps.classifyBinaryOp(binaryen, binaryOp);
      if (numericBinInfo) {
        result = this.renderNumericBinaryOp_(binaryen, numericBinInfo, cr(0), cr(1));
        resultCat = A.catForCoercedType_(binaryen, numericBinInfo.resultType);
      } else {
        result = '0 /* unknown binop ' + expr['op'] + ' */';
        resultCat = A.CAT_RAW;
      }
    }
  } else if (binaryen.UnaryId === id) {
    var /** @const {number} */ unCat = Wasm2Lang.Backend.I32Coercion.classifyUnaryOp(
        binaryen,
        /** @type {number} */ (expr['op'])
      );
    if (C.UNARY_EQZ === unCat) {
      var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
      result = '(' + P.renderInfix('0', '===', cr(0), P.PREC_EQUALITY_) + ' ? 1 : 0)';
      resultCat = C.SIGNED;
    } else if (C.UNARY_CLZ === unCat) {
      this.markHelper_('_w2l_clz');
      result = '_w2l_clz(' + cr(0) + ')';
      resultCat = C.SIGNED;
    } else if (C.UNARY_CTZ === unCat) {
      this.markHelper_('_w2l_ctz');
      result = '_w2l_ctz(' + cr(0) + ')';
      resultCat = C.SIGNED;
    } else if (C.UNARY_POPCNT === unCat) {
      this.markHelper_('_w2l_popcnt');
      result = '_w2l_popcnt(' + cr(0) + ')';
      resultCat = C.SIGNED;
    } else {
      var /** @const {?Wasm2Lang.Backend.NumericOps.UnaryOpInfo} */ numericUnInfo =
          Wasm2Lang.Backend.NumericOps.classifyUnaryOp(binaryen, /** @type {number} */ (expr['op']));
      if (numericUnInfo) {
        result = this.renderNumericUnaryOp_(binaryen, numericUnInfo, cr(0));
        resultCat = A.catForCoercedType_(binaryen, numericUnInfo.resultType);
      } else {
        result = '0 /* unknown unop ' + expr['op'] + ' */';
        resultCat = A.CAT_RAW;
      }
    }
  } else if (binaryen.LoadId === id) {
    var /** @const {string} */ loadPtr = Wasm2Lang.Backend.Php64Codegen.renderPtrWithOffset_(
        cr(0),
        /** @type {number} */ (expr['offset'])
      );
    var /** @const {number} */ loadBytes = /** @type {number} */ (expr['bytes']);
    var /** @const {boolean} */ loadSigned = !!expr['isSigned'];
    var /** @const {number} */ loadType = /** @type {number} */ (expr['type']);

    if (Wasm2Lang.Backend.ValueType.isF64(binaryen, loadType)) {
      result = "(float)(unpack('e', $buffer, " + loadPtr + ')[1])';
    } else if (Wasm2Lang.Backend.ValueType.isF32(binaryen, loadType)) {
      result = "_w2l_f32(unpack('g', $buffer, " + loadPtr + ')[1])';
    } else if (4 === loadBytes) {
      result = "_w2l_i(unpack('V', $buffer, " + loadPtr + ')[1])';
    } else if (2 === loadBytes) {
      if (loadSigned) {
        result = "(($__v = unpack('v', $buffer, " + loadPtr + ')[1]) > 32767 ? $__v - 65536 : $__v)';
      } else {
        result = "unpack('v', $buffer, " + loadPtr + ')[1]';
      }
    } else {
      if (loadSigned) {
        result = '(($__v = ord($buffer[' + loadPtr + '])) > 127 ? $__v - 256 : $__v)';
      } else {
        result = 'ord($buffer[' + loadPtr + '])';
      }
    }
    resultCat = A.catForCoercedType_(binaryen, loadType);
  } else if (binaryen.StoreId === id) {
    var /** @const {string} */ storePtr = Wasm2Lang.Backend.Php64Codegen.renderPtrWithOffset_(
        cr(0),
        /** @type {number} */ (expr['offset'])
      );
    var /** @const {number} */ storeBytes = /** @type {number} */ (expr['bytes']);
    var /** @const {number} */ storeType = /** @type {number} */ (expr['valueType']) || binaryen.i32;

    if (Wasm2Lang.Backend.ValueType.isF64(binaryen, storeType)) {
      result =
        pad(ind) +
        '$__p = ' +
        storePtr +
        "; $__s = pack('e', (float)(" +
        cr(1) +
        ')); ' +
        '$buffer[$__p] = $__s[0]; ' +
        '$buffer[$__p + 1] = $__s[1]; ' +
        '$buffer[$__p + 2] = $__s[2]; ' +
        '$buffer[$__p + 3] = $__s[3]; ' +
        '$buffer[$__p + 4] = $__s[4]; ' +
        '$buffer[$__p + 5] = $__s[5]; ' +
        '$buffer[$__p + 6] = $__s[6]; ' +
        '$buffer[$__p + 7] = $__s[7];\n';
    } else if (Wasm2Lang.Backend.ValueType.isF32(binaryen, storeType)) {
      result =
        pad(ind) +
        '$__p = ' +
        storePtr +
        "; $__s = pack('g', _w2l_f32(" +
        cr(1) +
        ')); ' +
        '$buffer[$__p] = $__s[0]; ' +
        '$buffer[$__p + 1] = $__s[1]; ' +
        '$buffer[$__p + 2] = $__s[2]; ' +
        '$buffer[$__p + 3] = $__s[3];\n';
    } else if (4 === storeBytes) {
      result =
        pad(ind) +
        '$__p = ' +
        storePtr +
        "; $__s = pack('V', " +
        this.coerceToType_(binaryen, cr(1), cc(1), binaryen.i32) +
        '); ' +
        '$buffer[$__p] = $__s[0]; ' +
        '$buffer[$__p + 1] = $__s[1]; ' +
        '$buffer[$__p + 2] = $__s[2]; ' +
        '$buffer[$__p + 3] = $__s[3];\n';
    } else if (2 === storeBytes) {
      result =
        pad(ind) +
        '$__p = ' +
        storePtr +
        "; $__s = pack('v', " +
        this.coerceToType_(binaryen, cr(1), cc(1), binaryen.i32) +
        ' & 0xFFFF); ' +
        '$buffer[$__p] = $__s[0]; ' +
        '$buffer[$__p + 1] = $__s[1];\n';
    } else {
      result =
        pad(ind) +
        '$buffer[' +
        storePtr +
        '] = chr(' +
        this.coerceToType_(binaryen, cr(1), cc(1), binaryen.i32) +
        ' & 0xFF);\n';
    }
  } else if (binaryen.LocalSetId === id) {
    var /** @const {boolean} */ isTee = !!expr['isTee'];
    var /** @const {number} */ setIdx = /** @type {number} */ (expr['index']);
    var /** @const {number} */ localType = Wasm2Lang.Backend.ValueType.getLocalType(binaryen, state.functionInfo, setIdx);
    var /** @const {string} */ setValue = this.coerceToType_(binaryen, cr(0), cc(0), localType);
    if (isTee) {
      result = '($l' + setIdx + ' = ' + setValue + ')';
      resultCat = A.catForCoercedType_(binaryen, localType);
    } else {
      result = pad(ind) + '$l' + setIdx + ' = ' + setValue + ';\n';
    }
  } else if (binaryen.GlobalSetId === id) {
    var /** @const {string} */ globalName = /** @type {string} */ (expr['name']);
    var /** @const {number} */ globalType = state.globalTypes[globalName] || binaryen.i32;
    result =
      pad(ind) +
      '$g_' +
      Wasm2Lang.Backend.Php64Codegen.phpSafeName_(globalName) +
      ' = ' +
      this.coerceToType_(binaryen, cr(0), cc(0), globalType) +
      ';\n';
  } else if (binaryen.CallId === id) {
    var /** @const {string} */ callTarget = /** @type {string} */ (expr['target']);
    var /** @const {string} */ importBase = state.importedNames[callTarget] || '';
    var /** @type {string} */ callName =
        '' !== importBase
          ? '$if_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(importBase)
          : '$' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(callTarget);
    var /** @const {!Array<string>} */ callArgs = this.buildCoercedCallArgs_(
        binaryen,
        expr,
        childResults,
        state.functionSignatures
      );
    var /** @const {string} */ callExpr = callName + '(' + callArgs.join(', ') + ')';
    var /** @const {number} */ callType = /** @type {number} */ (expr['type']);
    if (callType === binaryen.none || 0 === callType) {
      result = pad(ind) + callExpr + ';\n';
    } else {
      result = this.renderCoercionByType_(binaryen, callExpr, callType);
      resultCat = A.catForCoercedType_(binaryen, callType);
    }
  } else if (binaryen.ReturnId === id) {
    var /** @const {*} */ retVal = 0 < childResults.length ? childResults[0].childTraversalResult : null;
    if (null != retVal && ('string' === typeof retVal || (retVal && 'undefined' !== typeof retVal['s']))) {
      result = pad(ind) + 'return ' + this.coerceToType_(binaryen, cr(0), cc(0), state.functionInfo.results) + ';\n';
    } else {
      result = pad(ind) + 'return;\n';
    }
  } else if (binaryen.DropId === id) {
    result = pad(ind) + cr(0) + ';\n';
  } else if (binaryen.NopId === id) {
    result = '';
  } else if (binaryen.UnreachableId === id) {
    result = '';
  } else if (binaryen.SelectId === id) {
    var /** @const {number} */ selectType = /** @type {number} */ (expr['type']);
    result = this.renderCoercionByType_(binaryen, '(' + cr(0) + ' ? ' + cr(1) + ' : ' + cr(2) + ')', selectType);
    resultCat = A.catForCoercedType_(binaryen, selectType);
  } else if (binaryen.MemorySizeId === id) {
    result = '0';
    resultCat = C.FIXNUM;
  } else if (binaryen.MemoryGrowId === id) {
    result = pad(ind) + cr(0) + ';\n';
  } else if (binaryen.BlockId === id) {
    var /** @const {?string} */ blockName = /** @type {?string} */ (expr['name']);
    var /** @const {number} */ childInd = blockName ? ind + 1 : ind;
    var /** @const {!Array<string>} */ blockLines = [];
    for (var /** number */ bi = 0, /** @const {number} */ bLen = childResults.length; bi !== bLen; ++bi) {
      var /** @const {string} */ childCode = cr(bi);
      if ('' !== childCode) {
        if (-1 === childCode.indexOf('\n')) {
          blockLines[blockLines.length] = pad(childInd) + childCode + ';\n';
        } else {
          blockLines[blockLines.length] = childCode;
        }
      }
    }
    if (blockName) {
      result = pad(ind) + 'do {\n' + blockLines.join('') + pad(ind) + '} while (false);\n';
    } else {
      result = blockLines.join('');
    }
  } else if (binaryen.LoopId === id) {
    result = pad(ind) + 'while (true) {\n' + cr(0) + pad(ind + 1) + 'break;\n' + pad(ind) + '}\n';
  } else if (binaryen.IfId === id) {
    var /** @const {number} */ ifFalsePtr = /** @type {number} */ (expr['ifFalse']);
    var /** @type {string} */ condExpr = Wasm2Lang.Backend.Php64Codegen.formatCondition_(cr(0));
    var /** @type {string} */ trueCode = cr(1);
    if (0 !== ifFalsePtr && 2 < childResults.length) {
      var /** @type {string} */ falseCode = cr(2);
      result = pad(ind) + 'if ' + condExpr + ' {\n' + trueCode + pad(ind) + '} else {\n' + falseCode + pad(ind) + '}\n';
    } else {
      result = pad(ind) + 'if ' + condExpr + ' {\n' + trueCode + pad(ind) + '}\n';
    }
  } else if (binaryen.BreakId === id) {
    var /** @const {string} */ brName = /** @type {string} */ (expr['name']);
    var /** @const {number} */ brCondPtr = /** @type {number} */ (expr['condition']);
    // Compute depth by scanning label stack from top.
    var /** @type {number} */ depth = 0;
    var /** @type {string} */ brKind = 'block';
    for (var /** number */ si = state.labelStack.length - 1; 0 <= si; --si) {
      depth++;
      if (state.labelStack[si].name === brName) {
        brKind = state.labelStack[si].kind;
        break;
      }
    }

    var /** @const {string} */ brStmt = ('loop' === brKind ? 'continue' : 'break') + ' ' + depth + ';\n';
    if (0 !== brCondPtr) {
      result =
        pad(ind) +
        'if ' +
        Wasm2Lang.Backend.Php64Codegen.formatCondition_(cr(0)) +
        ' {\n' +
        pad(ind + 1) +
        brStmt +
        pad(ind) +
        '}\n';
    } else {
      result = pad(ind) + brStmt;
    }
  } else {
    result = '/* unknown expr id=' + id + ' */';
  }

  if (resultCat !== A.CAT_VOID) {
    return {decisionValue: {'s': result, 'c': resultCat}};
  }
  return {decisionValue: result};
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.Php64Codegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitEnter_ = function (state, nodeCtx) {
  var /** @const {!Object<string, *>} */ expr = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {number} */ id = /** @type {number} */ (expr['id']);
  var /** @const {!Binaryen} */ binaryen = state.binaryen;

  if (binaryen.BlockId === id) {
    var /** @const {?string} */ bName = /** @type {?string} */ (expr['name']);
    if (bName) {
      state.labelStack[state.labelStack.length] = {name: bName, kind: 'block'};
      state.indent++;
    }
  } else if (binaryen.LoopId === id) {
    state.labelStack[state.labelStack.length] = {name: /** @type {string} */ (expr['name']), kind: 'loop'};
    state.indent++;
  } else if (binaryen.IfId === id) {
    state.indent++;
  }

  return null;
};

// ---------------------------------------------------------------------------
// Function emission.
// ---------------------------------------------------------------------------

/**
 * Builds the PHP {@code use} clause entries for a function closure.
 *
 * @private
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>} globals
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} imports
 * @param {!Array<string>} internalFuncNames
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.buildUseClause_ = function (globals, imports, internalFuncNames) {
  var /** @const {!Array<string>} */ entries = [];
  entries[entries.length] = '&$buffer';
  for (var /** number */ gi = 0, /** @const {number} */ gLen = globals.length; gi !== gLen; ++gi) {
    entries[entries.length] = '&$g_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(globals[gi].globalName);
  }
  for (var /** number */ ii = 0, /** @const {number} */ iLen = imports.length; ii !== iLen; ++ii) {
    entries[entries.length] = '&$if_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(imports[ii].importBaseName);
  }
  for (var /** number */ fi = 0, /** @const {number} */ fLen = internalFuncNames.length; fi !== fLen; ++fi) {
    entries[entries.length] = '&$' + internalFuncNames[fi];
  }
  return entries.join(', ');
};

/**
 * Emits a single PHP function body as a closure assignment.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Object<string, string>} importedNames
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>} globals
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} imports
 * @param {!Array<string>} internalFuncNames
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} functionSignatures
 * @param {!Object<string, number>} globalTypes
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitFunction_ = function (
  wasmModule,
  binaryen,
  funcInfo,
  importedNames,
  globals,
  imports,
  internalFuncNames,
  functionSignatures,
  globalTypes
) {
  var /** @const {!Array<string>} */ parts = [];
  var /** @const {string} */ fnName = Wasm2Lang.Backend.Php64Codegen.phpSafeName_(funcInfo.name);
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(funcInfo.params);
  var /** @const {number} */ numParams = paramTypes.length;
  var /** @const {!Array<number>} */ varTypes = /** @type {!Array<number>} */ (funcInfo.vars) || [];
  var /** @const {number} */ numVars = varTypes.length;

  // Build use clause.
  var /** @const {string} */ useClause = this.buildUseClause_(globals, imports, internalFuncNames);

  // Parameter list.
  var /** @const {!Array<string>} */ paramNames = [];
  for (var /** number */ pi = 0; pi !== numParams; ++pi) {
    paramNames[paramNames.length] = '$l' + pi;
  }
  parts[parts.length] = '  $' + fnName + ' = function(' + paramNames.join(', ') + ') use (' + useClause + ') {';

  // Coerce parameters to their wasm types.
  for (var /** number */ pa = 0; pa !== numParams; ++pa) {
    parts[parts.length] = '    $l' + pa + ' = ' + this.renderCoercionByType_(binaryen, '$l' + pa, paramTypes[pa]) + ';';
  }

  // Local variable declarations.
  if (0 !== numVars) {
    var /** @const {!Array<string>} */ varDecls = [];
    for (var /** number */ vi = 0; vi !== numVars; ++vi) {
      var /** @const {number} */ localType = varTypes[vi];
      varDecls[varDecls.length] = '$l' + (numParams + vi) + ' = ' + this.renderLocalInit_(binaryen, localType);
    }
    parts[parts.length] = '    ' + varDecls.join('; ') + ';';
  }

  // Walk the body with the code-gen visitor.
  if (0 !== funcInfo.body) {
    var /** @const {!Wasm2Lang.Backend.Php64Codegen.EmitState_} */ emitState = {
        binaryen: binaryen,
        functionInfo: funcInfo,
        functionSignatures: functionSignatures,
        globalTypes: globalTypes,
        labelStack: [],
        importedNames: importedNames,
        indent: 2
      };

    var /** @const */ self = this;
    // prettier-ignore
    var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
      /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
        enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc) { return self.emitEnter_(emitState, nc); },
        leave: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} cr @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc, cr) {
          var /** @const {!Object<string, *>} */ e = /** @type {!Object<string, *>} */ (nc.expression);
          var /** @const {number} */ eId = /** @type {number} */ (e['id']);
          if (binaryen.LoopId === eId || binaryen.IfId === eId) {
            emitState.indent--;
          } else if (binaryen.BlockId === eId && e['name']) {
            emitState.indent--;
          }
          // Pop label stack for blocks/loops after adjusting indent.
          if (binaryen.LoopId === eId) {
            emitState.labelStack.pop();
          } else if (binaryen.BlockId === eId && e['name']) {
            emitState.labelStack.pop();
          }
          return self.emitLeave_(emitState, nc, cr || []);
        }
      });
    var /** @type {*} */ bodyResult = this.walkFunctionBody_(wasmModule, binaryen, funcInfo, visitor);
    Wasm2Lang.Backend.AbstractCodegen.appendNonEmptyLines_(parts, bodyResult);
  }

  parts[parts.length] = '  };';
  return parts.join('\n');
};

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitCode = function (wasmModule, options) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} */ moduleInfo =
      this.collectModuleCodegenInfo_(wasmModule);
  var /** @const {!Array<string>} */ outputParts = [];

  // Collect internal function names (safe identifiers).
  var /** @const {!Array<string>} */ internalFuncNames = [];
  for (var /** number */ fn = 0, /** @const {number} */ fnCount = moduleInfo.functions.length; fn !== fnCount; ++fn) {
    internalFuncNames[internalFuncNames.length] = Wasm2Lang.Backend.Php64Codegen.phpSafeName_(moduleInfo.functions[fn].name);
  }

  // Emit function bodies first to discover which helpers are needed.
  this.usedHelpers_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  var /** @const {!Array<string>} */ functionParts = [];
  for (var /** number */ f = 0, /** @const {number} */ funcCount = moduleInfo.functions.length; f !== funcCount; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = moduleInfo.functions[f];
    functionParts[functionParts.length] = this.emitFunction_(
      wasmModule,
      binaryen,
      funcInfo,
      moduleInfo.importedNames,
      moduleInfo.globals,
      moduleInfo.imports,
      internalFuncNames,
      moduleInfo.functionSignatures,
      moduleInfo.globalTypes
    );
  }
  var /** @const {!Object<string, boolean>} */ used = this.usedHelpers_;
  this.usedHelpers_ = null;

  // Core coercion helpers (always emitted).
  outputParts[outputParts.length] =
    'function _w2l_i($v): int { $v = (int)$v; $v &= 0xFFFFFFFF; return ($v > 2147483647) ? ($v - 4294967296) : $v; }';
  outputParts[outputParts.length] = "function _w2l_f32($v): float { return unpack('g', pack('g', (float)$v))[1]; }";

  // Opcode-specific helpers (only when referenced).
  if (used['_w2l_clz']) {
    outputParts[outputParts.length] =
      'function _w2l_clz(int $v): int { $v = _w2l_i($v) & 0xFFFFFFFF; if (0 === $v) return 32; $n = 0; while (0 === ($v & 0x80000000)) { ++$n; $v = ($v << 1) & 0xFFFFFFFF; } return $n; }';
  }
  if (used['_w2l_ctz']) {
    outputParts[outputParts.length] =
      'function _w2l_ctz(int $v): int { $v = _w2l_i($v) & 0xFFFFFFFF; if (0 === $v) return 32; $n = 0; while (0 === ($v & 1)) { ++$n; $v >>= 1; } return $n; }';
  }
  if (used['_w2l_popcnt']) {
    outputParts[outputParts.length] =
      'function _w2l_popcnt(int $v): int { $v = _w2l_i($v) & 0xFFFFFFFF; $n = 0; while (0 !== $v) { $n += $v & 1; $v >>= 1; } return $n; }';
  }
  if (used['_w2l_imul']) {
    outputParts[outputParts.length] =
      'function _w2l_imul(int $a, int $b): int { $al = $a & 0xFFFF; $ah = ($a >> 16) & 0xFFFF; return _w2l_i($al * ($b & 0xFFFF) + (($ah * ($b & 0xFFFF) + $al * (($b >> 16) & 0xFFFF)) << 16)); }';
  }
  if (used['_w2l_copysign_f64']) {
    outputParts[outputParts.length] =
      'function _w2l_copysign_f64($x, $y): float { $x = abs((float)$x); return ((float)$y < 0.0) ? -$x : $x; }';
  }
  if (used['_w2l_copysign_f32']) {
    outputParts[outputParts.length] =
      'function _w2l_copysign_f32($x, $y): float { return _w2l_f32(_w2l_copysign_f64($x, $y)); }';
  }
  if (used['_w2l_trunc_f64']) {
    outputParts[outputParts.length] =
      'function _w2l_trunc_f64($x): float { $x = (float)$x; return $x < 0.0 ? ceil($x) : floor($x); }';
  }
  if (used['_w2l_trunc_f32']) {
    outputParts[outputParts.length] = 'function _w2l_trunc_f32($x): float { return _w2l_f32(_w2l_trunc_f64($x)); }';
  }
  if (used['_w2l_nearest_f64']) {
    outputParts[outputParts.length] =
      'function _w2l_nearest_f64($x): float { return round((float)$x, 0, PHP_ROUND_HALF_EVEN); }';
  }
  if (used['_w2l_nearest_f32']) {
    outputParts[outputParts.length] = 'function _w2l_nearest_f32($x): float { return _w2l_f32(_w2l_nearest_f64($x)); }';
  }
  if (used['_w2l_trunc_s_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function _w2l_trunc_s_f32_to_i32($x): int { return _w2l_i((int)_w2l_trunc_f64(_w2l_f32($x))); }';
  }
  if (used['_w2l_trunc_u_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function _w2l_trunc_u_f32_to_i32($x): int { return _w2l_trunc_u_f64_to_i32(_w2l_f32($x)); }';
  }
  if (used['_w2l_trunc_s_f64_to_i32']) {
    outputParts[outputParts.length] =
      'function _w2l_trunc_s_f64_to_i32($x): int { return _w2l_i((int)_w2l_trunc_f64((float)$x)); }';
  }
  if (used['_w2l_trunc_u_f64_to_i32']) {
    outputParts[outputParts.length] =
      'function _w2l_trunc_u_f64_to_i32($x): int { $x = _w2l_trunc_f64((float)$x); return $x >= 2147483648.0 ? _w2l_i((int)($x - 2147483648.0) + -2147483648) : _w2l_i((int)$x); }';
  }
  if (used['_w2l_trunc_sat_s_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function _w2l_trunc_sat_s_f32_to_i32($x): int { return _w2l_trunc_sat_s_f64_to_i32(_w2l_f32($x)); }';
  }
  if (used['_w2l_trunc_sat_u_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function _w2l_trunc_sat_u_f32_to_i32($x): int { return _w2l_trunc_sat_u_f64_to_i32(_w2l_f32($x)); }';
  }
  if (used['_w2l_trunc_sat_s_f64_to_i32']) {
    outputParts[outputParts.length] =
      'function _w2l_trunc_sat_s_f64_to_i32($x): int { $x = _w2l_trunc_f64((float)$x); return is_nan($x) ? 0 : ($x >= 2147483648.0 ? _w2l_i(2147483647) : ($x <= -2147483649.0 ? _w2l_i(-2147483648) : _w2l_i((int)$x))); }';
  }
  if (used['_w2l_trunc_sat_u_f64_to_i32']) {
    outputParts[outputParts.length] =
      'function _w2l_trunc_sat_u_f64_to_i32($x): int { $x = _w2l_trunc_f64((float)$x); if (is_nan($x) || $x < 0.0) return 0; if ($x >= 4294967296.0) return _w2l_i(-1); return $x >= 2147483648.0 ? _w2l_i((int)($x - 2147483648.0) + -2147483648) : _w2l_i((int)$x); }';
  }
  if (used['_w2l_convert_u_i32_to_f32']) {
    outputParts[outputParts.length] =
      'function _w2l_convert_u_i32_to_f32($x): float { $x = _w2l_i($x); return _w2l_f32($x < 0 ? $x + 4294967296.0 : $x); }';
  }
  if (used['_w2l_convert_u_i32_to_f64']) {
    outputParts[outputParts.length] =
      'function _w2l_convert_u_i32_to_f64($x): float { $x = _w2l_i($x); return $x < 0 ? $x + 4294967296.0 : (float)$x; }';
  }
  if (used['_w2l_reinterpret_f32_to_i32']) {
    outputParts[outputParts.length] =
      "function _w2l_reinterpret_f32_to_i32($x): int { return _w2l_i(unpack('V', pack('g', _w2l_f32($x)))[1]); }";
  }
  if (used['_w2l_reinterpret_i32_to_f32']) {
    outputParts[outputParts.length] =
      "function _w2l_reinterpret_i32_to_f32($x): float { return _w2l_f32(unpack('g', pack('V', _w2l_i($x)))[1]); }";
  }

  // Module header.
  outputParts[outputParts.length] = '$' + moduleName + ' = function(array $foreign, string &$buffer): array {';

  // Imported function bindings.
  for (var /** number */ i = 0, /** @const {number} */ importCount = moduleInfo.imports.length; i !== importCount; ++i) {
    outputParts[outputParts.length] =
      '  $if_' +
      Wasm2Lang.Backend.Php64Codegen.phpSafeName_(moduleInfo.imports[i].importBaseName) +
      " = $foreign['" +
      moduleInfo.imports[i].importBaseName +
      "'] ?? null;";
  }

  // Module-level globals.
  for (var /** number */ gi = 0, /** @const {number} */ gLen = moduleInfo.globals.length; gi !== gLen; ++gi) {
    outputParts[outputParts.length] =
      '  $g_' +
      Wasm2Lang.Backend.Php64Codegen.phpSafeName_(moduleInfo.globals[gi].globalName) +
      ' = ' +
      moduleInfo.globals[gi].globalInitValue +
      ';';
  }

  // Forward declarations for internal functions.
  for (var /** number */ fi = 0, /** @const {number} */ fNameLen = internalFuncNames.length; fi !== fNameLen; ++fi) {
    outputParts[outputParts.length] = '  $' + internalFuncNames[fi] + ' = null;';
  }

  // Append function bodies.
  for (var /** number */ fp = 0, /** @const {number} */ fpLen = functionParts.length; fp !== fpLen; ++fp) {
    outputParts[outputParts.length] = functionParts[fp];
  }

  // Return array.
  var /** @const {!Array<string>} */ returnEntries = [];
  for (var /** number */ r = 0, /** @const {number} */ exportCount = moduleInfo.exports.length; r !== exportCount; ++r) {
    returnEntries[returnEntries.length] =
      "'" +
      moduleInfo.exports[r].exportName +
      "' => $" +
      Wasm2Lang.Backend.Php64Codegen.phpSafeName_(moduleInfo.exports[r].internalName);
  }
  outputParts[outputParts.length] = '  return [' + returnEntries.join(', ') + '];';
  outputParts[outputParts.length] = '};';

  // Traversal summary.
  outputParts[outputParts.length] = Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode.call(this, wasmModule, options);

  return outputParts.join('\n');
};
