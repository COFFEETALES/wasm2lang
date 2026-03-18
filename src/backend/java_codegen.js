'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.JavaCodegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
};

Wasm2Lang.Backend.JavaCodegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.JavaCodegen.prototype.constructor = Wasm2Lang.Backend.JavaCodegen;
Wasm2Lang.Backend.registerBackend('java', Wasm2Lang.Backend.JavaCodegen);

// ---------------------------------------------------------------------------
// Reserved words and mangler profile.
// ---------------------------------------------------------------------------

/** @const {!Object<string, boolean>} */
Wasm2Lang.Backend.JavaCodegen.RESERVED_ = Wasm2Lang.Backend.buildReservedSet([
  'abstract',
  'assert',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'goto',
  'if',
  'implements',
  'import',
  'instanceof',
  'int',
  'interface',
  'long',
  'native',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'strictfp',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'var',
  'void',
  'volatile',
  'while',
  '_'
]);

Wasm2Lang.Backend.registerManglerProfile('java', {
  reservedWords: Wasm2Lang.Backend.JavaCodegen.RESERVED_,
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
Wasm2Lang.Backend.JavaCodegen.prototype.getFixedModuleBindings_ = function (options) {
  void options;
  return ['buffer'];
};

/**
 * @override
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.getAllHelperNames_ = function () {
  return [
    '$w2l_convert_u_i32_to_f32',
    '$w2l_convert_u_i32_to_f64',
    '$w2l_nearest_f32',
    '$w2l_nearest_f64',
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
 * @override
 * @param {string} globalName
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.buildGlobalIdentifier_ = function (globalName) {
  return '$g_' + Wasm2Lang.Backend.JavaCodegen.javaSafeName_(globalName);
};

/**
 * @override
 * @param {string} importBaseName
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.buildImportIdentifier_ = function (importBaseName) {
  return '$if_' + Wasm2Lang.Backend.JavaCodegen.javaSafeName_(importBaseName);
};

/**
 * @override
 * @param {string} funcName
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.buildFunctionIdentifier_ = function (funcName) {
  return Wasm2Lang.Backend.JavaCodegen.javaSafeName_(funcName);
};

/**
 * Emits Java IntBuffer init lines using the shared
 * {@code collectI32InitOps_} classification.
 *
 * @private
 * @param {!Int32Array} i32
 * @param {number} startWordIndex
 * @param {string} ibVar  IntBuffer variable name, e.g. '$ib'.
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitStaticI32InitLines_ = function (i32, startWordIndex, ibVar) {
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
        'for (int $i = 0; $i < ' + count + '; ++$i) ' + ibVar + '.put(' + wordIndex + ' + $i, ' + String(value) + ');';
    } else {
      var /** @const {!Array<number>} */ words = op.setWordsI32;
      for (var /** number */ j = 0, /** @const {number} */ wLen = words.length; j !== wLen; ++j) {
        lines[lines.length] = ibVar + '.put(' + (wordIndex + j) + ', ' + String(words[j]) + ');';
      }
    }
  }

  return lines;
};

/**
 * Emits the static memory block as a Java snippet declaring a
 * {@code java.nio.ByteBuffer} (little-endian) and initializing it via an
 * {@code IntBuffer} view.
 *
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitMetadata = function (wasmModule, options) {
  var /** @const {string} */ bufferName = /** @type {string} */ (options.emitMetadata);
  var /** @const {number} */ heapSize = this.resolveHeapSize_(options, 'JAVA_HEAP_SIZE', 65536);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_} */ staticMemory = this.collectStaticMemory_(wasmModule);
  var /** @const {number} */ startWordIndex = staticMemory.startWordIndex;
  var /** @const {!Int32Array} */ i32 = staticMemory.words;
  var /** @const {!Array<string>} */ lines = [];

  lines[lines.length] =
    'java.nio.ByteBuffer ' +
    bufferName +
    ' = java.nio.ByteBuffer.allocate(' +
    heapSize +
    ').order(java.nio.ByteOrder.LITTLE_ENDIAN);';

  if (0 !== i32.length) {
    var /** @const {!Array<string>} */ initLines = this.emitStaticI32InitLines_(i32, startWordIndex, '$ib');
    if (0 !== initLines.length) {
      lines[lines.length] = 'java.nio.IntBuffer $ib = ' + bufferName + '.asIntBuffer();';
      for (var /** number */ ii = 0, /** @const {number} */ initLinesCount = initLines.length; ii !== initLinesCount; ++ii) {
        lines[lines.length] = initLines[ii];
      }
    }
  }

  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Java-safe identifiers.
// ---------------------------------------------------------------------------

