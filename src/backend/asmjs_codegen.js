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

// ---------------------------------------------------------------------------
// Reserved words and mangler profile.
// ---------------------------------------------------------------------------

/** @const {!Object<string, boolean>} */
Wasm2Lang.Backend.AsmjsCodegen.RESERVED_ = Wasm2Lang.Backend.buildReservedSet([
  'abstract',
  'arguments',
  'await',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'double',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'function',
  'goto',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'int',
  'interface',
  'let',
  'long',
  'native',
  'new',
  'null',
  'of',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'typeof',
  'undefined',
  'var',
  'void',
  'volatile',
  'while',
  'with',
  'yield',
  'NaN',
  'Infinity'
]);

Wasm2Lang.Backend.registerManglerProfile('asmjs', {
  reservedWords: Wasm2Lang.Backend.AsmjsCodegen.RESERVED_,
  singleCharset: '$ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz',
  blockCharset: '$ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz0123456789',
  caseInsensitive: false
});

// ---------------------------------------------------------------------------
// Mangler integration.
// ---------------------------------------------------------------------------

/**
 * @override
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.getFixedModuleBindings_ = function (options) {
  var /** @const {!Array<string>} */ bindings = [
      'asmjsModule',
      'buffer',
      'foreign',
      'stdlib',
      'HEAP8',
      'HEAP16',
      'HEAP32',
      'HEAPF32',
      'HEAPF64',
      'HEAPU8',
      'HEAPU16',
      'Math_abs',
      'Math_ceil',
      'Math_clz32',
      'Math_floor',
      'Math_fround',
      'Math_imul',
      'Math_max',
      'Math_min',
      'Math_sqrt'
    ];
  if ('string' === typeof options.emitMetadata) {
    bindings[bindings.length] = 'i32_array';
  }
  return bindings;
};

/**
 * @override
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.getAllHelperNames_ = function () {
  return [
    '$w2l_copysign_f32',
    '$w2l_copysign_f64',
    '$w2l_ctz',
    '$w2l_load_f32',
    '$w2l_load_f64',
    '$w2l_nearest_f32',
    '$w2l_nearest_f64',
    '$w2l_popcnt',
    '$w2l_reinterpret_f32_to_i32',
    '$w2l_reinterpret_i32_to_f32',
    '$w2l_store_f32',
    '$w2l_store_f64',
    '$w2l_trunc_f32',
    '$w2l_trunc_f64',
    '$w2l_trunc_sat_s_f32_to_i32',
    '$w2l_trunc_sat_s_f64_to_i32',
    '$w2l_trunc_sat_u_f32_to_i32',
    '$w2l_trunc_sat_u_f64_to_i32',
    '$w2l_trunc_u_f32_to_i32',
    '$w2l_trunc_u_f64_to_i32'
  ];
};

/**
 * @private
 * @param {!Int32Array} i32
 * @param {number} startWordIndex
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitStaticI32InitLines_ = function (i32, startWordIndex) {
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.I32InitOp_>} */ ops = this.collectI32InitOps_(i32, startWordIndex);
  var /** @const {!Array<string>} */ lines = [];
  var /** @const {string} */ i32Name = this.n_('i32_array');

  for (var /** number */ i = 0, /** @const {number} */ opsLen = ops.length; i !== opsLen; ++i) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.I32InitOp_} */ op = ops[i];
    var /** @const {string} */ opKind = op.opKind;
    var /** @const {number} */ wordIndex = op.startWordIndex;

    if ('fill' === opKind) {
      var /** @const {number} */ value = op.fillValueI32;
      var /** @const {number} */ count = op.fillCountWords;
      lines[lines.length] =
        i32Name + '.fill(' + String(value) + ', ' + String(wordIndex) + ', ' + String(wordIndex + count) + ');';
    } else {
      var /** @const {!Array<number>} */ words = op.setWordsI32;
      var /** @const {!Array<string>} */ wordStrs = [];
      for (var /** number */ j = 0, /** @const {number} */ wLen = words.length; j !== wLen; ++j) {
        wordStrs[wordStrs.length] = String(words[j]);
      }
      lines[lines.length] = i32Name + '.set([' + wordStrs.join(', ') + '], ' + String(wordIndex) + ');';
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

  var /** @const {string} */ i32ArrayName = this.n_('i32_array');
  lines[lines.length] = 'var ' + bufferName + ' = new ArrayBuffer(' + heapSize + ');';
  lines[lines.length] = 'var ' + i32ArrayName + ' = new Int32Array(' + bufferName + ');';

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
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr)) {
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
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr) && '-' !== expr.charAt(0)) {
    return expr;
  }
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
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderFloatCoercion_ = function (expr) {
  this.markBinding_('Math_fround');
  return this.n_('Math_fround') + '(' + expr + ')';
};

