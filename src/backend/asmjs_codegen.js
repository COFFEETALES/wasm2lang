'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.AsmjsCodegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
};

Wasm2Lang.Backend.AsmjsCodegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.AsmjsCodegen.prototype.constructor = Wasm2Lang.Backend.AsmjsCodegen;
Wasm2Lang.Backend.registerBackend('asmjs', Wasm2Lang.Backend.AsmjsCodegen);

/**
 * @private
 * @param {!Int32Array} i32
 * @param {number} startWordIndex
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitStaticI32InitLines_ = function (i32, startWordIndex) {
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.I32InitOp_>} */ ops = this.collectI32InitOps_(i32, startWordIndex);
  var /** @const {!Array<string>} */ lines = [];

  for (var /** number */ i = 0, /** @const {number} */ opsLen = ops.length; i !== opsLen; ++i) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.I32InitOp_} */ op = ops[i];
    var /** @const {string} */ opKind = op.opKind;
    var /** @const {number} */ wordIndex = op.startWordIndex;

    if ('fill' === opKind) {
      var /** @const {number} */ value = op.fillValueI32;
      var /** @const {number} */ count = op.fillCountWords;
      lines[lines.length] =
        'i32_array.fill(' + String(value) + ', ' + String(wordIndex) + ', ' + String(wordIndex + count) + ');';
    } else {
      var /** @const {!Array<number>} */ words = op.setWordsI32;
      var /** @const {!Array<string>} */ wordStrs = [];
      for (var /** number */ j = 0, /** @const {number} */ wLen = words.length; j !== wLen; ++j) {
        wordStrs[wordStrs.length] = String(words[j]);
      }
      lines[lines.length] = 'i32_array.set([' + wordStrs.join(', ') + '], ' + String(wordIndex) + ');';
    }
  }

  return lines;
};

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitMetadata = function (wasmModule, options) {
  var /** @const {string} */ bufferName = /** @type {string} */ (options.emitMetadata);
  var /** @const {number} */ heapSize = this.resolveHeapSize_(options, 'ASMJS_HEAP_SIZE', 65536);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_} */ staticMemory = this.collectStaticMemory_(wasmModule);
  var /** @const {number} */ startWordIndex = staticMemory.startWordIndex;
  var /** @const {!Int32Array} */ i32 = staticMemory.words;
  var /** @const {!Array<string>} */ lines = [];

  lines[lines.length] = 'var ' + bufferName + ' = new ArrayBuffer(' + heapSize + ');';
  lines[lines.length] = 'var i32_array = new Int32Array(' + bufferName + ');';

  if (0 !== i32.length) {
    var /** @const {!Array<string>} */ initLines = this.emitStaticI32InitLines_(i32, startWordIndex);
    for (var /** number */ ii = 0, /** @const {number} */ initLinesCount = initLines.length; ii !== initLinesCount; ++ii) {
      lines[lines.length] = initLines[ii];
    }
  }

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
Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {number} */ len = expr.length;
  if (len >= 2 && '|' === expr.charAt(len - 2) && '0' === expr.charAt(len - 1)) {
    return expr;
  }
  return P.wrap(expr, P.PREC_BIT_OR_, true) + '|0';
};

/**
 * @private
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_ = function (expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.wrap(expr, P.PREC_SHIFT_, true) + '>>>0';
};

/**
 * @private
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
 * @private
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderFloatCoercion_ = function (expr) {
  return 'Math_fround(' + expr + ')';
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
    return Wasm2Lang.Backend.AsmjsCodegen.renderFloatCoercion_(expr);
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderDoubleCoercion_(expr);
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
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderConst_ = function (binaryen, value, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return String(value);
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderFloatCoercion_(Wasm2Lang.Backend.AbstractCodegen.formatFloatLiteral_(value));
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
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.UnaryOpInfo} info
 * @param {string} valueExpr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderNumericUnaryOp_ = function (binaryen, info, valueExpr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ name = info.name;
  var /** @const {boolean} */ isF32 = Wasm2Lang.Backend.ValueType.isF32(binaryen, info.operandType);

  if ('abs' === name || 'ceil' === name || 'floor' === name || 'sqrt' === name) {
    var /** @const {string} */ mathFn = 'Math_' + name;
    if (isF32) {
      return 'Math_fround(' + mathFn + '(' + P.renderPrefix('+', valueExpr) + '))';
    }
    return P.renderPrefix('+', mathFn + '(' + valueExpr + ')');
  }

  if ('convert_s_i32_to_f32' === name) {
    return 'Math_fround(' + Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(valueExpr) + ')';
  }
  if ('convert_u_i32_to_f32' === name) {
    return 'Math_fround(' + P.wrap(valueExpr, P.PREC_SHIFT_, false) + '>>>0)';
  }
  if ('convert_s_i32_to_f64' === name) {
    return '+(' + Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(valueExpr) + ')';
  }
  if ('convert_u_i32_to_f64' === name) {
    return '+(' + P.wrap(valueExpr, P.PREC_SHIFT_, false) + '>>>0)';
  }

  if ('demote_f64_to_f32' === name) {
    return 'Math_fround(' + valueExpr + ')';
  }
  if ('promote_f32_to_f64' === name) {
    return P.renderPrefix('+', valueExpr);
  }

  if ('trunc_s_f32_to_i32' === name) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(
      '~~' + P.wrap(P.renderPrefix('+', valueExpr), P.PREC_UNARY_, true)
    );
  }
  if ('trunc_s_f64_to_i32' === name) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_('~~' + P.wrap(valueExpr, P.PREC_UNARY_, true));
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
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderNumericBinaryOp_ = function (binaryen, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;

  if ('min' === info.name || 'max' === info.name) {
    var /** @const {string} */ fn = 'Math_' + info.name;
    if (Wasm2Lang.Backend.ValueType.isF32(binaryen, info.resultType)) {
      return 'Math_fround(' + fn + '(' + P.renderPrefix('+', L) + ', ' + P.renderPrefix('+', R) + '))';
    }
    return P.renderPrefix('+', fn + '(' + L + ', ' + R + ')');
  }

  return Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericBinaryOp_.call(this, binaryen, info, L, R);
};