/**
 * Java identifiers may contain {@code [a-zA-Z0-9_$]}.  Binaryen names can
 * contain {@code .} and other characters invalid in Java.
 *
 * @private
 * @param {string} name
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.javaSafeName_ = function (name) {
  return Wasm2Lang.Backend.AbstractCodegen.resolveReservedIdentifier_(
    Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(name.replace(/[^a-zA-Z0-9_$]/g, '_')),
    Wasm2Lang.Backend.JavaCodegen.RESERVED_
  );
};

// ---------------------------------------------------------------------------
// Type helpers.
// ---------------------------------------------------------------------------

/**
 * Maps a wasm value type to a Java type name.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.javaTypeName_ = function (binaryen, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) return 'int';
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) return 'float';
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) return 'double';
  return 'void';
};

/**
 * Formats a float literal for Java (appends {@code f} suffix for f32).
 *
 * @private
 * @param {number} value
 * @param {boolean} isF32
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.formatJavaFloat_ = function (value, isF32) {
  if (value !== value) {
    return isF32 ? 'Float.NaN' : 'Double.NaN';
  }
  if (!isFinite(value)) {
    if (0 < value) {
      return isF32 ? 'Float.POSITIVE_INFINITY' : 'Double.POSITIVE_INFINITY';
    }
    return isF32 ? 'Float.NEGATIVE_INFINITY' : 'Double.NEGATIVE_INFINITY';
  }
  if (0 === value && 1 / value < 0) {
    return isF32 ? '-0.0f' : '-0.0';
  }
  var /** @const {string} */ s =
      Math.floor(value) === value && -1 === String(value).indexOf('e') && -1 === String(value).indexOf('E')
        ? String(value) + '.0'
        : String(value);
  return isF32 ? s + 'f' : s;
};

// ---------------------------------------------------------------------------
// Coercion, const, local init.
// ---------------------------------------------------------------------------

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderCoercionByType_ = function (binaryen, expr, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    // Java int is 32-bit — no truncation needed.
    return expr;
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return '(float)(' + expr + ')';
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return '(double)(' + expr + ')';
  }
  return expr;
};