/**
 * @override
 * @protected
 * @param {string} condStr
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.coerceSwitchCondition_ = function (condStr) {
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(condStr);
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
    return this.renderFloatCoercion_(expr);
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
    return this.renderFloatCoercion_(Wasm2Lang.Backend.AbstractCodegen.formatFloatLiteral_(value));
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
 * Sanitises a raw binaryen name into a valid JavaScript identifier, guarding
 * against digit-leading names and JS reserved words.
 *
 * @private
 * @param {string} name
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.asmjsSafeName_ = function (name) {
  return Wasm2Lang.Backend.AbstractCodegen.resolveReservedIdentifier_(
    Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(name),
    Wasm2Lang.Backend.AsmjsCodegen.RESERVED_
  );
};

/**
 * @override
 * @param {string} funcName
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.buildFunctionIdentifier_ = function (funcName) {
  return Wasm2Lang.Backend.AsmjsCodegen.asmjsSafeName_(funcName);
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.UnaryOpInfo} info
 * @param {string} valueExpr
 * @param {number=} opt_valueCat
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderNumericUnaryOp_ = function (binaryen, info, valueExpr, opt_valueCat) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ name = info.opName;
  var /** @const {boolean} */ isF32 = Wasm2Lang.Backend.ValueType.isF32(binaryen, info.operandType);

  if ('abs' === name || 'ceil' === name || 'floor' === name || 'sqrt' === name) {
    this.markBinding_('Math_' + name);
    var /** @const {string} */ mathFn = this.n_('Math_' + name);
    if (isF32) {
      this.markBinding_('Math_fround');
      return this.n_('Math_fround') + '(' + mathFn + '(' + P.renderPrefix('+', valueExpr) + '))';
    }
    return P.renderPrefix('+', mathFn + '(' + valueExpr + ')');
  }

  if ('convert_s_i32_to_f32' === name) {
    this.markBinding_('Math_fround');
    return this.n_('Math_fround') + '(' + Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(valueExpr) + ')';
  }
  if ('convert_u_i32_to_f32' === name) {
    this.markBinding_('Math_fround');
    return this.n_('Math_fround') + '(' + P.wrap(valueExpr, P.PREC_SHIFT_, false) + '>>>0)';
  }
  if ('convert_s_i32_to_f64' === name) {
    return '+(' + Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(valueExpr) + ')';
  }
  if ('convert_u_i32_to_f64' === name) {
    return '+(' + P.wrap(valueExpr, P.PREC_SHIFT_, false) + '>>>0)';
  }

  if ('demote_f64_to_f32' === name) {
    this.markBinding_('Math_fround');
    return this.n_('Math_fround') + '(' + valueExpr + ')';
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

  return Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericUnaryOp_.call(this, binaryen, info, valueExpr, opt_valueCat);
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

  if ('min' === info.opName || 'max' === info.opName) {
    this.markBinding_('Math_' + info.opName);
    var /** @const {string} */ fn = this.n_('Math_' + info.opName);
    if (Wasm2Lang.Backend.ValueType.isF32(binaryen, info.retType)) {
      this.markBinding_('Math_fround');
      return this.n_('Math_fround') + '(' + fn + '(' + P.renderPrefix('+', L) + ', ' + P.renderPrefix('+', R) + '))';
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
  // Comparisons produce fixnum (0 or 1) in asm.js — no |0 coercion needed.
  return '(' + conditionExpr + ')';
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
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_));
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
  this.markBinding_('Math_imul');
  // Math.imul(intish, intish) returns signed in asm.js — no |0 needed.
  return this.n_('Math_imul') + '(' + L + ', ' + R + ')';
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
        info.opStr,
        Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(R),
        P.PREC_MULTIPLICATIVE_
      )
    );
  }
  return Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(
    P.renderInfix(
      Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(L),
      info.opStr,
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
  var /** @type {boolean} */ allowRightEqual = true;

  if ('&' === info.opStr) {
    precedence = P.PREC_BIT_AND_;
  } else if ('^' === info.opStr) {
    precedence = P.PREC_BIT_XOR_;
  } else if ('<<' === info.opStr || '>>' === info.opStr || '>>>' === info.opStr) {
    precedence = P.PREC_SHIFT_;
    allowRightEqual = false;
  }

  return P.renderInfix(L, info.opStr, R, precedence, allowRightEqual);
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

  if (C.isConstant(expr) && !isUnsigned) {
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
  // Comparisons produce fixnum (0 or 1) in asm.js — no |0 coercion needed.
  return (
    '(' +
    this.renderComparisonOperand_(L, info.unsigned) +
    ' ' +
    info.opStr +
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
    this.markBinding_('Math_fround');
    return this.n_('Math_fround') + '(0.0)';
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
      return this.renderCoercionByType_(binaryen, this.renderHeapAccess_(binaryen, ptrExpr, wasmType, bytes, true), wasmType);
    }
    return this.renderHelperCall_(
      binaryen,
      '$w2l_load_' + Wasm2Lang.Backend.ValueType.typeName(binaryen, wasmType),
      [ptrExpr],
      wasmType
    );
  }
  return this.renderCoercionByType_(binaryen, this.renderHeapAccess_(binaryen, ptrExpr, wasmType, bytes, isSigned), wasmType);
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
  var /** @const {number} */ valueCat = void 0 !== opt_valueCat ? opt_valueCat : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
  var /** @const {string} */ coercedValue = this.coerceToType_(binaryen, valueExpr, valueCat, wasmType);
  if (Wasm2Lang.Backend.ValueType.isFloat(binaryen, wasmType)) {
    // Use direct HEAPF32/HEAPF64 when alignment is declared sufficient.
    // Fall back to byte-copy helpers for sub-natural alignment.
    if (align >= bytes) {
      return this.renderHeapAccess_(binaryen, ptrExpr, wasmType, bytes, true) + ' = ' + coercedValue + ';';
    }
    var /** @const {string} */ storeName = '$w2l_store_' + Wasm2Lang.Backend.ValueType.typeName(binaryen, wasmType);
    this.markHelper_(storeName);
    return this.n_(storeName) + '(' + ptrExpr + ', ' + coercedValue + ');';
  }
  return this.renderHeapAccess_(binaryen, ptrExpr, wasmType, bytes, true) + ' = ' + coercedValue + ';';
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
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);

  // Pre-resolve mangled names used across multiple helpers.
  var /** @const {string} */ l0 = this.localN_(0);
  var /** @const {string} */ l1 = this.localN_(1);
  var /** @const {string} */ l2 = this.localN_(2);
  var /** @const {string} */ l3 = this.localN_(3);
  var /** @const {string} */ nHEAPU8 = this.n_('HEAPU8');
  var /** @const {string} */ nHEAP32 = this.n_('HEAP32');
  var /** @const {string} */ nHEAPF32 = this.n_('HEAPF32');
  var /** @const {string} */ nHEAPF64 = this.n_('HEAPF64');
  var /** @const {string} */ nMathFround = this.n_('Math_fround');
  var /** @const {string} */ nMathAbs = this.n_('Math_abs');
  var /** @const {string} */ nMathCeil = this.n_('Math_ceil');
  var /** @const {string} */ nMathFloor = this.n_('Math_floor');
  var /** @const {string} */ nMathClz32 = this.n_('Math_clz32');

  if (used['$w2l_ctz']) {
    this.markBinding_('Math_clz32');
    // params: l0=$x; vars: l1=$y
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_ctz') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = 0;';
    lines[lines.length] = pad2 + 'if ((' + l0 + '|0) == 0) {';
    lines[lines.length] = pad2 + pad(1) + 'return 32|0;';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + l1 + ' = ' + l0 + ' & (-' + l0 + '|0);';
    lines[lines.length] = pad2 + 'return 32 - ' + nMathClz32 + '(' + l1 + ' - 1|0)|0;';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_popcnt']) {
    // params: l0=$x; vars: l1=$n
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_popcnt') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = 0;';
    lines[lines.length] = pad2 + 'while ((' + l0 + '|0) != 0) {';
    lines[lines.length] = pad2 + pad(1) + l0 + ' = ' + l0 + ' & (' + l0 + ' - 1|0);';
    lines[lines.length] = pad2 + pad(1) + l1 + ' = ' + l1 + ' + 1|0;';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return ' + l1 + '|0;';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_copysign_f64']) {
    this.markBinding_('Math_abs');
    // params: l0=$x, l1=$y
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_copysign_f64') + '(' + l0 + ', ' + l1 + ') {';
    lines[lines.length] = pad2 + l0 + ' = +' + l0 + ';';
    lines[lines.length] = pad2 + l1 + ' = +' + l1 + ';';
    lines[lines.length] = pad2 + l0 + ' = +' + nMathAbs + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l1 + ' < 0.0) {';
    lines[lines.length] = pad2 + pad(1) + 'return +(-' + l0 + ');';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'if (' + l1 + ' == 0.0) {';
    lines[lines.length] = pad2 + pad(1) + 'if (1.0 / ' + l1 + ' < 0.0) {';
    lines[lines.length] = pad2 + pad(2) + 'return +(-' + l0 + ');';
    lines[lines.length] = pad2 + pad(1) + '}';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return +' + l0 + ';';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_copysign_f32']) {
    this.markBinding_('Math_abs');
    this.markBinding_('Math_fround');
    // params: l0=$x, l1=$y
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_copysign_f32') + '(' + l0 + ', ' + l1 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + l1 + ' = ' + nMathFround + '(' + l1 + ');';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + nMathAbs + '(+' + l0 + '));';
    lines[lines.length] = pad2 + 'if (' + l1 + ' < ' + nMathFround + '(0.0)) {';
    lines[lines.length] = pad2 + pad(1) + 'return ' + nMathFround + '(-' + l0 + ');';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'if (' + l1 + ' == ' + nMathFround + '(0.0)) {';
    lines[lines.length] = pad2 + pad(1) + 'if (1.0 / +' + l1 + ' < 0.0) {';
    lines[lines.length] = pad2 + pad(2) + 'return ' + nMathFround + '(-' + l0 + ');';
    lines[lines.length] = pad2 + pad(1) + '}';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_trunc_f64']) {
    this.markBinding_('Math_ceil');
    this.markBinding_('Math_floor');
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = +' + l0 + ';';
    lines[lines.length] = pad2 + 'return +(' + l0 + ' < 0.0 ? ' + nMathCeil + '(' + l0 + ') : ' + nMathFloor + '(' + l0 + '));';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_f32']) {
    this.markBinding_('Math_ceil');
    this.markBinding_('Math_floor');
    this.markBinding_('Math_fround');
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_f32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] =
      pad2 +
      'return ' +
      nMathFround +
      '(+' +
      l0 +
      ' < 0.0 ? ' +
      nMathCeil +
      '(+' +
      l0 +
      ') : ' +
      nMathFloor +
      '(+' +
      l0 +
      '));';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_nearest_f64']) {
    this.markBinding_('Math_floor');
    // params: l0=$x; vars: l1=$floor, l2=$diff, l3=$i
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_nearest_f64') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = +' + l0 + ';';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = 0.0, ' + l2 + ' = 0.0, ' + l3 + ' = 0;';
    lines[lines.length] = pad2 + l1 + ' = ' + nMathFloor + '(' + l0 + ');';
    lines[lines.length] = pad2 + l2 + ' = +' + l0 + ' - +' + l1 + ';';
    lines[lines.length] = pad2 + 'if (' + l2 + ' < 0.5) {';
    lines[lines.length] = pad2 + pad(1) + 'return +' + l1 + ';';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'if (' + l2 + ' > 0.5) {';
    lines[lines.length] = pad2 + pad(1) + 'if (+(' + l1 + ' + 1.0) == 0.0) { if (' + l0 + ' < 0.0) { return +(-0.0); } }';
    lines[lines.length] = pad2 + pad(1) + 'return +(' + l1 + ' + 1.0);';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + l3 + ' = ~~' + l1 + ';';
    lines[lines.length] = pad2 + 'if ((' + l3 + ' & 1) == 0) {';
    lines[lines.length] = pad2 + pad(1) + 'return +' + l1 + ';';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'if (+(' + l1 + ' + 1.0) == 0.0) { if (' + l0 + ' < 0.0) { return +(-0.0); } }';
    lines[lines.length] = pad2 + 'return +(' + l1 + ' + 1.0);';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_nearest_f32']) {
    this.markBinding_('Math_floor');
    this.markBinding_('Math_fround');
    // params: l0=$x; vars: l1=$floor, l2=$diff, l3=$i
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_nearest_f32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = 0.0, ' + l2 + ' = 0.0, ' + l3 + ' = 0;';
    lines[lines.length] = pad2 + l1 + ' = ' + nMathFloor + '(+' + l0 + ');';
    lines[lines.length] = pad2 + l2 + ' = +' + l0 + ' - +' + l1 + ';';
    lines[lines.length] = pad2 + 'if (' + l2 + ' < 0.5) {';
    lines[lines.length] = pad2 + pad(1) + 'return ' + nMathFround + '(' + l1 + ');';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'if (' + l2 + ' > 0.5) {';
    lines[lines.length] =
      pad2 + pad(1) + 'if (+(' + l1 + ' + 1.0) == 0.0) { if (+' + l0 + ' < 0.0) { return ' + nMathFround + '(-0.0); } }';
    lines[lines.length] = pad2 + pad(1) + 'return ' + nMathFround + '(' + l1 + ' + 1.0);';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + l3 + ' = ~~' + l1 + ';';
    lines[lines.length] = pad2 + 'if ((' + l3 + ' & 1) == 0) {';
    lines[lines.length] = pad2 + pad(1) + 'return ' + nMathFround + '(' + l1 + ');';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] =
      pad2 + 'if (+(' + l1 + ' + 1.0) == 0.0) { if (+' + l0 + ' < 0.0) { return ' + nMathFround + '(-0.0); } }';
    lines[lines.length] = pad2 + 'return ' + nMathFround + '(' + l1 + ' + 1.0);';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_trunc_u_f32_to_i32']) {
    this.markBinding_('Math_fround');
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_u_f32_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (+' + l0 + ' >= 2147483648.0) {';
    lines[lines.length] = pad2 + pad(1) + 'return (~~(+' + l0 + ' - 2147483648.0) + -2147483648)|0;';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return ~~+' + l0 + '|0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_u_f64_to_i32']) {
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_u_f64_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = +' + l0 + ';';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 2147483648.0) {';
    lines[lines.length] = pad2 + pad(1) + 'return (~~(' + l0 + ' - 2147483648.0) + -2147483648)|0;';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return ~~' + l0 + '|0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_s_f32_to_i32']) {
    this.markBinding_('Math_fround');
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_sat_s_f32_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l0 + ' != ' + l0 + ') return 0;';
    lines[lines.length] = pad2 + 'if (+' + l0 + ' >= 2147483648.0) return 2147483647|0;';
    lines[lines.length] = pad2 + 'if (+' + l0 + ' <= -2147483649.0) return -2147483648|0;';
    lines[lines.length] = pad2 + 'return ~~+' + l0 + '|0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_u_f32_to_i32']) {
    this.markBinding_('Math_fround');
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_sat_u_f32_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l0 + ' != ' + l0 + ') return 0;';
    lines[lines.length] = pad2 + 'if (+' + l0 + ' >= 4294967296.0) return -1|0;';
    lines[lines.length] = pad2 + 'if (+' + l0 + ' < 0.0) return 0;';
    lines[lines.length] = pad2 + 'if (+' + l0 + ' >= 2147483648.0) {';
    lines[lines.length] = pad2 + pad(1) + 'return (~~(+' + l0 + ' - 2147483648.0) + -2147483648)|0;';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return ~~+' + l0 + '|0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_s_f64_to_i32']) {
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_sat_s_f64_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = +' + l0 + ';';
    lines[lines.length] = pad2 + 'if (' + l0 + ' != ' + l0 + ') return 0;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 2147483648.0) return 2147483647|0;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' <= -2147483649.0) return -2147483648|0;';
    lines[lines.length] = pad2 + 'return ~~' + l0 + '|0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_u_f64_to_i32']) {
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_sat_u_f64_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = +' + l0 + ';';
    lines[lines.length] = pad2 + 'if (' + l0 + ' != ' + l0 + ') return 0;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 4294967296.0) return -1|0;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' < 0.0) return 0;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 2147483648.0) {';
    lines[lines.length] = pad2 + pad(1) + 'return (~~(' + l0 + ' - 2147483648.0) + -2147483648)|0;';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return ~~' + l0 + '|0;';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_store_f32']) {
    this.markBinding_('HEAPF32');
    this.markBinding_('HEAPU8');
    this.markBinding_('HEAP32');
    this.markBinding_('Math_fround');
    // params: l0=$p, l1=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_store_f32') + '(' + l0 + ', ' + l1 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + l1 + ' = ' + nMathFround + '(' + l1 + ');';
    lines[lines.length] = pad2 + nHEAPF32 + '[' + scratchWordIndex + '] = ' + nMathFround + '(' + l1 + ');';
    for (var /** number */ f32si = 0; f32si !== 4; ++f32si) {
      lines[lines.length] =
        pad2 +
        nHEAPU8 +
        '[' +
        (0 === f32si ? l0 + ' >> 0' : l0 + ' + ' + String(f32si) + ' >> 0') +
        '] = ' +
        nHEAPU8 +
        '[' +
        String(scratchByteOffset + f32si) +
        '];';
    }
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_load_f32']) {
    this.markBinding_('HEAPF32');
    this.markBinding_('HEAPU8');
    this.markBinding_('HEAP32');
    this.markBinding_('Math_fround');
    // params: l0=$p; vars: l1=$r
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_load_f32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = ' + nMathFround + '(0);';
    for (var /** number */ f32li = 0; f32li !== 4; ++f32li) {
      lines[lines.length] =
        pad2 +
        nHEAPU8 +
        '[' +
        String(scratchByteOffset + f32li) +
        '] = ' +
        nHEAPU8 +
        '[' +
        (0 === f32li ? l0 + ' >> 0' : l0 + ' + ' + String(f32li) + ' >> 0') +
        '];';
    }
    lines[lines.length] = pad2 + l1 + ' = ' + nMathFround + '(' + nHEAPF32 + '[' + scratchWordIndex + ']);';
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = pad2 + 'return ' + nMathFround + '(' + l1 + ');';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_store_f64']) {
    this.markBinding_('HEAPF64');
    this.markBinding_('HEAPU8');
    this.markBinding_('HEAP32');
    // params: l0=$p, l1=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_store_f64') + '(' + l0 + ', ' + l1 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + l1 + ' = +' + l1 + ';';
    lines[lines.length] = pad2 + nHEAPF64 + '[' + scratchQwordIndex + '] = ' + l1 + ';';
    for (var /** number */ f64si = 0; f64si !== 8; ++f64si) {
      lines[lines.length] =
        pad2 +
        nHEAPU8 +
        '[' +
        (0 === f64si ? l0 + ' >> 0' : l0 + ' + ' + String(f64si) + ' >> 0') +
        '] = ' +
        nHEAPU8 +
        '[' +
        String(scratchByteOffset + f64si) +
        '];';
    }
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = pad2 + nHEAP32 + '[' + String(scratchWordIndex + 1) + '] = 0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_load_f64']) {
    this.markBinding_('HEAPF64');
    this.markBinding_('HEAPU8');
    this.markBinding_('HEAP32');
    // params: l0=$p; vars: l1=$r
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_load_f64') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = 0.0;';
    for (var /** number */ f64li = 0; f64li !== 8; ++f64li) {
      lines[lines.length] =
        pad2 +
        nHEAPU8 +
        '[' +
        String(scratchByteOffset + f64li) +
        '] = ' +
        nHEAPU8 +
        '[' +
        (0 === f64li ? l0 + ' >> 0' : l0 + ' + ' + String(f64li) + ' >> 0') +
        '];';
    }
    lines[lines.length] = pad2 + l1 + ' = +' + nHEAPF64 + '[' + scratchQwordIndex + '];';
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = pad2 + nHEAP32 + '[' + String(scratchWordIndex + 1) + '] = 0;';
    lines[lines.length] = pad2 + 'return +' + l1 + ';';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_reinterpret_f32_to_i32']) {
    this.markBinding_('HEAPF32');
    this.markBinding_('HEAP32');
    this.markBinding_('Math_fround');
    // params: l0=$x; vars: l1=$r
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_reinterpret_f32_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = 0;';
    lines[lines.length] = pad2 + nHEAPF32 + '[' + scratchWordIndex + '] = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + l1 + ' = ' + nHEAP32 + '[' + scratchWordIndex + ']|0;';
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = pad2 + 'return ' + l1 + '|0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_reinterpret_i32_to_f32']) {
    this.markBinding_('HEAP32');
    this.markBinding_('HEAPF32');
    this.markBinding_('Math_fround');
    // params: l0=$x; vars: l1=$r
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_reinterpret_i32_to_f32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = ' + nMathFround + '(0);';
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = ' + l0 + ';';
    lines[lines.length] = pad2 + l1 + ' = ' + nMathFround + '(' + nHEAPF32 + '[' + scratchWordIndex + ']);';
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = pad2 + 'return ' + nMathFround + '(' + l1 + ');';
    lines[lines.length] = pad1 + '}';
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
 *   labelMap: !Object<string, number>,
 *   importedNames: !Object<string, string>,
 *   indent: number,
 *   wasmModule: !BinaryenModule,
 *   visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor,
 *   fusedBlockToLoop: !Object<string, string>,
 *   pendingBlockFusion: string,
 *   currentLoopName: string,
 *   doWhileBodyPtrs: !Object<string, boolean>,
 *   doWhileConditionStr: string,
 *   whileBodyPtrs: !Object<string, boolean>,
 *   whileConditionStr: string,
 *   rootSwitchExitMap: ?Object<string, !Array<number>>,
 *   rootSwitchRsName: string,
 *   rootSwitchLoopName: string
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
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderHeapAccess_ = function (binaryen, ptrExpr, wasmType, bytes, isSigned) {
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

  /** @type {string} */
  var viewName;
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    viewName = 'HEAPF64';
  } else if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    viewName = 'HEAPF32';
  } else if (4 === bytes) {
    viewName = 'HEAP32';
  } else if (2 === bytes) {
    viewName = isSigned ? 'HEAP16' : 'HEAPU16';
  } else if (1 === bytes) {
    viewName = isSigned ? 'HEAP8' : 'HEAPU8';
  } else {
    this.markBinding_('HEAP8');
    return this.n_('HEAP8') + '[0]';
  }
  this.markBinding_(viewName);
  return this.n_(viewName) + '[' + shiftedPtr + ']';
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
  var /** @const */ hp = A.hasPrefix_;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @type {number} */ resultCat = A.CAT_VOID;

  var /** @const {function(number): !Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ childResultAt = function (i) {
      return A.getChildResultInfo_(childResults, i);
    };

  var /** @const {function(number): string} */ cr = function (i) {
      return childResultAt(i).expressionString;
    };

  var /** @const {function(number): number} */ cc = function (i) {
      return childResultAt(i).expressionCategory;
    };

  switch (id) {
    case binaryen.ConstId: {
      var /** @const {number} */ constType = /** @type {number} */ (expr['type']);
      result = this.renderConst_(binaryen, /** @type {number} */ (expr['value']), constType);
      resultCat = Wasm2Lang.Backend.ValueType.isI32(binaryen, constType)
        ? C.FIXNUM
        : Wasm2Lang.Backend.ValueType.isF32(binaryen, constType)
          ? A.CAT_F32
          : A.CAT_RAW;
      break;
    }
    case binaryen.LocalGetId:
      result = this.localN_(/** @type {number} */ (expr['index']));
      resultCat = A.CAT_RAW;
      break;

    case binaryen.GlobalGetId:
      result = this.n_('$g_' + /** @type {string} */ (expr['name']));
      resultCat = A.CAT_RAW;
      break;

    case binaryen.BinaryId: {
      var /** @const {number} */ binaryOp = /** @type {number} */ (expr['op']);
      var /** @const {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} */ binInfo = Wasm2Lang.Backend.I32Coercion.classifyBinaryOp(
          binaryen,
          binaryOp
        );
      if (binInfo) {
        result = this.renderBinaryOp_(binInfo, cr(0), cr(1));
        resultCat =
          C.OP_COMPARISON === binInfo.category
            ? C.FIXNUM
            : C.OP_BITWISE === binInfo.category && binInfo.unsigned
              ? C.UNSIGNED
              : C.SIGNED;
      } else {
        var /** @const {?Wasm2Lang.Backend.NumericOps.BinaryOpInfo} */ numericBinInfo =
            Wasm2Lang.Backend.NumericOps.classifyBinaryOp(binaryen, binaryOp);
        if (numericBinInfo) {
          result = this.renderNumericBinaryOp_(binaryen, numericBinInfo, cr(0), cr(1));
          resultCat = numericBinInfo.isComparison ? C.FIXNUM : A.catForCoercedType_(binaryen, numericBinInfo.retType);
        } else {
          result = '__unknown_binop_' + expr['op'] + '(' + cr(0) + ', ' + cr(1) + ')';
          resultCat = A.CAT_RAW;
        }
      }
      break;
    }
    case binaryen.UnaryId: {
      var /** @const {number} */ unCat = Wasm2Lang.Backend.I32Coercion.classifyUnaryOp(
          binaryen,
          /** @type {number} */ (expr['op'])
        );
      if (C.UNARY_EQZ === unCat) {
        // !expr produces fixnum (0 or 1) in asm.js — no |0 coercion needed.
        result = Wasm2Lang.Backend.AbstractCodegen.Precedence_.renderPrefix('!', cr(0));
        resultCat = C.FIXNUM;
      } else if (C.UNARY_CLZ === unCat) {
        this.markBinding_('Math_clz32');
        result = Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(this.n_('Math_clz32') + '(' + cr(0) + ')');
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
          resultCat = A.catForCoercedType_(binaryen, numericUnInfo.retType);
        } else {
          result = Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_('__unknown_unop_' + expr['op'] + '(' + cr(0) + ')');
          resultCat = C.SIGNED;
        }
      }
      break;
    }
    case binaryen.LoadId: {
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
      break;
    }
    case binaryen.StoreId: {
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
      break;
    }
    case binaryen.LocalSetId: {
      var /** @const */ lsResult = this.emitLocalSet_(
          binaryen,
          state.functionInfo,
          ind,
          !!expr['isTee'],
          /** @type {number} */ (expr['index']),
          cr(0),
          cc(0)
        );
      result = lsResult.result;
      resultCat = lsResult.resultCat;
      break;
    }
    case binaryen.GlobalSetId: {
      var /** @const {string} */ globalName = /** @type {string} */ (expr['name']);
      var /** @const {number} */ globalType = state.globalTypes[globalName] || binaryen.i32;
      result = pad(ind) + this.n_('$g_' + globalName) + ' = ' + this.coerceToType_(binaryen, cr(0), cc(0), globalType) + ';\n';
      break;
    }
    case binaryen.CallId: {
      var /** @const {string} */ callTarget = /** @type {string} */ (expr['target']);
      var /** @const {string} */ importBase = state.importedNames[callTarget] || '';
      var /** @type {string} */ callName =
          '' !== importBase ? this.n_('$if_' + importBase) : this.n_(Wasm2Lang.Backend.AsmjsCodegen.asmjsSafeName_(callTarget));
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
      break;
    }
    case binaryen.ReturnId:
      if (childResultAt(0).hasExpression) {
        result = pad(ind) + 'return ' + this.coerceToType_(binaryen, cr(0), cc(0), state.functionInfo.results) + ';\n';
      } else {
        result = pad(ind) + 'return;\n';
      }
      break;

    case binaryen.DropId:
      result = pad(ind) + cr(0) + ';\n';
      break;

    case binaryen.NopId:
    case binaryen.UnreachableId:
      break;

    case binaryen.SelectId: {
      var /** @const {number} */ selectType = /** @type {number} */ (expr['type']);
      result = this.renderCoercionByType_(
        binaryen,
        '(' + this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32) + ' ? ' + cr(1) + ' : ' + cr(2) + ')',
        selectType
      );
      resultCat = A.catForCoercedType_(binaryen, selectType);
      break;
    }
    case binaryen.MemorySizeId:
      result = '0';
      resultCat = C.FIXNUM;
      break;

    case binaryen.MemoryGrowId:
      result = pad(ind) + cr(0) + ';\n';
      break;

    case binaryen.BlockId: {
      var /** @const {?string} */ blockName = /** @type {?string} */ (expr['name']);
      if (blockName && hp(blockName, A.RS_ROOT_SWITCH_PREFIX_)) {
        result = this.emitRootSwitch_(state, nodeCtx);
        break;
      }
      if (blockName && hp(blockName, A.SW_DISPATCH_PREFIX_)) {
        result = this.emitFlatSwitch_(state, nodeCtx);
        break;
      }
      result = this.emitLabeledBlock_(state, nodeCtx, childResults);
      break;
    }
    case binaryen.LoopId: {
      var /** @const {string} */ loopName = /** @type {string} */ (expr['name']);
      if (hp(loopName, A.LF_FORLOOP_PREFIX_)) {
        result = pad(ind) + 'for (;;) {\n' + cr(0) + pad(ind) + '}\n';
      } else if (hp(loopName, A.LC_CONTINUE_PREFIX_)) {
        result = pad(ind) + this.labelN_(state.labelMap, loopName) + ': for (;;) {\n' + cr(0) + pad(ind) + '}\n';
      } else if (hp(loopName, A.LE_DOWHILE_PREFIX_)) {
        var /** @const {string} */ dwCondE = state.doWhileConditionStr;
        state.doWhileConditionStr = '';
        result = pad(ind) + 'do {\n' + cr(0) + pad(ind) + '} while (' + dwCondE + ');\n';
      } else if (hp(loopName, A.LD_DOWHILE_PREFIX_)) {
        var /** @const {string} */ dwCond = state.doWhileConditionStr;
        state.doWhileConditionStr = '';
        result =
          pad(ind) + this.labelN_(state.labelMap, loopName) + ': do {\n' + cr(0) + pad(ind) + '} while (' + dwCond + ');\n';
      } else if (hp(loopName, A.LY_WHILE_PREFIX_)) {
        var /** @const {string} */ whCondY = state.whileConditionStr;
        state.whileConditionStr = '';
        result = pad(ind) + 'while ' + this.formatCondition_(whCondY) + ' {\n' + cr(0) + pad(ind) + '}\n';
      } else if (hp(loopName, A.LW_WHILE_PREFIX_)) {
        var /** @const {string} */ whCond = state.whileConditionStr;
        state.whileConditionStr = '';
        result =
          pad(ind) +
          this.labelN_(state.labelMap, loopName) +
          ': while ' +
          this.formatCondition_(whCond) +
          ' {\n' +
          cr(0) +
          pad(ind) +
          '}\n';
      } else {
        result =
          pad(ind) +
          this.labelN_(state.labelMap, loopName) +
          ': while (1) {\n' +
          cr(0) +
          pad(ind + 1) +
          'break;\n' +
          pad(ind) +
          '}\n';
      }
      break;
    }
    case binaryen.IfId:
      result = this.emitIfStatement_(ind, cr(0), cr(1), /** @type {number} */ (expr['ifFalse']), childResults.length, cr(2));
      break;
    case binaryen.BreakId: {
      var /** @const {string} */ brName = /** @type {string} */ (expr['name']);
      var /** @const {number} */ brCondPtr = /** @type {number} */ (expr['condition']);
      // Root-switch exit interception.
      if (state.rootSwitchExitMap) {
        if (brName in state.rootSwitchExitMap) {
          var /** @const {!Array<number>} */ rsExitPtrs = state.rootSwitchExitMap[brName];
          var /** @const {!Array<string>} */ rsExitLines = [];
          // prettier-ignore
          var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ rsVis =
            /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor);
          var /** @const {boolean} */ rsIsTerminal = A.emitRootSwitchExitCode_(
              rsExitLines,
              state.wasmModule,
              binaryen,
              state.functionInfo,
              rsVis,
              rsExitPtrs,
              ind
            );
          if (!rsIsTerminal) {
            rsExitLines[rsExitLines.length] =
              pad(ind) + this.renderLabeledJump_(state.labelMap, 'break', state.rootSwitchLoopName);
          }
          if (0 !== brCondPtr) {
            result = pad(ind) + 'if ' + this.formatCondition_(cr(0)) + ' {\n' + rsExitLines.join('') + pad(ind) + '}\n';
          } else {
            result = rsExitLines.join('');
          }
          break;
        }
        if (brName === state.rootSwitchRsName) {
          var /** @const {string} */ rsBreakStmt = this.renderLabeledJump_(state.labelMap, 'break', state.rootSwitchLoopName);
          result = this.emitConditionalStatement_(ind, brCondPtr, cr(0), rsBreakStmt);
          break;
        }
      }
      var /** @const {string} */ brStmt = this.resolveBreakTarget_(
          state.labelKinds,
          state.fusedBlockToLoop,
          state.labelMap,
          brName
        );
      result = this.emitConditionalStatement_(ind, brCondPtr, cr(0), brStmt);
      break;
    }
    case binaryen.SwitchId: {
      var /** @const {!Array<string>} */ switchNames = /** @type {!Array<string>} */ (expr['names'] || []);
      var /** @const {string} */ switchDefault = /** @type {string} */ (expr['defaultName'] || '');
      var /** @const {string} */ switchCond = Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(cr(0));
      var /** @const {!Array<string>} */ switchLines = [];
      switchLines[switchLines.length] = pad(ind) + 'switch (' + switchCond + ') {\n';
      var /** @type {number} */ si = 0;
      while (si < switchNames.length) {
        var /** @const {string} */ switchTarget = switchNames[si];
        while (si < switchNames.length && switchNames[si] === switchTarget) {
          switchLines[switchLines.length] = pad(ind + 1) + 'case ' + si + ':\n';
          ++si;
        }
        switchLines[switchLines.length] =
          pad(ind + 2) + this.resolveBreakTarget_(state.labelKinds, state.fusedBlockToLoop, state.labelMap, switchTarget);
      }
      if ('' !== switchDefault) {
        switchLines[switchLines.length] = pad(ind + 1) + 'default:\n';
        switchLines[switchLines.length] =
          pad(ind + 2) + this.resolveBreakTarget_(state.labelKinds, state.fusedBlockToLoop, state.labelMap, switchDefault);
      }
      switchLines[switchLines.length] = pad(ind) + '}\n';
      result = switchLines.join('');
      break;
    }
    default:
      result = '/* unknown expr id=' + id + ' */';
      break;
  }

  if (resultCat !== A.CAT_VOID) {
    return {decisionValue: {'s': result, 'c': resultCat}};
  }
  return {decisionValue: result};
};