/**
 * @override
 * @protected
 * @param {string} conditionExpr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderNumericComparisonResult_ = function (conditionExpr) {
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_('(' + conditionExpr + ')');
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderArithmeticBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(P.renderInfix(L, info.operator, R, P.PREC_ADDITIVE_));
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderMultiplyBinaryOp_ = function (info, L, R) {
  void info;
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_('Math_imul(' + L + ', ' + R + ')');
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderDivisionBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (info.unsigned) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(
      P.renderInfix(
        Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(L),
        info.operator,
        Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(R),
        P.PREC_MULTIPLICATIVE_
      )
    );
  }
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(
    P.renderInfix(
      Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(L),
      info.operator,
      Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(R),
      P.PREC_MULTIPLICATIVE_
    )
  );
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderBitwiseBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {number} */ precedence = P.PREC_BIT_OR_;

  if ('&' === info.operator) {
    precedence = P.PREC_BIT_AND_;
  } else if ('^' === info.operator) {
    precedence = P.PREC_BIT_XOR_;
  }

  return P.renderInfix(L, info.operator, R, precedence, true);
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderRotateBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ shiftMask = P.renderInfix(R, '&', '31', P.PREC_BIT_AND_, true);
  var /** @const {string} */ reverseShift = P.renderInfix('32', '-', shiftMask, P.PREC_ADDITIVE_);

  if (info.rotateLeft) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(
      P.renderInfix(
        P.renderInfix(L, '<<', shiftMask, P.PREC_SHIFT_),
        '|',
        P.renderInfix(Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(L), '>>>', reverseShift, P.PREC_SHIFT_),
        P.PREC_BIT_OR_,
        true
      )
    );
  }
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(
    P.renderInfix(
      P.renderInfix(Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(L), '>>>', shiftMask, P.PREC_SHIFT_),
      '|',
      P.renderInfix(L, '<<', reverseShift, P.PREC_SHIFT_),
      P.PREC_BIT_OR_,
      true
    )
  );
};

/**
 * @private
 * @param {string} expr
 * @param {boolean} isUnsigned
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderComparisonOperand_ = function (expr, isUnsigned) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;

  if (C.isConstant(expr)) {
    return expr;
  }
  if (isUnsigned) {
    return Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(expr);
  }
  return P.wrap(Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(expr), P.PREC_RELATIONAL_, false);
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderComparisonBinaryOp_ = function (info, L, R) {
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(
    '(' +
      this.renderComparisonOperand_(L, info.unsigned) +
      ' ' +
      info.operator +
      ' ' +
      this.renderComparisonOperand_(R, info.unsigned) +
      ')'
  );
};

/**
 * Backend-specific binary-op syntax hooks used by the shared
 * {@code AbstractCodegen.renderBinaryOpByCategory_} dispatcher.
 *
 * @private
 * @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryOpRenderer_}
 */
Wasm2Lang.Backend.AsmjsCodegen.binaryOpRenderer_ = {
  renderArithmetic: Wasm2Lang.Backend.AsmjsCodegen.prototype.renderArithmeticBinaryOp_,
  renderMultiply: Wasm2Lang.Backend.AsmjsCodegen.prototype.renderMultiplyBinaryOp_,
  renderDivision: Wasm2Lang.Backend.AsmjsCodegen.prototype.renderDivisionBinaryOp_,
  renderBitwise: Wasm2Lang.Backend.AsmjsCodegen.prototype.renderBitwiseBinaryOp_,
  renderRotate: Wasm2Lang.Backend.AsmjsCodegen.prototype.renderRotateBinaryOp_,
  renderComparison: Wasm2Lang.Backend.AsmjsCodegen.prototype.renderComparisonBinaryOp_
};