/**
 * Java widens float to double automatically, so CAT_F32 satisfies f64
 * targets without an explicit cast.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} cat
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.coerceToType_ = function (binaryen, expr, cat, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType) && Wasm2Lang.Backend.AbstractCodegen.CAT_F32 === cat) {
    return expr;
  }
  return Wasm2Lang.Backend.AbstractCodegen.prototype.coerceToType_.call(this, binaryen, expr, cat, wasmType);
};

/**
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} value
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderConst_ = function (binaryen, value, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return String(value);
  }
  return Wasm2Lang.Backend.JavaCodegen.formatJavaFloat_(value, Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType));
};

/**
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return '0.0f';
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return '0.0';
  }
  return '0';
};

/**
 * @override
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.getRuntimeHelperPrefix_ = function () {
  return '$w2l_';
};

// ---------------------------------------------------------------------------
// Binary-op rendering (uses shared I32Coercion classification).
// ---------------------------------------------------------------------------

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderArithmeticBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_);
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderMultiplyBinaryOp_ = function (info, L, R) {
  void info;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(L, '*', R, P.PREC_MULTIPLICATIVE_);
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderDivisionBinaryOp_ = function (info, L, R) {
  if (info.unsigned) {
    if ('/' === info.opStr) {
      return 'Integer.divideUnsigned(' + L + ', ' + R + ')';
    }
    return 'Integer.remainderUnsigned(' + L + ', ' + R + ')';
  }
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.renderInfix(L, info.opStr, R, P.PREC_MULTIPLICATIVE_);
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderBitwiseBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {number} */ precedence = P.PREC_BIT_OR_;

  if ('&' === info.opStr) {
    precedence = P.PREC_BIT_AND_;
  } else if ('^' === info.opStr) {
    precedence = P.PREC_BIT_XOR_;
  } else if ('<<' === info.opStr || '>>' === info.opStr || '>>>' === info.opStr) {
    precedence = P.PREC_SHIFT_;
  }

  return P.renderInfix(L, info.opStr, R, precedence, true);
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderRotateBinaryOp_ = function (info, L, R) {
  if (info.rotateLeft) {
    return 'Integer.rotateLeft(' + L + ', ' + R + ')';
  }
  return 'Integer.rotateRight(' + L + ', ' + R + ')';
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderComparisonBinaryOp_ = function (info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (info.unsigned) {
    return '(Integer.compareUnsigned(' + L + ', ' + R + ') ' + info.opStr + ' 0 ? 1 : 0)';
  }
  return '(' + P.renderInfix(L, info.opStr, R, P.PREC_RELATIONAL_) + ' ? 1 : 0)';
};

/**
 * @private
 * @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryOpRenderer_}
 */
Wasm2Lang.Backend.JavaCodegen.binaryOpRenderer_ = {
  renderArithmetic: Wasm2Lang.Backend.JavaCodegen.prototype.renderArithmeticBinaryOp_,
  renderMultiply: Wasm2Lang.Backend.JavaCodegen.prototype.renderMultiplyBinaryOp_,
  renderDivision: Wasm2Lang.Backend.JavaCodegen.prototype.renderDivisionBinaryOp_,
  renderBitwise: Wasm2Lang.Backend.JavaCodegen.prototype.renderBitwiseBinaryOp_,
  renderRotate: Wasm2Lang.Backend.JavaCodegen.prototype.renderRotateBinaryOp_,
  renderComparison: Wasm2Lang.Backend.JavaCodegen.prototype.renderComparisonBinaryOp_
};

/**
 * @private
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderBinaryOp_ = function (info, L, R) {
  return this.renderBinaryOpByCategory_(info, L, R, Wasm2Lang.Backend.JavaCodegen.binaryOpRenderer_);
};

// ---------------------------------------------------------------------------
// Numeric op rendering overrides.
// ---------------------------------------------------------------------------

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.UnaryOpInfo} info
 * @param {string} valueExpr
 * @param {number=} opt_valueCat
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderNumericUnaryOp_ = function (binaryen, info, valueExpr, opt_valueCat) {
  var /** @const {string} */ name = info.opName;
  var /** @const {boolean} */ isF32 = Wasm2Lang.Backend.ValueType.isF32(binaryen, info.operandType);
  var /** @const {number} */ cat = opt_valueCat != null ? opt_valueCat : Wasm2Lang.Backend.AbstractCodegen.CAT_RAW;
  var /** @type {string} */ inner;

  // neg: Java negation preserves float type — skip coercion when input category confirms type.
  if ('neg' === name) {
    var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    return this.coerceToType_(binaryen, P.renderPrefix('-', valueExpr), cat, info.retType);
  }

  if ('abs' === name) {
    if (isF32) {
      inner = this.coerceToType_(binaryen, valueExpr, cat, info.operandType);
      return '(float)Math.abs(' + inner + ')';
    }
    return 'Math.abs(' + valueExpr + ')';
  }
  if ('ceil' === name || 'floor' === name || 'sqrt' === name || 'nearest' === name) {
    var /** @const {string} */ mathName = 'nearest' === name ? 'rint' : name;
    if (isF32) {
      inner = this.coerceToType_(binaryen, valueExpr, cat, info.operandType);
      return '(float)Math.' + mathName + '(' + inner + ')';
    }
    return 'Math.' + mathName + '(' + valueExpr + ')';
  }

  if ('convert_s_i32_to_f32' === name) return '(float)(' + valueExpr + ')';
  if ('convert_u_i32_to_f32' === name) return '(float)Integer.toUnsignedLong(' + valueExpr + ')';
  if ('convert_s_i32_to_f64' === name) return '(double)(' + valueExpr + ')';
  if ('convert_u_i32_to_f64' === name) return '(double)Integer.toUnsignedLong(' + valueExpr + ')';

  if ('demote_f64_to_f32' === name) return '(float)(' + valueExpr + ')';
  if ('promote_f32_to_f64' === name) return '(double)(' + valueExpr + ')';

  if ('trunc_s_f32_to_i32' === name || 'trunc_s_f64_to_i32' === name) {
    inner = this.coerceToType_(binaryen, valueExpr, cat, info.operandType);
    return '(int)(' + inner + ')';
  }

  if ('reinterpret_f32_to_i32' === name) {
    inner = this.coerceToType_(binaryen, valueExpr, cat, info.operandType);
    return 'Float.floatToRawIntBits(' + inner + ')';
  }
  if ('reinterpret_i32_to_f32' === name) return 'Float.intBitsToFloat(' + valueExpr + ')';

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
Wasm2Lang.Backend.JavaCodegen.prototype.renderNumericBinaryOp_ = function (binaryen, info, L, R) {
  var /** @const {boolean} */ isF32 = Wasm2Lang.Backend.ValueType.isF32(binaryen, info.retType);

  if ('min' === info.opName) {
    if (isF32) return '(float)Math.min((double)(' + L + '), (double)(' + R + '))';
    return 'Math.min(' + L + ', ' + R + ')';
  }
  if ('max' === info.opName) {
    if (isF32) return '(float)Math.max((double)(' + L + '), (double)(' + R + '))';
    return 'Math.max(' + L + ', ' + R + ')';
  }
  if ('copysign' === info.opName) {
    if (isF32) return '(float)Math.copySign((double)(' + L + '), (double)(' + R + '))';
    return 'Math.copySign(' + L + ', ' + R + ')';
  }

  if (info.isComparison) {
    return Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericBinaryOp_.call(this, binaryen, info, L, R);
  }

  // Java float/double arithmetic preserves the operand type — no cast needed.
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {number} */ prec = P.PREC_ADDITIVE_;
  if ('mul' === info.opName || 'div' === info.opName) {
    prec = P.PREC_MULTIPLICATIVE_;
  }
  return P.renderInfix(L, info.opStr, R, prec);
};

// renderNumericComparisonResult_: inherited from AbstractCodegen (ternary ? 1 : 0).

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
 *   exportNameMap: !Object<string, string>,
 *   indent: number,
 *   lastExprIsTerminal: boolean,
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
Wasm2Lang.Backend.JavaCodegen.EmitState_;

// ---------------------------------------------------------------------------
// Static helpers.
// ---------------------------------------------------------------------------

/**
 * @private
 * @param {string} baseExpr
 * @param {number} offset
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.renderPtrWithOffset_ = function (baseExpr, offset) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (0 === offset) return baseExpr;
  return P.renderInfix(baseExpr, '+', String(offset), P.PREC_ADDITIVE_);
};

/**
 * @override
 * @protected
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.formatCondition_ = function (expr) {
  if ('' === expr) return '(0 != 0)';
  return '((' + expr + ') != 0)';
};

// ---------------------------------------------------------------------------
// Memory load/store rendering.
// ---------------------------------------------------------------------------

/**
 * @private
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {boolean} isSigned
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderLoad_ = function (binaryen, ptrExpr, wasmType, bytes, isSigned) {
  var /** @const {string} */ buf = 'this.' + this.n_('buffer');
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return buf + '.getDouble(' + ptrExpr + ')';
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return buf + '.getFloat(' + ptrExpr + ')';
  }
  if (4 === bytes) {
    return buf + '.getInt(' + ptrExpr + ')';
  }
  if (2 === bytes) {
    if (isSigned) {
      return '(int)' + buf + '.getShort(' + ptrExpr + ')';
    }
    return '(' + buf + '.getShort(' + ptrExpr + ') & 0xFFFF)';
  }
  // 1 byte.
  if (isSigned) {
    return '(int)' + buf + '.get(' + ptrExpr + ')';
  }
  return '(' + buf + '.get(' + ptrExpr + ') & 0xFF)';
};