/**
 * Emits a flat switch statement for a br_table dispatch block annotated by the
 * SwitchDispatchDetectionPass.  Called from emitLeave_ when the BlockId name
 * starts with {@code sw$}.
 *
 * @private
 * @param {!Wasm2Lang.Backend.AsmjsCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitFlatSwitch_ = function (state, nodeCtx) {
  return this.emitLabeledFlatSwitch_(state, nodeCtx).result;
};

/**
 * Emits a root-switch-loop structure where the outer block wrappers are
 * eliminated and exit code is inlined into the switch cases.
 *
 * @private
 * @param {!Wasm2Lang.Backend.AsmjsCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitRootSwitch_ = function (state, nodeCtx) {
  return this.emitLabeledRootSwitch_(state, nodeCtx);
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
  return this.emitLabeledEnter_(state, nodeCtx);
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
  var /** @const {string} */ fnName = this.n_(Wasm2Lang.Backend.AsmjsCodegen.asmjsSafeName_(funcInfo.name));
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(funcInfo.params);
  var /** @const {number} */ numParams = paramTypes.length;
  var /** @const {!Array<number>} */ varTypes = /** @type {!Array<number>} */ (funcInfo.vars) || [];
  var /** @const {number} */ numVars = varTypes.length;

  // Function header (indent 1 = inside module).
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {!Array<string>} */ paramNames = [];
  for (var /** number */ pi = 0; pi !== numParams; ++pi) {
    paramNames[paramNames.length] = this.localN_(pi);
  }
  parts[parts.length] = pad(1) + 'function ' + fnName + '(' + paramNames.join(', ') + ') {';

  // Parameter annotations.
  for (var /** number */ pa = 0; pa !== numParams; ++pa) {
    var /** @const {string} */ pName = this.localN_(pa);
    parts[parts.length] = pad(2) + pName + ' = ' + this.renderCoercionByType_(binaryen, pName, paramTypes[pa]) + ';';
  }

  // Local variable declarations.
  if (0 !== numVars) {
    var /** @const {!Array<string>} */ varDecls = [];
    for (var /** number */ vi = 0; vi !== numVars; ++vi) {
      var /** @const {number} */ localType = varTypes[vi];
      varDecls[varDecls.length] = this.localN_(numParams + vi) + ' = ' + this.renderLocalInit_(binaryen, localType);
    }
    parts[parts.length] = pad(2) + 'var ' + varDecls.join(', ') + ';';
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
        labelMap: /** @type {!Object<string, number>} */ (Object.create(null)),
        importedNames: importedNames,
        indent: 2,
        wasmModule: wasmModule,
        visitor: null,
        fusedBlockToLoop: /** @type {!Object<string, string>} */ (Object.create(null)),
        pendingBlockFusion: '',
        currentLoopName: '',
        doWhileBodyPtrs: /** @type {!Object<string, boolean>} */ (Object.create(null)),
        doWhileConditionStr: '',
        whileBodyPtrs: /** @type {!Object<string, boolean>} */ (Object.create(null)),
        whileConditionStr: '',
        rootSwitchExitMap: null,
        rootSwitchRsName: '',
        rootSwitchLoopName: ''
      };

    var /** @const */ self = this;
    // prettier-ignore
    var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
      /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
        enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc) { return self.emitEnter_(emitState, nc); },
        leave: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} cr @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc, cr) {
          self.adjustLeaveIndent_(emitState, nc);
          return self.emitLeave_(emitState, nc, cr || []);
        }
      });
    emitState.visitor = visitor;
    var /** @type {*} */ bodyResult = this.walkFunctionBody_(wasmModule, binaryen, funcInfo, visitor);
    Wasm2Lang.Backend.AbstractCodegen.appendNonEmptyLines_(parts, bodyResult);
  }

  parts[parts.length] = pad(1) + '}';
  return parts.join('\n');
};

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<!Wasm2Lang.OutputSink.ChunkEntry>}
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
  var /** @const {string} */ pad1 = Wasm2Lang.Backend.AbstractCodegen.pad_(1);

  // Module header.
  var /** @const {string} */ asmjsModuleName = this.n_('asmjsModule');
  var /** @const {string} */ stdlibName = this.n_('stdlib');
  var /** @const {string} */ foreignName = this.n_('foreign');
  var /** @const {string} */ bufferName_ = this.n_('buffer');
  outputParts[outputParts.length] =
    'var ' + moduleName + ' = function ' + asmjsModuleName + '(' + stdlibName + ', ' + foreignName + ', ' + bufferName_ + ') {';
  outputParts[outputParts.length] = pad1 + '"use asm";';

  // Heap views and stdlib imports are emitted conditionally after function
  // body and helper emission — see usedBindings_ below.  Reserve an index
  // so the declarations appear in the correct position.
  var /** @const {number} */ bindingsInsertIndex = outputParts.length;

  // Imported function bindings.
  for (var /** number */ i = 0, /** @const {number} */ importCount = moduleInfo.impFuncs.length; i !== importCount; ++i) {
    outputParts[outputParts.length] =
      pad1 +
      'var ' +
      this.n_('$if_' + moduleInfo.impFuncs[i].importBaseName) +
      ' = ' +
      foreignName +
      '.' +
      moduleInfo.impFuncs[i].importBaseName +
      ';';
  }

  // Module-level globals.
  for (var /** number */ gi = 0, /** @const {number} */ gLen = moduleInfo.globals.length; gi !== gLen; ++gi) {
    outputParts[outputParts.length] =
      pad1 + 'var ' + this.n_('$g_' + moduleInfo.globals[gi].globalName) + ' = ' + moduleInfo.globals[gi].globalInitValue + ';';
  }

  // Function bodies (emitted first to discover which helpers and bindings are needed).
  this.usedHelpers_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  this.usedBindings_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
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
  // emitHelpers_ also marks binding dependencies for each emitted helper.
  var /** @const {!Array<string>} */ helperLines = this.emitHelpers_(scratchByteOffset, scratchWordIndex, scratchQwordIndex);
  this.usedHelpers_ = null;

  // Insert conditional heap views and stdlib imports at the reserved position.
  var /** @const {!Object<string, boolean>} */ ub = /** @type {!Object<string, boolean>} */ (this.usedBindings_);
  this.usedBindings_ = null;
  var /** @const {!Array<string>} */ bindingLines = [];
  if (ub['HEAP8']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAP8') + ' = new ' + stdlibName + '.Int8Array(' + bufferName_ + ');';
  }
  if (ub['HEAPU8']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAPU8') + ' = new ' + stdlibName + '.Uint8Array(' + bufferName_ + ');';
  }
  if (ub['HEAP16']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAP16') + ' = new ' + stdlibName + '.Int16Array(' + bufferName_ + ');';
  }
  if (ub['HEAPU16']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAPU16') + ' = new ' + stdlibName + '.Uint16Array(' + bufferName_ + ');';
  }
  if (ub['HEAP32']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAP32') + ' = new ' + stdlibName + '.Int32Array(' + bufferName_ + ');';
  }
  if (ub['HEAPF32']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAPF32') + ' = new ' + stdlibName + '.Float32Array(' + bufferName_ + ');';
  }
  if (ub['HEAPF64']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAPF64') + ' = new ' + stdlibName + '.Float64Array(' + bufferName_ + ');';
  }
  if (ub['Math_imul']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_imul') + ' = ' + stdlibName + '.Math.imul;';
  }
  if (ub['Math_clz32']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_clz32') + ' = ' + stdlibName + '.Math.clz32;';
  }
  if (ub['Math_fround']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_fround') + ' = ' + stdlibName + '.Math.fround;';
  }
  if (ub['Math_abs']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_abs') + ' = ' + stdlibName + '.Math.abs;';
  }
  if (ub['Math_ceil']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_ceil') + ' = ' + stdlibName + '.Math.ceil;';
  }
  if (ub['Math_floor']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_floor') + ' = ' + stdlibName + '.Math.floor;';
  }
  if (ub['Math_min']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_min') + ' = ' + stdlibName + '.Math.min;';
  }
  if (ub['Math_max']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_max') + ' = ' + stdlibName + '.Math.max;';
  }
  if (ub['Math_sqrt']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_sqrt') + ' = ' + stdlibName + '.Math.sqrt;';
  }
  // Splice binding declarations into the reserved position.
  for (var /** number */ bi = bindingLines.length - 1; bi >= 0; --bi) {
    outputParts.splice(bindingsInsertIndex, 0, bindingLines[bi]);
  }

  for (var /** number */ hi = 0, /** @const {number} */ helperCount = helperLines.length; hi !== helperCount; ++hi) {
    outputParts[outputParts.length] = helperLines[hi];
  }

  // Append function bodies.
  for (var /** number */ fi = 0, /** @const {number} */ fpLen = functionParts.length; fi !== fpLen; ++fi) {
    outputParts[outputParts.length] = functionParts[fi];
  }

  // Return object.
  var /** @const {!Array<string>} */ returnEntries = [];
  for (var /** number */ r = 0, /** @const {number} */ exportCount = moduleInfo.expFuncs.length; r !== exportCount; ++r) {
    returnEntries[returnEntries.length] =
      moduleInfo.expFuncs[r].exportName +
      ': ' +
      this.n_(Wasm2Lang.Backend.AsmjsCodegen.asmjsSafeName_(moduleInfo.expFuncs[r].internalName));
  }
  outputParts[outputParts.length] = pad1 + 'return { ' + returnEntries.join(', ') + ' };';
  outputParts[outputParts.length] = '};';

  // Traversal summary — delegates to AbstractCodegen which walks all
  // non-imported function bodies and appends per-function node counts and a
  // combined seen-ids line.
  // prettier-ignore
  outputParts[outputParts.length] = /** @type {string} */ (Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode.call(this, wasmModule, options));

  return Wasm2Lang.OutputSink.interleaveNewlines(outputParts);
};