/**
 * Renders an i32 binary operation using the shared category dispatcher plus
 * asm.js-specific syntax hooks.
 *
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L  Left operand code.
 * @param {string} R  Right operand code.
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderBinaryOp_ = function (info, L, R) {
  return this.renderBinaryOpByCategory_(info, L, R, Wasm2Lang.Backend.AsmjsCodegen.binaryOpRenderer_);
};

/**
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return 'Math_fround(0.0)';
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return '0.0';
  }
  return '0';
};

/**
 * Renders a typed memory load expression.
 *
 * Float accesses with declared alignment >= access width use direct
 * HEAPF32/HEAPF64 views.  Sub-naturally-aligned accesses go through
 * byte-copy helpers so wasm's unaligned memory semantics remain correct.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {boolean} isSigned
 * @param {number} align
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderLoad_ = function (binaryen, ptrExpr, wasmType, bytes, isSigned, align) {
  if (Wasm2Lang.Backend.ValueType.isFloat(binaryen, wasmType)) {
    // When the WASM alignment attribute declares alignment >= access width,
    // use the direct typed-array view (HEAPF32/HEAPF64).  When alignment is
    // lower, the runtime address may not be naturally aligned — asm.js
    // typed-array views truncate the index (>> shift), silently reading from
    // a rounded-down offset — so fall back to the byte-copy helper.
    if (align >= bytes) {
      return this.renderCoercionByType_(
        binaryen,
        Wasm2Lang.Backend.AsmjsCodegen.renderHeapAccess_(binaryen, ptrExpr, wasmType, bytes, true),
        wasmType
      );
    }
    return this.renderHelperCall_(
      binaryen,
      '$w2l_load_' + Wasm2Lang.Backend.ValueType.typeName(binaryen, wasmType),
      [ptrExpr],
      wasmType
    );
  }
  return this.renderCoercionByType_(
    binaryen,
    Wasm2Lang.Backend.AsmjsCodegen.renderHeapAccess_(binaryen, ptrExpr, wasmType, bytes, isSigned),
    wasmType
  );
};

/**
 * Renders a typed memory store statement.
 *
 * Float accesses with declared alignment >= access width use direct
 * HEAPF32/HEAPF64 views.  Sub-naturally-aligned accesses go through
 * byte-copy helpers so wasm's unaligned memory semantics remain correct.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {string} valueExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {number} align
 * @param {number=} opt_valueCat  Expression category of the value.
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderStore_ = function (
  binaryen,
  ptrExpr,
  valueExpr,
  wasmType,
  bytes,
  align,
  opt_valueCat
) {
  var /** @const {number} */ valueCat = undefined !== opt_valueCat ? opt_valueCat : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
  var /** @const {string} */ coercedValue = this.coerceToType_(binaryen, valueExpr, valueCat, wasmType);
  if (Wasm2Lang.Backend.ValueType.isFloat(binaryen, wasmType)) {
    // Use direct HEAPF32/HEAPF64 when alignment is declared sufficient.
    // Fall back to byte-copy helpers for sub-natural alignment.
    if (align >= bytes) {
      return (
        Wasm2Lang.Backend.AsmjsCodegen.renderHeapAccess_(binaryen, ptrExpr, wasmType, bytes, true) + ' = ' + coercedValue + ';'
      );
    }
    var /** @const {string} */ storeName = '$w2l_store_' + Wasm2Lang.Backend.ValueType.typeName(binaryen, wasmType);
    this.markHelper_(storeName);
    return storeName + '(' + ptrExpr + ', ' + coercedValue + ');';
  }
  return (
    Wasm2Lang.Backend.AsmjsCodegen.renderHeapAccess_(binaryen, ptrExpr, wasmType, bytes, true) + ' = ' + coercedValue + ';'
  );
};