/**
 * @private
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {string} valueExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {number=} opt_valueCat
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderStore_ = function (binaryen, ptrExpr, valueExpr, wasmType, bytes, opt_valueCat) {
  var /** @const {number} */ valueCat = void 0 !== opt_valueCat ? opt_valueCat : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
  var /** @const {string} */ buf = 'this.' + this.n_('buffer');
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return buf + '.putDouble(' + ptrExpr + ', ' + this.coerceToType_(binaryen, valueExpr, valueCat, wasmType) + ');';
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return buf + '.putFloat(' + ptrExpr + ', ' + this.coerceToType_(binaryen, valueExpr, valueCat, wasmType) + ');';
  }
  var /** @const {string} */ coercedValue = this.coerceToType_(binaryen, valueExpr, valueCat, binaryen.i32);
  if (4 === bytes) {
    return buf + '.putInt(' + ptrExpr + ', ' + coercedValue + ');';
  }
  if (2 === bytes) {
    return buf + '.putShort(' + ptrExpr + ', (short)(' + coercedValue + '));';
  }
  return buf + '.put(' + ptrExpr + ', (byte)(' + coercedValue + '));';
};

// ---------------------------------------------------------------------------
// Import call rendering.
// ---------------------------------------------------------------------------

/**
 * Renders a call to an imported function, choosing the appropriate Java
 * functional interface and invocation method based on the wasm signature.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {string} importBaseName
 * @param {!Array<string>} callArgs
 * @param {number} callType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderImportCallExpr_ = function (binaryen, importBaseName, callArgs, callType) {
  var /** @const {string} */ field = 'this.' + this.n_('$if_' + Wasm2Lang.Backend.JavaCodegen.javaSafeName_(importBaseName));
  var /** @const {boolean} */ isVoid = callType === binaryen.none || 0 === callType;
  var /** @const {number} */ numArgs = callArgs.length;

  if (isVoid && 0 === numArgs) {
    return '((Runnable)' + field + ').run()';
  }
  if (isVoid && 1 === numArgs) {
    return '((java.util.function.IntConsumer)' + field + ').accept(' + callArgs[0] + ')';
  }
  if (!isVoid && 0 === numArgs) {
    return '((java.util.function.IntSupplier)' + field + ').getAsInt()';
  }
  if (!isVoid && 1 === numArgs) {
    return '((java.util.function.IntUnaryOperator)' + field + ').applyAsInt(' + callArgs[0] + ')';
  }
  if (!isVoid && 2 === numArgs) {
    return '((java.util.function.IntBinaryOperator)' + field + ').applyAsInt(' + callArgs[0] + ', ' + callArgs[1] + ')';
  }
  // Fallback: direct call (will not compile, but documents intent).
  return field + '(' + callArgs.join(', ') + ')';
};

// ---------------------------------------------------------------------------
// Expression emitter (leave callback).
// ---------------------------------------------------------------------------