/**
 * Emits only the helpers that were referenced during function body emission.
 *
 * @private
 * @param {number} scratchByteOffset
 * @param {number} scratchWordIndex
 * @param {number} scratchQwordIndex
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitHelpers_ = function (scratchByteOffset, scratchWordIndex, scratchQwordIndex) {
  var /** @const {!Array<string>} */ lines = [];
  var /** @const {!Object<string, boolean>} */ used = this.usedHelpers_ || {};

  if (used['$w2l_ctz']) {
    lines[lines.length] = '  function $w2l_ctz($x) {';
    lines[lines.length] = '    $x = $x|0;';
    lines[lines.length] = '    var $y = 0;';
    lines[lines.length] = '    if (($x|0) == 0) {';
    lines[lines.length] = '      return 32|0;';
    lines[lines.length] = '    }';
    lines[lines.length] = '    $y = $x & (-$x|0);';
    lines[lines.length] = '    return 32 - Math_clz32($y - 1|0)|0;';
    lines[lines.length] = '  }';
  }

  if (used['$w2l_popcnt']) {
    lines[lines.length] = '  function $w2l_popcnt($x) {';
    lines[lines.length] = '    $x = $x|0;';
    lines[lines.length] = '    var $n = 0;';
    lines[lines.length] = '    while (($x|0) != 0) {';
    lines[lines.length] = '      $x = $x & ($x - 1|0);';
    lines[lines.length] = '      $n = $n + 1|0;';
    lines[lines.length] = '    }';
    lines[lines.length] = '    return $n|0;';
    lines[lines.length] = '  }';
  }

  if (used['$w2l_copysign_f64']) {
    lines[lines.length] = '  function $w2l_copysign_f64($x, $y) {';
    lines[lines.length] = '    $x = +$x;';
    lines[lines.length] = '    $y = +$y;';
    lines[lines.length] = '    $x = +Math_abs($x);';
    lines[lines.length] = '    if ($y < 0.0) {';
    lines[lines.length] = '      return +(-$x);';
    lines[lines.length] = '    }';
    lines[lines.length] = '    if ($y == 0.0) {';
    lines[lines.length] = '      if (1.0 / $y < 0.0) {';
    lines[lines.length] = '        return +(-$x);';
    lines[lines.length] = '      }';
    lines[lines.length] = '    }';
    lines[lines.length] = '    return +$x;';
    lines[lines.length] = '  }';
  }
  if (used['$w2l_copysign_f32']) {
    lines[lines.length] = '  function $w2l_copysign_f32($x, $y) {';
    lines[lines.length] = '    $x = Math_fround($x);';
    lines[lines.length] = '    $y = Math_fround($y);';
    lines[lines.length] = '    $x = Math_fround(Math_abs(+$x));';
    lines[lines.length] = '    if ($y < Math_fround(0.0)) {';
    lines[lines.length] = '      return Math_fround(-$x);';
    lines[lines.length] = '    }';
    lines[lines.length] = '    if ($y == Math_fround(0.0)) {';
    lines[lines.length] = '      if (1.0 / +$y < 0.0) {';
    lines[lines.length] = '        return Math_fround(-$x);';
    lines[lines.length] = '      }';
    lines[lines.length] = '    }';
    lines[lines.length] = '    return Math_fround($x);';
    lines[lines.length] = '  }';
  }

  if (used['$w2l_trunc_f64']) {
    lines[lines.length] = '  function $w2l_trunc_f64($x) {';
    lines[lines.length] = '    $x = +$x;';
    lines[lines.length] = '    return +($x < 0.0 ? Math_ceil($x) : Math_floor($x));';
    lines[lines.length] = '  }';
  }
  if (used['$w2l_trunc_f32']) {
    lines[lines.length] = '  function $w2l_trunc_f32($x) {';
    lines[lines.length] = '    $x = Math_fround($x);';
    lines[lines.length] = '    return Math_fround(+$x < 0.0 ? Math_ceil(+$x) : Math_floor(+$x));';
    lines[lines.length] = '  }';
  }

  if (used['$w2l_nearest_f64']) {
    lines[lines.length] = '  function $w2l_nearest_f64($x) {';
    lines[lines.length] = '    $x = +$x;';
    lines[lines.length] = '    var $floor = 0.0, $diff = 0.0, $i = 0;';
    lines[lines.length] = '    $floor = Math_floor($x);';
    lines[lines.length] = '    $diff = +$x - +$floor;';
    lines[lines.length] = '    if ($diff < 0.5) {';
    lines[lines.length] = '      return +$floor;';
    lines[lines.length] = '    }';
    lines[lines.length] = '    if ($diff > 0.5) {';
    lines[lines.length] = '      return +($floor + 1.0);';
    lines[lines.length] = '    }';
    lines[lines.length] = '    $i = ~~$floor;';
    lines[lines.length] = '    if (($i & 1) == 0) {';
    lines[lines.length] = '      return +$floor;';
    lines[lines.length] = '    }';
    lines[lines.length] = '    return +($floor + 1.0);';
    lines[lines.length] = '  }';
  }
  if (used['$w2l_nearest_f32']) {
    lines[lines.length] = '  function $w2l_nearest_f32($x) {';
    lines[lines.length] = '    $x = Math_fround($x);';
    lines[lines.length] = '    var $floor = 0.0, $diff = 0.0, $i = 0;';
    lines[lines.length] = '    $floor = Math_floor(+$x);';
    lines[lines.length] = '    $diff = +$x - +$floor;';
    lines[lines.length] = '    if ($diff < 0.5) {';
    lines[lines.length] = '      return Math_fround($floor);';
    lines[lines.length] = '    }';
    lines[lines.length] = '    if ($diff > 0.5) {';
    lines[lines.length] = '      return Math_fround($floor + 1.0);';
    lines[lines.length] = '    }';
    lines[lines.length] = '    $i = ~~$floor;';
    lines[lines.length] = '    if (($i & 1) == 0) {';
    lines[lines.length] = '      return Math_fround($floor);';
    lines[lines.length] = '    }';
    lines[lines.length] = '    return Math_fround($floor + 1.0);';
    lines[lines.length] = '  }';
  }

  if (used['$w2l_trunc_u_f32_to_i32']) {
    lines[lines.length] = '  function $w2l_trunc_u_f32_to_i32($x) {';
    lines[lines.length] = '    $x = Math_fround($x);';
    lines[lines.length] = '    if (+$x >= 2147483648.0) {';
    lines[lines.length] = '      return (~~(+$x - 2147483648.0) + -2147483648)|0;';
    lines[lines.length] = '    }';
    lines[lines.length] = '    return ~~+$x|0;';
    lines[lines.length] = '  }';
  }
  if (used['$w2l_trunc_u_f64_to_i32']) {
    lines[lines.length] = '  function $w2l_trunc_u_f64_to_i32($x) {';
    lines[lines.length] = '    $x = +$x;';
    lines[lines.length] = '    if ($x >= 2147483648.0) {';
    lines[lines.length] = '      return (~~($x - 2147483648.0) + -2147483648)|0;';
    lines[lines.length] = '    }';
    lines[lines.length] = '    return ~~$x|0;';
    lines[lines.length] = '  }';
  }
  if (used['$w2l_trunc_sat_s_f32_to_i32']) {
    lines[lines.length] = '  function $w2l_trunc_sat_s_f32_to_i32($x) {';
    lines[lines.length] = '    $x = Math_fround($x);';
    lines[lines.length] = '    if ($x != $x) return 0;';
    lines[lines.length] = '    if (+$x >= 2147483648.0) return 2147483647|0;';
    lines[lines.length] = '    if (+$x <= -2147483649.0) return -2147483648|0;';
    lines[lines.length] = '    return ~~+$x|0;';
    lines[lines.length] = '  }';
  }
  if (used['$w2l_trunc_sat_u_f32_to_i32']) {
    lines[lines.length] = '  function $w2l_trunc_sat_u_f32_to_i32($x) {';
    lines[lines.length] = '    $x = Math_fround($x);';
    lines[lines.length] = '    if ($x != $x) return 0;';
    lines[lines.length] = '    if (+$x >= 4294967296.0) return -1|0;';
    lines[lines.length] = '    if (+$x < 0.0) return 0;';
    lines[lines.length] = '    if (+$x >= 2147483648.0) {';
    lines[lines.length] = '      return (~~(+$x - 2147483648.0) + -2147483648)|0;';
    lines[lines.length] = '    }';
    lines[lines.length] = '    return ~~+$x|0;';
    lines[lines.length] = '  }';
  }
  if (used['$w2l_trunc_sat_s_f64_to_i32']) {
    lines[lines.length] = '  function $w2l_trunc_sat_s_f64_to_i32($x) {';
    lines[lines.length] = '    $x = +$x;';
    lines[lines.length] = '    if ($x != $x) return 0;';
    lines[lines.length] = '    if ($x >= 2147483648.0) return 2147483647|0;';
    lines[lines.length] = '    if ($x <= -2147483649.0) return -2147483648|0;';
    lines[lines.length] = '    return ~~$x|0;';
    lines[lines.length] = '  }';
  }
  if (used['$w2l_trunc_sat_u_f64_to_i32']) {
    lines[lines.length] = '  function $w2l_trunc_sat_u_f64_to_i32($x) {';
    lines[lines.length] = '    $x = +$x;';
    lines[lines.length] = '    if ($x != $x) return 0;';
    lines[lines.length] = '    if ($x >= 4294967296.0) return -1|0;';
    lines[lines.length] = '    if ($x < 0.0) return 0;';
    lines[lines.length] = '    if ($x >= 2147483648.0) {';
    lines[lines.length] = '      return (~~($x - 2147483648.0) + -2147483648)|0;';
    lines[lines.length] = '    }';
    lines[lines.length] = '    return ~~$x|0;';
    lines[lines.length] = '  }';
  }

  if (used['$w2l_store_f32']) {
    lines[lines.length] = '  function $w2l_store_f32($p, $x) {';
    lines[lines.length] = '    $p = $p|0;';
    lines[lines.length] = '    $x = Math_fround($x);';
    lines[lines.length] = '    HEAPF32[' + scratchWordIndex + '] = Math_fround($x);';
    for (var /** number */ f32si = 0; f32si !== 4; ++f32si) {
      lines[lines.length] =
        '    HEAPU8[' +
        (0 === f32si ? '$p >> 0' : '$p + ' + String(f32si) + ' >> 0') +
        '] = HEAPU8[' +
        String(scratchByteOffset + f32si) +
        '];';
    }
    lines[lines.length] = '    HEAP32[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = '  }';
  }
  if (used['$w2l_load_f32']) {
    lines[lines.length] = '  function $w2l_load_f32($p) {';
    lines[lines.length] = '    $p = $p|0;';
    lines[lines.length] = '    var $r = Math_fround(0);';
    for (var /** number */ f32li = 0; f32li !== 4; ++f32li) {
      lines[lines.length] =
        '    HEAPU8[' +
        String(scratchByteOffset + f32li) +
        '] = HEAPU8[' +
        (0 === f32li ? '$p >> 0' : '$p + ' + String(f32li) + ' >> 0') +
        '];';
    }
    lines[lines.length] = '    $r = Math_fround(HEAPF32[' + scratchWordIndex + ']);';
    lines[lines.length] = '    HEAP32[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = '    return Math_fround($r);';
    lines[lines.length] = '  }';
  }

  if (used['$w2l_store_f64']) {
    lines[lines.length] = '  function $w2l_store_f64($p, $x) {';
    lines[lines.length] = '    $p = $p|0;';
    lines[lines.length] = '    $x = +$x;';
    lines[lines.length] = '    HEAPF64[' + scratchQwordIndex + '] = $x;';
    for (var /** number */ f64si = 0; f64si !== 8; ++f64si) {
      lines[lines.length] =
        '    HEAPU8[' +
        (0 === f64si ? '$p >> 0' : '$p + ' + String(f64si) + ' >> 0') +
        '] = HEAPU8[' +
        String(scratchByteOffset + f64si) +
        '];';
    }
    lines[lines.length] = '    HEAP32[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = '    HEAP32[' + String(scratchWordIndex + 1) + '] = 0;';
    lines[lines.length] = '  }';
  }
  if (used['$w2l_load_f64']) {
    lines[lines.length] = '  function $w2l_load_f64($p) {';
    lines[lines.length] = '    $p = $p|0;';
    lines[lines.length] = '    var $r = 0.0;';
    for (var /** number */ f64li = 0; f64li !== 8; ++f64li) {
      lines[lines.length] =
        '    HEAPU8[' +
        String(scratchByteOffset + f64li) +
        '] = HEAPU8[' +
        (0 === f64li ? '$p >> 0' : '$p + ' + String(f64li) + ' >> 0') +
        '];';
    }
    lines[lines.length] = '    $r = +HEAPF64[' + scratchQwordIndex + '];';
    lines[lines.length] = '    HEAP32[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = '    HEAP32[' + String(scratchWordIndex + 1) + '] = 0;';
    lines[lines.length] = '    return +$r;';
    lines[lines.length] = '  }';
  }

  if (used['$w2l_reinterpret_f32_to_i32']) {
    lines[lines.length] = '  function $w2l_reinterpret_f32_to_i32($x) {';
    lines[lines.length] = '    $x = Math_fround($x);';
    lines[lines.length] = '    var $r = 0;';
    lines[lines.length] = '    HEAPF32[' + scratchWordIndex + '] = Math_fround($x);';
    lines[lines.length] = '    $r = HEAP32[' + scratchWordIndex + ']|0;';
    lines[lines.length] = '    HEAP32[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = '    return $r|0;';
    lines[lines.length] = '  }';
  }
  if (used['$w2l_reinterpret_i32_to_f32']) {
    lines[lines.length] = '  function $w2l_reinterpret_i32_to_f32($x) {';
    lines[lines.length] = '    $x = $x|0;';
    lines[lines.length] = '    var $r = Math_fround(0);';
    lines[lines.length] = '    HEAP32[' + scratchWordIndex + '] = $x;';
    lines[lines.length] = '    $r = Math_fround(HEAPF32[' + scratchWordIndex + ']);';
    lines[lines.length] = '    HEAP32[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = '    return Math_fround($r);';
    lines[lines.length] = '  }';
  }

  return lines;
};

// ---------------------------------------------------------------------------
// Code-gen traversal state.
// ---------------------------------------------------------------------------

/**
 * @private
 * @typedef {{
 *   binaryen: !Binaryen,
 *   functionInfo: !BinaryenFunctionInfo,
 *   functionSignatures: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>,
 *   globalTypes: !Object<string, number>,
 *   labelKinds: !Object<string, string>,
 *   importedNames: !Object<string, string>,
 *   indent: number
 * }}
 */
Wasm2Lang.Backend.AsmjsCodegen.EmitState_;

// ---------------------------------------------------------------------------
// Expression emitter (leave callback).
// ---------------------------------------------------------------------------

/**
 * Returns the pointer expression with an optional static byte offset applied.
 * When offset is zero the original expression is returned unchanged.
 *
 * @private
 * @param {string} baseExpr
 * @param {number} offset
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderPtrWithOffset_ = function (baseExpr, offset) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (0 === offset) return baseExpr;
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(P.renderInfix(baseExpr, '+', String(offset), P.PREC_ADDITIVE_));
};

/**
 * Returns the asm.js heap-view indexed expression for a given value type,
 * width, and signedness, e.g. {@code "HEAP32[ptr >> 2]"}.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {number} wasmType
 * @param {number} bytes  Access width (1, 2, or 4).
 * @param {boolean} isSigned
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.renderHeapAccess_ = function (binaryen, ptrExpr, wasmType, bytes, isSigned) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {string} */ shiftAmount = '0';

  if (8 === bytes) {
    shiftAmount = '3';
  } else if (4 === bytes) {
    shiftAmount = '2';
  } else if (2 === bytes) {
    shiftAmount = '1';
  }

  var /** @const {string} */ shiftedPtr = P.renderInfix(ptrExpr, '>>', shiftAmount, P.PREC_SHIFT_);

  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) return 'HEAPF64[' + shiftedPtr + ']';
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) return 'HEAPF32[' + shiftedPtr + ']';
  if (4 === bytes) return 'HEAP32[' + shiftedPtr + ']';
  if (2 === bytes) return (isSigned ? 'HEAP16[' : 'HEAPU16[') + shiftedPtr + ']';
  if (1 === bytes) return (isSigned ? 'HEAP8[' : 'HEAPU8[') + shiftedPtr + ']';
  return 'HEAP8[0]';
};