/**
 * @private
 * @param {!Wasm2Lang.Backend.JavaCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitLeave_ = function (state, nodeCtx, childResults) {
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

  // Capture terminal flag before reset — LoopId reads the flag set by its
  // body's last child (propagated through Block).
  var /** @const {boolean} */ bodyWasTerminal = state.lastExprIsTerminal;

  // Reset terminal flag for all non-Block expressions (Block propagates from
  // its last child).  Terminal handlers (Return, unconditional Break, Switch
  // with default) override to true so LoopId can omit an unreachable break.
  if (id !== binaryen.BlockId) {
    state.lastExprIsTerminal = false;
  }

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
          : Wasm2Lang.Backend.ValueType.isF64(binaryen, constType)
            ? A.CAT_F64
            : A.CAT_RAW;
      break;
    }
    case binaryen.LocalGetId: {
      var /** @const {number} */ localGetIdx = /** @type {number} */ (expr['index']);
      var /** @const {number} */ localGetType = Wasm2Lang.Backend.ValueType.getLocalType(
          binaryen,
          state.functionInfo,
          localGetIdx
        );
      result = this.localN_(localGetIdx);
      resultCat = Wasm2Lang.Backend.ValueType.isF64(binaryen, localGetType)
        ? A.CAT_F64
        : Wasm2Lang.Backend.ValueType.isF32(binaryen, localGetType)
          ? A.CAT_F32
          : A.CAT_RAW;
      break;
    }
    case binaryen.GlobalGetId: {
      var /** @const {string} */ globalGetName = /** @type {string} */ (expr['name']);
      var /** @const {number} */ globalGetType = state.globalTypes[globalGetName] || binaryen.i32;
      result = 'this.' + this.n_('$g_' + Wasm2Lang.Backend.JavaCodegen.javaSafeName_(globalGetName));
      resultCat = Wasm2Lang.Backend.ValueType.isF64(binaryen, globalGetType)
        ? A.CAT_F64
        : Wasm2Lang.Backend.ValueType.isF32(binaryen, globalGetType)
          ? A.CAT_F32
          : A.CAT_RAW;
      break;
    }

    case binaryen.BinaryId: {
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
          resultCat = A.catForCoercedType_(binaryen, numericBinInfo.retType);
        } else {
          result = '0 /* unknown binop ' + expr['op'] + ' */';
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
        var /** @const */ Pe = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
        result = '(' + Pe.renderInfix(cr(0), '==', '0', Pe.PREC_EQUALITY_) + ' ? 1 : 0)';
        resultCat = C.SIGNED;
      } else if (C.UNARY_CLZ === unCat) {
        result = 'Integer.numberOfLeadingZeros(' + cr(0) + ')';
        resultCat = C.SIGNED;
      } else if (C.UNARY_CTZ === unCat) {
        result = 'Integer.numberOfTrailingZeros(' + cr(0) + ')';
        resultCat = C.SIGNED;
      } else if (C.UNARY_POPCNT === unCat) {
        result = 'Integer.bitCount(' + cr(0) + ')';
        resultCat = C.SIGNED;
      } else {
        var /** @const {?Wasm2Lang.Backend.NumericOps.UnaryOpInfo} */ numericUnInfo =
            Wasm2Lang.Backend.NumericOps.classifyUnaryOp(binaryen, /** @type {number} */ (expr['op']));
        if (numericUnInfo) {
          result = this.renderNumericUnaryOp_(binaryen, numericUnInfo, cr(0), cc(0));
          resultCat = A.catForCoercedType_(binaryen, numericUnInfo.retType);
        } else {
          result = '0 /* unknown unop ' + expr['op'] + ' */';
          resultCat = A.CAT_RAW;
        }
      }
      break;
    }
    case binaryen.LoadId: {
      var /** @const {string} */ loadPtr = Wasm2Lang.Backend.JavaCodegen.renderPtrWithOffset_(
          cr(0),
          /** @type {number} */ (expr['offset'])
        );
      var /** @const {number} */ loadType = /** @type {number} */ (expr['type']);
      result = this.renderLoad_(binaryen, loadPtr, loadType, /** @type {number} */ (expr['bytes']), !!expr['isSigned']);
      resultCat = A.catForCoercedType_(binaryen, loadType);
      break;
    }
    case binaryen.StoreId: {
      var /** @const {number} */ storeType = /** @type {number} */ (expr['valueType']) || binaryen.i32;
      var /** @const {string} */ storePtr = Wasm2Lang.Backend.JavaCodegen.renderPtrWithOffset_(
          cr(0),
          /** @type {number} */ (expr['offset'])
        );
      result =
        pad(ind) + this.renderStore_(binaryen, storePtr, cr(1), storeType, /** @type {number} */ (expr['bytes']), cc(1)) + '\n';
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
      result =
        pad(ind) +
        'this.' +
        this.n_('$g_' + Wasm2Lang.Backend.JavaCodegen.javaSafeName_(globalName)) +
        ' = ' +
        this.coerceToType_(binaryen, cr(0), cc(0), globalType) +
        ';\n';
      break;
    }
    case binaryen.CallId: {
      var /** @const {string} */ callTarget = /** @type {string} */ (expr['target']);
      var /** @const {string} */ importBase = state.importedNames[callTarget] || '';
      var /** @const {!Array<string>} */ callArgs = this.buildCoercedCallArgs_(
          binaryen,
          expr,
          childResults,
          state.functionSignatures
        );
      var /** @const {number} */ callType = /** @type {number} */ (expr['type']);
      var /** @type {string} */ callExpr;
      if ('' !== importBase) {
        callExpr = this.renderImportCallExpr_(binaryen, importBase, callArgs, callType);
      } else {
        var /** @const {boolean} */ callIsExported = callTarget in state.exportNameMap;
        var /** @const {string} */ resolvedName = callIsExported ? state.exportNameMap[callTarget] : callTarget;
        var /** @const {string} */ callMethodName = callIsExported
            ? Wasm2Lang.Backend.JavaCodegen.javaSafeName_(resolvedName)
            : this.n_(Wasm2Lang.Backend.JavaCodegen.javaSafeName_(resolvedName));
        callExpr = callMethodName + '(' + callArgs.join(', ') + ')';
      }
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
      state.lastExprIsTerminal = true;
      break;

    case binaryen.DropId: {
      // Java only allows method calls, assignments, etc. as expression statements.
      // Emit only when the child is a call (side-effectful); skip pure expressions.
      var /** @const {number} */ dropValuePtr = /** @type {number} */ (expr['value']);
      var /** @const {number} */ dropValueId = dropValuePtr ? binaryen.getExpressionInfo(dropValuePtr).id : 0;
      if (dropValueId === binaryen.CallId || dropValueId === binaryen.CallIndirectId) {
        result = pad(ind) + cr(0) + ';\n';
      }
      break;
    }
    case binaryen.NopId:
    case binaryen.UnreachableId:
      break;

    case binaryen.SelectId: {
      var /** @const {number} */ selectType = /** @type {number} */ (expr['type']);
      var /** @const */ Ps = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
      result = this.renderCoercionByType_(
        binaryen,
        '(' + Ps.renderInfix(cr(0), '!=', '0', Ps.PREC_EQUALITY_) + ' ? ' + cr(1) + ' : ' + cr(2) + ')',
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
      var /** @const {string} */ loopBody = cr(0);
      if (hp(loopName, A.LF_FORLOOP_PREFIX_)) {
        result = pad(ind) + 'for (;;) {\n' + loopBody + pad(ind) + '}\n';
      } else if (hp(loopName, A.LC_CONTINUE_PREFIX_)) {
        result = pad(ind) + this.labelN_(state.labelMap, loopName) + ': for (;;) {\n' + loopBody + pad(ind) + '}\n';
      } else if (hp(loopName, A.LE_DOWHILE_PREFIX_)) {
        var /** @const {string} */ dwCondE = state.doWhileConditionStr;
        state.doWhileConditionStr = '';
        result = pad(ind) + 'do {\n' + loopBody + pad(ind) + '} while ' + this.formatCondition_(dwCondE) + ';\n';
      } else if (hp(loopName, A.LD_DOWHILE_PREFIX_)) {
        var /** @const {string} */ dwCond = state.doWhileConditionStr;
        state.doWhileConditionStr = '';
        result =
          pad(ind) +
          this.labelN_(state.labelMap, loopName) +
          ': do {\n' +
          loopBody +
          pad(ind) +
          '} while ' +
          this.formatCondition_(dwCond) +
          ';\n';
      } else if (hp(loopName, A.LY_WHILE_PREFIX_)) {
        var /** @const {string} */ whCondY = state.whileConditionStr;
        state.whileConditionStr = '';
        result = pad(ind) + 'while ' + this.formatCondition_(whCondY) + ' {\n' + loopBody + pad(ind) + '}\n';
      } else if (hp(loopName, A.LW_WHILE_PREFIX_)) {
        var /** @const {string} */ whCond = state.whileConditionStr;
        state.whileConditionStr = '';
        result =
          pad(ind) +
          this.labelN_(state.labelMap, loopName) +
          ': while ' +
          this.formatCondition_(whCond) +
          ' {\n' +
          loopBody +
          pad(ind) +
          '}\n';
      } else {
        // Named body blocks can complete normally via `break $blockName`,
        // so the trailing `break;` is always reachable and required.
        var /** @const {number} */ loopBodyPtr = /** @type {number} */ (expr['body']);
        var /** @const {!Object<string, *>} */ loopBodyInfo = /** @type {!Object<string, *>} */ (
            binaryen.getExpressionInfo(loopBodyPtr)
          );
        var /** @const {boolean} */ bodyBlockIsNamed =
            /** @type {number} */ (loopBodyInfo['id']) === binaryen.BlockId && !!loopBodyInfo['name'];
        var /** @const {boolean} */ needsTrailingBreak = bodyBlockIsNamed || !bodyWasTerminal;
        result =
          pad(ind) +
          this.labelN_(state.labelMap, loopName) +
          ': while (true) {\n' +
          loopBody +
          (needsTrailingBreak ? pad(ind + 1) + 'break;\n' : '') +
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
          state.lastExprIsTerminal = true;
          break;
        }
        if (brName === state.rootSwitchRsName) {
          var /** @const {string} */ rsBreakStmt = this.renderLabeledJump_(state.labelMap, 'break', state.rootSwitchLoopName);
          result = this.emitConditionalStatement_(ind, brCondPtr, cr(0), rsBreakStmt);
          if (0 === brCondPtr) {
            state.lastExprIsTerminal = true;
          }
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
      if (0 === brCondPtr) {
        state.lastExprIsTerminal = true;
      }
      break;
    }
    case binaryen.SwitchId: {
      var /** @const {!Array<string>} */ switchNames = /** @type {!Array<string>} */ (expr['names'] || []);
      var /** @const {string} */ switchDefault = /** @type {string} */ (expr['defaultName'] || '');
      var /** @const {!Array<string>} */ switchLines = [];
      switchLines[switchLines.length] = pad(ind) + 'switch (' + cr(0) + ') {\n';
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
      state.lastExprIsTerminal = '' !== switchDefault;
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
 * Emits a flat switch statement for a br_table dispatch block.
 *
 * @private
 * @param {!Wasm2Lang.Backend.JavaCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitFlatSwitch_ = function (state, nodeCtx) {
  var /** @const */ fsResult = this.emitLabeledFlatSwitch_(state, nodeCtx);
  state.lastExprIsTerminal = fsResult.hasDefault;
  return fsResult.result;
};

/**
 * Emits a root-switch-loop structure where the outer block wrappers are
 * eliminated and exit code is inlined into the switch cases.
 *
 * @private
 * @param {!Wasm2Lang.Backend.JavaCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitRootSwitch_ = function (state, nodeCtx) {
  return this.emitLabeledRootSwitch_(state, nodeCtx);
};

/**
 * Enter callback: records label kinds and adjusts indent for scope nodes.
 *
 * @private
 * @param {!Wasm2Lang.Backend.JavaCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitEnter_ = function (state, nodeCtx) {
  return this.emitLabeledEnter_(state, nodeCtx);
};

// ---------------------------------------------------------------------------
// Function emission.
// ---------------------------------------------------------------------------

/**
 * Emits a single Java method body.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Object<string, string>} importedNames
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} functionSignatures
 * @param {!Object<string, number>} globalTypes
 * @param {!Object<string, string>} exportNameMap
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitFunction_ = function (
  wasmModule,
  binaryen,
  funcInfo,
  importedNames,
  functionSignatures,
  globalTypes,
  exportNameMap
) {
  var /** @const {!Array<string>} */ parts = [];
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);
  var /** @const {boolean} */ isExported = funcInfo.name in exportNameMap;
  var /** @const {string} */ fnName = isExported
      ? Wasm2Lang.Backend.JavaCodegen.javaSafeName_(exportNameMap[funcInfo.name])
      : this.n_(Wasm2Lang.Backend.JavaCodegen.javaSafeName_(funcInfo.name));
  var /** @const {string} */ visibility = isExported ? '' : 'private ';
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(funcInfo.params);
  var /** @const {number} */ numParams = paramTypes.length;
  var /** @const {!Array<number>} */ varTypes = /** @type {!Array<number>} */ (funcInfo.vars) || [];
  var /** @const {number} */ numVars = varTypes.length;
  var /** @const {string} */ returnType = Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, funcInfo.results);

  // Method header (indent 1 = inside class).
  var /** @const {!Array<string>} */ paramDecls = [];
  for (var /** number */ pi = 0; pi !== numParams; ++pi) {
    paramDecls[paramDecls.length] =
      Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, paramTypes[pi]) + ' ' + this.localN_(pi);
  }
  parts[parts.length] = pad1 + visibility + returnType + ' ' + fnName + '(' + paramDecls.join(', ') + ') {';

  // Local variable declarations.
  for (var /** number */ vi = 0; vi !== numVars; ++vi) {
    var /** @const {number} */ localType = varTypes[vi];
    parts[parts.length] =
      pad2 +
      Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, localType) +
      ' ' +
      this.localN_(numParams + vi) +
      ' = ' +
      this.renderLocalInit_(binaryen, localType) +
      ';';
  }

  // Walk the body with the code-gen visitor.
  if (0 !== funcInfo.body) {
    var /** @const {!Wasm2Lang.Backend.JavaCodegen.EmitState_} */ emitState = {
        binaryen: binaryen,
        functionInfo: funcInfo,
        functionSignatures: functionSignatures,
        globalTypes: globalTypes,
        labelKinds: /** @type {!Object<string, string>} */ (Object.create(null)),
        labelMap: /** @type {!Object<string, number>} */ (Object.create(null)),
        importedNames: importedNames,
        exportNameMap: exportNameMap,
        indent: 2,
        lastExprIsTerminal: false,
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

  parts[parts.length] = pad1 + '}';
  return parts.join('\n');
};

// ---------------------------------------------------------------------------
// Conditional helper emission.
// ---------------------------------------------------------------------------

/**
 * Emits only the helpers that were referenced during function body emission.
 *
 * @private
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitHelpers_ = function () {
  var /** @const {!Array<string>} */ lines = [];
  var /** @const {!Object<string, boolean>} */ used = this.usedHelpers_ || {};
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);
  var /** @const {string} */ l0 = this.localN_(0);

  if (used['$w2l_trunc_f64']) {
    lines[lines.length] = pad1 + 'static double ' + this.n_('$w2l_trunc_f64') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return ' + l0 + ' < 0.0 ? Math.ceil(' + l0 + ') : Math.floor(' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_f32']) {
    lines[lines.length] = pad1 + 'static float ' + this.n_('$w2l_trunc_f32') + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return (float)' + this.n_('$w2l_trunc_f64') + '((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_nearest_f64']) {
    lines[lines.length] = pad1 + 'static double ' + this.n_('$w2l_nearest_f64') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return Math.rint(' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_nearest_f32']) {
    lines[lines.length] = pad1 + 'static float ' + this.n_('$w2l_nearest_f32') + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return (float)Math.rint((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_trunc_u_f64_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_u_f64_to_i32') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 2147483648.0) return (int)(' + l0 + ' - 2147483648.0) + -2147483648;';
    lines[lines.length] = pad2 + 'return (int)' + l0 + ';';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_u_f32_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_u_f32_to_i32') + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return ' + this.n_('$w2l_trunc_u_f64_to_i32') + '((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_trunc_sat_s_f64_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_sat_s_f64_to_i32') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'if (Double.isNaN(' + l0 + ')) return 0;';
    lines[lines.length] = pad2 + l0 + ' = ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 2147483648.0) return 2147483647;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' <= -2147483649.0) return -2147483648;';
    lines[lines.length] = pad2 + 'return (int)' + l0 + ';';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_u_f64_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_sat_u_f64_to_i32') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'if (Double.isNaN(' + l0 + ')) return 0;';
    lines[lines.length] = pad2 + l0 + ' = ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 4294967296.0) return -1;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' < 0.0) return 0;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 2147483648.0) return (int)(' + l0 + ' - 2147483648.0) + -2147483648;';
    lines[lines.length] = pad2 + 'return (int)' + l0 + ';';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_s_f32_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_sat_s_f32_to_i32') + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return ' + this.n_('$w2l_trunc_sat_s_f64_to_i32') + '((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_u_f32_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_sat_u_f32_to_i32') + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return ' + this.n_('$w2l_trunc_sat_u_f64_to_i32') + '((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_convert_u_i32_to_f32']) {
    lines[lines.length] = pad1 + 'static float ' + this.n_('$w2l_convert_u_i32_to_f32') + '(int ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return (float)Integer.toUnsignedLong(' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_convert_u_i32_to_f64']) {
    lines[lines.length] = pad1 + 'static double ' + this.n_('$w2l_convert_u_i32_to_f64') + '(int ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return (double)Integer.toUnsignedLong(' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  return lines;
};

// ---------------------------------------------------------------------------
// Full code emission.
// ---------------------------------------------------------------------------

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<!Wasm2Lang.OutputSink.ChunkEntry>}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitCode = function (wasmModule, options) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} */ moduleInfo =
      this.collectModuleCodegenInfo_(wasmModule);
  var /** @const {!Array<string>} */ outputParts = [];
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);

  // Class declaration — capitalise first letter, prefix with Wasm to avoid
  // collisions with java.lang.Module and other JDK classes.
  var /** @const {string} */ className = 'Wasm' + moduleName.charAt(0).toUpperCase() + moduleName.substring(1);
  outputParts[outputParts.length] = 'class ' + className + ' {';

  // Buffer field.
  outputParts[outputParts.length] = pad1 + 'java.nio.ByteBuffer ' + this.n_('buffer') + ';';

  // Import fields — stored as Object, cast at call sites.
  for (var /** number */ i = 0, /** @const {number} */ importCount = moduleInfo.impFuncs.length; i !== importCount; ++i) {
    outputParts[outputParts.length] =
      pad1 +
      'Object ' +
      this.n_('$if_' + Wasm2Lang.Backend.JavaCodegen.javaSafeName_(moduleInfo.impFuncs[i].importBaseName)) +
      ';';
  }

  // Global fields.
  for (var /** number */ gi = 0, /** @const {number} */ gLen = moduleInfo.globals.length; gi !== gLen; ++gi) {
    var /** @const {string} */ gName = Wasm2Lang.Backend.JavaCodegen.javaSafeName_(moduleInfo.globals[gi].globalName);
    var /** @const {string} */ gType = Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, moduleInfo.globals[gi].globalType);
    outputParts[outputParts.length] =
      pad1 + gType + ' ' + this.n_('$g_' + gName) + ' = ' + moduleInfo.globals[gi].globalInitValue + ';';
  }

  // Constructor accepting foreign imports and buffer.
  var /** @const {string} */ bufferParamName = this.n_('buffer');
  outputParts[outputParts.length] =
    pad1 + className + '(java.util.Map<String, Object> foreign, java.nio.ByteBuffer ' + bufferParamName + ') {';
  outputParts[outputParts.length] = pad2 + 'this.' + bufferParamName + ' = ' + bufferParamName + ';';
  for (var /** number */ ci = 0; ci !== importCount; ++ci) {
    var /** @const {string} */ importSafe = Wasm2Lang.Backend.JavaCodegen.javaSafeName_(moduleInfo.impFuncs[ci].importBaseName);
    outputParts[outputParts.length] =
      pad2 + 'this.' + this.n_('$if_' + importSafe) + ' = foreign.get("' + moduleInfo.impFuncs[ci].importBaseName + '");';
  }
  outputParts[outputParts.length] = pad1 + '}';

  // Build internalName → exportName map so exported methods use their
  // public export name and non-exported methods stay private.
  var /** @const {!Object<string, string>} */ exportNameMap = /** @type {!Object<string, string>} */ (Object.create(null));
  for (var /** number */ ei = 0, /** @const {number} */ eLen = moduleInfo.expFuncs.length; ei !== eLen; ++ei) {
    exportNameMap[moduleInfo.expFuncs[ei].internalName] = moduleInfo.expFuncs[ei].exportName;
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
      moduleInfo.globalTypes,
      exportNameMap
    );
  }

  // Helper methods (only those referenced by function bodies).
  var /** @const {!Array<string>} */ helperLines = this.emitHelpers_();
  this.usedHelpers_ = null;
  for (var /** number */ hi = 0, /** @const {number} */ helperCount = helperLines.length; hi !== helperCount; ++hi) {
    outputParts[outputParts.length] = helperLines[hi];
  }

  // Append function bodies.
  for (var /** number */ fi = 0, /** @const {number} */ fpLen = functionParts.length; fi !== fpLen; ++fi) {
    outputParts[outputParts.length] = functionParts[fi];
  }

  outputParts[outputParts.length] = '}';

  // Traversal summary.
  // prettier-ignore
  outputParts[outputParts.length] = /** @type {string} */ (Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode.call(this, wasmModule, options));

  return Wasm2Lang.OutputSink.interleaveNewlines(outputParts);
};