/**
 * @private
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.formatCondition_ = function (expr) {
  return Wasm2Lang.Backend.AbstractCodegen.Precedence_.formatCondition(expr);
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.AsmjsCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitLeave_ = function (state, nodeCtx, childResults) {
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
    result = '$g_' + /** @type {string} */ (expr['name']);
    resultCat = A.CAT_RAW;
  } else if (binaryen.BinaryId === id) {
    var /** @const {number} */ binaryOp = /** @type {number} */ (expr['op']);
    var /** @const {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} */ binInfo = Wasm2Lang.Backend.I32Coercion.classifyBinaryOp(
        binaryen,
        binaryOp
      );
    if (binInfo) {
      result = this.renderBinaryOp_(binInfo, cr(0), cr(1));
      resultCat = C.OP_BITWISE === binInfo.category && binInfo.unsigned ? C.UNSIGNED : C.SIGNED;
    } else {
      var /** @const {?Wasm2Lang.Backend.NumericOps.BinaryOpInfo} */ numericBinInfo =
          Wasm2Lang.Backend.NumericOps.classifyBinaryOp(binaryen, binaryOp);
      if (numericBinInfo) {
        result = this.renderNumericBinaryOp_(binaryen, numericBinInfo, cr(0), cr(1));
        resultCat = A.catForCoercedType_(binaryen, numericBinInfo.resultType);
      } else {
        result = '__unknown_binop_' + expr['op'] + '(' + cr(0) + ', ' + cr(1) + ')';
        resultCat = A.CAT_RAW;
      }
    }
  } else if (binaryen.UnaryId === id) {
    var /** @const {number} */ unCat = Wasm2Lang.Backend.I32Coercion.classifyUnaryOp(
        binaryen,
        /** @type {number} */ (expr['op'])
      );
    if (C.UNARY_EQZ === unCat) {
      result = Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(
        Wasm2Lang.Backend.AbstractCodegen.Precedence_.renderPrefix('!', cr(0))
      );
      resultCat = C.SIGNED;
    } else if (C.UNARY_CLZ === unCat) {
      result = Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_('Math_clz32(' + cr(0) + ')');
      resultCat = C.SIGNED;
    } else if (C.UNARY_CTZ === unCat) {
      result = this.renderHelperCall_(binaryen, '$w2l_ctz', [cr(0)], binaryen.i32);
      resultCat = C.SIGNED;
    } else if (C.UNARY_POPCNT === unCat) {
      result = this.renderHelperCall_(binaryen, '$w2l_popcnt', [cr(0)], binaryen.i32);
      resultCat = C.SIGNED;
    } else {
      var /** @const {?Wasm2Lang.Backend.NumericOps.UnaryOpInfo} */ numericUnInfo =
          Wasm2Lang.Backend.NumericOps.classifyUnaryOp(binaryen, /** @type {number} */ (expr['op']));
      if (numericUnInfo) {
        result = this.renderNumericUnaryOp_(binaryen, numericUnInfo, cr(0));
        resultCat = A.catForCoercedType_(binaryen, numericUnInfo.resultType);
      } else {
        result = Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_('__unknown_unop_' + expr['op'] + '(' + cr(0) + ')');
        resultCat = C.SIGNED;
      }
    }
  } else if (binaryen.LoadId === id) {
    var /** @const {number} */ loadType = /** @type {number} */ (expr['type']);
    var /** @const {string} */ loadPtr = Wasm2Lang.Backend.AsmjsCodegen.renderPtrWithOffset_(
        cr(0),
        /** @type {number} */ (expr['offset'])
      );
    var /** @const {number} */ loadBytes = /** @type {number} */ (expr['bytes']);
    result = this.renderLoad_(
      binaryen,
      loadPtr,
      loadType,
      loadBytes,
      !!expr['isSigned'],
      /** @type {number} */ (expr['align']) || loadBytes
    );
    resultCat = A.catForCoercedType_(binaryen, loadType);
  } else if (binaryen.StoreId === id) {
    var /** @const {number} */ storeType = /** @type {number} */ (expr['valueType']) || binaryen.i32;
    var /** @const {string} */ storePtr = Wasm2Lang.Backend.AsmjsCodegen.renderPtrWithOffset_(
        cr(0),
        /** @type {number} */ (expr['offset'])
      );
    var /** @const {number} */ storeBytes = /** @type {number} */ (expr['bytes']);
    result =
      pad(ind) +
      this.renderStore_(
        binaryen,
        storePtr,
        cr(1),
        storeType,
        storeBytes,
        /** @type {number} */ (expr['align']) || storeBytes,
        cc(1)
      ) +
      '\n';
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
    result = pad(ind) + '$g_' + globalName + ' = ' + this.coerceToType_(binaryen, cr(0), cc(0), globalType) + ';\n';
  } else if (binaryen.CallId === id) {
    var /** @const {string} */ callTarget = /** @type {string} */ (expr['target']);
    var /** @const {string} */ importBase = state.importedNames[callTarget] || '';
    var /** @type {string} */ callName =
        '' !== importBase ? '$if_' + importBase : Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(callTarget);
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
    result = this.renderCoercionByType_(
      binaryen,
      '(' + Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(cr(0)) + ' ? ' + cr(1) + ' : ' + cr(2) + ')',
      selectType
    );
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
      result = pad(ind) + '$' + blockName + ': {\n' + blockLines.join('') + pad(ind) + '}\n';
    } else {
      result = blockLines.join('');
    }
  } else if (binaryen.LoopId === id) {
    var /** @const {string} */ loopName = /** @type {string} */ (expr['name']);
    result = pad(ind) + '$' + loopName + ': while (1) {\n' + cr(0) + pad(ind + 1) + 'break;\n' + pad(ind) + '}\n';
  } else if (binaryen.IfId === id) {
    var /** @const {number} */ ifFalsePtr = /** @type {number} */ (expr['ifFalse']);
    var /** @type {string} */ condExpr = Wasm2Lang.Backend.AsmjsCodegen.formatCondition_(cr(0));
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
    var /** @const {string} */ brKind = state.labelKinds[brName] || 'block';
    var /** @const {string} */ brStmt = ('loop' === brKind ? 'continue' : 'break') + ' $' + brName + ';\n';
    if (0 !== brCondPtr) {
      result =
        pad(ind) +
        'if ' +
        Wasm2Lang.Backend.AsmjsCodegen.formatCondition_(cr(0)) +
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
 * Enter callback: records label kinds and adjusts indent for scope nodes.
 *
 * @private
 * @param {!Wasm2Lang.Backend.AsmjsCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitEnter_ = function (state, nodeCtx) {
  var /** @const {!Object<string, *>} */ expr = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {number} */ id = /** @type {number} */ (expr['id']);
  var /** @const {!Binaryen} */ binaryen = state.binaryen;

  if (binaryen.BlockId === id) {
    var /** @const {?string} */ bName = /** @type {?string} */ (expr['name']);
    if (bName) {
      state.labelKinds[bName] = 'block';
      state.indent++;
    }
  } else if (binaryen.LoopId === id) {
    state.labelKinds[/** @type {string} */ (expr['name'])] = 'loop';
    state.indent++;
  } else if (binaryen.IfId === id) {
    state.indent++;
  }

  return null;
};

/**
 * Emits a single asm.js function body.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Object<string, string>} importedNames
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} functionSignatures
 * @param {!Object<string, number>} globalTypes
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitFunction_ = function (
  wasmModule,
  binaryen,
  funcInfo,
  importedNames,
  functionSignatures,
  globalTypes
) {
  var /** @const {!Array<string>} */ parts = [];
  var /** @const {string} */ fnName = Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(funcInfo.name);
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(funcInfo.params);
  var /** @const {number} */ numParams = paramTypes.length;
  var /** @const {!Array<number>} */ varTypes = /** @type {!Array<number>} */ (funcInfo.vars) || [];
  var /** @const {number} */ numVars = varTypes.length;

  // Function header (indent 1 = inside module).
  var /** @const {!Array<string>} */ paramNames = [];
  for (var /** number */ pi = 0; pi !== numParams; ++pi) {
    paramNames[paramNames.length] = '$l' + pi;
  }
  parts[parts.length] = '  function ' + fnName + '(' + paramNames.join(', ') + ') {';

  // Parameter annotations.
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
    parts[parts.length] = '    var ' + varDecls.join(', ') + ';';
  }

  // Walk the body with the code-gen visitor.
  if (0 !== funcInfo.body) {
    // indent 2 = inside module + inside function
    var /** @const {!Wasm2Lang.Backend.AsmjsCodegen.EmitState_} */ emitState = {
        binaryen: binaryen,
        functionInfo: funcInfo,
        functionSignatures: functionSignatures,
        globalTypes: globalTypes,
        labelKinds: /** @type {!Object<string, string>} */ (Object.create(null)),
        importedNames: importedNames,
        indent: 2
      };

    var /** @const */ self = this;
    // prettier-ignore
    var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
      /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
        enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc) { return self.emitEnter_(emitState, nc); },
        leave: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} cr @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc, cr) {
          // Decrement indent for scope nodes before emitting their leave.
          var /** @const {!Object<string, *>} */ e = /** @type {!Object<string, *>} */ (nc.expression);
          var /** @const {number} */ eId = /** @type {number} */ (e['id']);
          if (binaryen.LoopId === eId || binaryen.IfId === eId) {
            emitState.indent--;
          } else if (binaryen.BlockId === eId && e['name']) {
            emitState.indent--;
          }
          return self.emitLeave_(emitState, nc, cr || []);
        }
      });
    var /** @type {*} */ bodyResult = this.walkFunctionBody_(wasmModule, binaryen, funcInfo, visitor);
    Wasm2Lang.Backend.AbstractCodegen.appendNonEmptyLines_(parts, bodyResult);
  }

  parts[parts.length] = '  }';
  return parts.join('\n');
};

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitCode = function (wasmModule, options) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {number} */ heapSize = this.resolveHeapSize_(options, 'ASMJS_HEAP_SIZE', 65536);
  var /** @const {number} */ scratchByteOffset = heapSize - 8;
  var /** @const {number} */ scratchWordIndex = scratchByteOffset >>> 2;
  var /** @const {number} */ scratchQwordIndex = scratchByteOffset >>> 3;
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} */ moduleInfo =
      this.collectModuleCodegenInfo_(wasmModule);
  var /** @const {!Array<string>} */ outputParts = [];

  // Module header.
  outputParts[outputParts.length] = 'var ' + moduleName + ' = function asmjsModule(stdlib, foreign, buffer) {';
  outputParts[outputParts.length] = '  "use asm";';

  // Heap views.
  outputParts[outputParts.length] = '  var HEAP8 = new stdlib.Int8Array(buffer);';
  outputParts[outputParts.length] = '  var HEAPU8 = new stdlib.Uint8Array(buffer);';
  outputParts[outputParts.length] = '  var HEAP16 = new stdlib.Int16Array(buffer);';
  outputParts[outputParts.length] = '  var HEAPU16 = new stdlib.Uint16Array(buffer);';
  outputParts[outputParts.length] = '  var HEAP32 = new stdlib.Int32Array(buffer);';
  outputParts[outputParts.length] = '  var HEAPF32 = new stdlib.Float32Array(buffer);';
  outputParts[outputParts.length] = '  var HEAPF64 = new stdlib.Float64Array(buffer);';
  outputParts[outputParts.length] = '  var Math_imul = stdlib.Math.imul;';
  outputParts[outputParts.length] = '  var Math_clz32 = stdlib.Math.clz32;';
  outputParts[outputParts.length] = '  var Math_fround = stdlib.Math.fround;';
  outputParts[outputParts.length] = '  var Math_abs = stdlib.Math.abs;';
  outputParts[outputParts.length] = '  var Math_ceil = stdlib.Math.ceil;';
  outputParts[outputParts.length] = '  var Math_floor = stdlib.Math.floor;';
  outputParts[outputParts.length] = '  var Math_min = stdlib.Math.min;';
  outputParts[outputParts.length] = '  var Math_max = stdlib.Math.max;';
  outputParts[outputParts.length] = '  var Math_sqrt = stdlib.Math.sqrt;';

  // Imported function bindings.
  for (var /** number */ i = 0, /** @const {number} */ importCount = moduleInfo.imports.length; i !== importCount; ++i) {
    outputParts[outputParts.length] =
      '  var $if_' + moduleInfo.imports[i].importBaseName + ' = foreign.' + moduleInfo.imports[i].importBaseName + ';';
  }

  // Module-level globals.
  for (var /** number */ gi = 0, /** @const {number} */ gLen = moduleInfo.globals.length; gi !== gLen; ++gi) {
    outputParts[outputParts.length] =
      '  var $g_' + moduleInfo.globals[gi].globalName + ' = ' + moduleInfo.globals[gi].globalInitValue + ';';
  }

  // Function bodies (emitted first to discover which helpers are needed).
  this.usedHelpers_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  var /** @const {!Array<string>} */ functionParts = [];
  for (var /** number */ f = 0, /** @const {number} */ funcCount = moduleInfo.functions.length; f !== funcCount; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = moduleInfo.functions[f];
    functionParts[functionParts.length] = this.emitFunction_(
      wasmModule,
      binaryen,
      funcInfo,
      moduleInfo.importedNames,
      moduleInfo.functionSignatures,
      moduleInfo.globalTypes
    );
  }

  // Numeric helper bundle (only helpers referenced by function bodies).
  var /** @const {!Array<string>} */ helperLines = this.emitHelpers_(scratchByteOffset, scratchWordIndex, scratchQwordIndex);
  this.usedHelpers_ = null;
  for (var /** number */ hi = 0, /** @const {number} */ helperCount = helperLines.length; hi !== helperCount; ++hi) {
    outputParts[outputParts.length] = helperLines[hi];
  }

  // Append function bodies.
  for (var /** number */ fi = 0, /** @const {number} */ fpLen = functionParts.length; fi !== fpLen; ++fi) {
    outputParts[outputParts.length] = functionParts[fi];
  }

  // Return object.
  var /** @const {!Array<string>} */ returnEntries = [];
  for (var /** number */ r = 0, /** @const {number} */ exportCount = moduleInfo.exports.length; r !== exportCount; ++r) {
    returnEntries[returnEntries.length] =
      moduleInfo.exports[r].exportName +
      ': ' +
      Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(moduleInfo.exports[r].internalName);
  }
  outputParts[outputParts.length] = '  return { ' + returnEntries.join(', ') + ' };';
  outputParts[outputParts.length] = '};';

  // Traversal summary — delegates to AbstractCodegen which walks all
  // non-imported function bodies and appends per-function node counts and a
  // combined seen-ids line.
  outputParts[outputParts.length] = Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode.call(this, wasmModule, options);

  return outputParts.join('\n');
};
