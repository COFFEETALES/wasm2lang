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

// ---------------------------------------------------------------------------
// Reserved words and mangler profile.
// ---------------------------------------------------------------------------

/** @const {!Object<string, boolean>} */
Wasm2Lang.Backend.Php64Codegen.RESERVED_ = Wasm2Lang.Backend.buildReservedSet([
  'abstract',
  'and',
  'array',
  'as',
  'break',
  'callable',
  'case',
  'catch',
  'class',
  'clone',
  'const',
  'continue',
  'declare',
  'default',
  'die',
  'do',
  'echo',
  'else',
  'elseif',
  'empty',
  'enddeclare',
  'endfor',
  'endforeach',
  'endif',
  'endswitch',
  'endwhile',
  'eval',
  'exit',
  'extends',
  'false',
  'final',
  'finally',
  'fn',
  'for',
  'foreach',
  'function',
  'global',
  'goto',
  'if',
  'implements',
  'include',
  'include_once',
  'instanceof',
  'insteadof',
  'interface',
  'isset',
  'list',
  'match',
  'namespace',
  'new',
  'null',
  'or',
  'print',
  'private',
  'protected',
  'public',
  'readonly',
  'require',
  'require_once',
  'return',
  'static',
  'switch',
  'throw',
  'trait',
  'true',
  'try',
  'unset',
  'use',
  'var',
  'while',
  'xor',
  'yield'
]);

Wasm2Lang.Backend.registerManglerProfile('php64', {
  reservedWords: Wasm2Lang.Backend.Php64Codegen.RESERVED_,
  singleCharset: 'abcdefghijklmnopqrstuvwxyz_',
  blockCharset: 'abcdefghijklmnopqrstuvwxyz_0123456789',
  caseInsensitive: true
});

// ---------------------------------------------------------------------------
// Mangler integration.
// ---------------------------------------------------------------------------

/**
 * Returns a PHP variable name (with {@code $} sigil) for a module-scope
 * identifier.  When unmangled, the key may already start with {@code $}
 * (e.g. {@code "$g_foo"}).  When mangled, the result never starts with
 * {@code $}.  This helper ensures exactly one leading {@code $}.
 *
 * @private
 * @param {string} key  Module-scope identifier key.
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.phpVar_ = function (key) {
  var /** @const {string} */ name = this.n_(key);
  return '$' === name.charAt(0) ? name : '$' + name;
};

/**
 * @override
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.getFixedModuleBindings_ = function (options) {
  void options;
  return ['buffer', '_w2l_i', '_w2l_f32'];
};

/** @private @const {number} */
Wasm2Lang.Backend.Php64Codegen.TEMP_P_ = 0;

/** @private @const {number} */
Wasm2Lang.Backend.Php64Codegen.TEMP_S_ = 1;

/** @private @const {number} */
Wasm2Lang.Backend.Php64Codegen.TEMP_V_ = 2;

/**
 * @override
 * @return {number}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.getInlineTempCount_ = function () {
  return 3;
};

/**
 * @override
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.getAllHelperNames_ = function () {
  return [
    '_w2l_clz',
    '_w2l_copysign_f32',
    '_w2l_copysign_f64',
    '_w2l_convert_u_i32_to_f32',
    '_w2l_convert_u_i32_to_f64',
    '_w2l_ctz',
    '_w2l_imul',
    '_w2l_nearest_f32',
    '_w2l_nearest_f64',
    '_w2l_popcnt',
    '_w2l_reinterpret_f32_to_i32',
    '_w2l_reinterpret_i32_to_f32',
    '_w2l_trunc_f32',
    '_w2l_trunc_f64',
    '_w2l_trunc_s_f32_to_i32',
    '_w2l_trunc_s_f64_to_i32',
    '_w2l_trunc_sat_s_f32_to_i32',
    '_w2l_trunc_sat_s_f64_to_i32',
    '_w2l_trunc_sat_u_f32_to_i32',
    '_w2l_trunc_sat_u_f64_to_i32',
    '_w2l_trunc_u_f32_to_i32',
    '_w2l_trunc_u_f64_to_i32'
  ];
};

/**
 * Returns a local variable name with PHP {@code $} sigil.  When the mangler
 * is active the mangled name is prefixed with {@code $}; otherwise the
 * default {@code $l{index}} form already starts with {@code $}.
 *
 * @override
 * @param {number} index
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.localN_ = function (index) {
  if (this.mangler_) {
    return '$' + this.mangler_.ln(index);
  }
  return '$l' + index;
};

/**
 * @override
 * @param {string} globalName
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.buildGlobalIdentifier_ = function (globalName) {
  return '$g_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(globalName);
};

/**
 * @override
 * @param {string} importBaseName
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.buildImportIdentifier_ = function (importBaseName) {
  return '$if_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(importBaseName);
};

/**
 * @override
 * @param {string} funcName
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.buildFunctionIdentifier_ = function (funcName) {
  return Wasm2Lang.Backend.Php64Codegen.phpSafeName_(funcName);
};

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
  var /** @const {!Array<string>|void} */ deps = Wasm2Lang.Backend.Php64Codegen.HELPER_DEPS_[name];
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
  return this.n_('_w2l_i') + '(' + P.renderInfix(L, info.opStr, R, P.PREC_ADDITIVE_) + ')';
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
  return this.n_('_w2l_imul') + '(' + L + ', ' + R + ')';
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
  var /** @const {string} */ nI = this.n_('_w2l_i');
  if ('/' === info.opStr) {
    if (info.unsigned) {
      return (
        nI +
        '(intdiv(' +
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(L) +
        ', ' +
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(R) +
        '))'
      );
    }
    return nI + '(intdiv(' + L + ', ' + R + '))';
  }
  // Remainder (%).
  if (info.unsigned) {
    return (
      nI +
      '(' +
      P.renderInfix(
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(L),
        '%',
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(R),
        P.PREC_MULTIPLICATIVE_
      ) +
      ')'
    );
  }
  return nI + '(' + P.renderInfix(L, '%', R, P.PREC_MULTIPLICATIVE_) + ')';
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
  var /** @const {string} */ nI = this.n_('_w2l_i');
  if ('>>>' === info.opStr) {
    // Unsigned right shift (not native in PHP).
    return (
      nI +
      '(' +
      P.renderInfix(
        Wasm2Lang.Backend.Php64Codegen.renderMask32_(L),
        '>>',
        Wasm2Lang.Backend.Php64Codegen.renderShiftMask_(R),
        P.PREC_SHIFT_
      ) +
      ')'
    );
  }
  if ('<<' === info.opStr) {
    return nI + '(' + P.renderInfix(L, '<<', Wasm2Lang.Backend.Php64Codegen.renderShiftMask_(R), P.PREC_SHIFT_) + ')';
  }
  if ('>>' === info.opStr) {
    return nI + '(' + P.renderInfix(L, '>>', Wasm2Lang.Backend.Php64Codegen.renderShiftMask_(R), P.PREC_SHIFT_) + ')';
  }
  // &, |, ^
  return P.renderInfix(
    L,
    info.opStr,
    R,
    '&' === info.opStr ? P.PREC_BIT_AND_ : '^' === info.opStr ? P.PREC_BIT_XOR_ : P.PREC_BIT_OR_,
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
  var /** @const {string} */ nI = this.n_('_w2l_i');
  var /** @const {string} */ shiftMask = Wasm2Lang.Backend.Php64Codegen.renderShiftMask_(R);
  var /** @const {string} */ reverseShift = P.renderInfix('32', '-', shiftMask, P.PREC_ADDITIVE_);

  if (info.rotateLeft) {
    return (
      nI +
      '(' +
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
    nI +
    '(' +
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
  return '(' + P.renderInfix(leftExpr, info.opStr, rightExpr, P.PREC_RELATIONAL_) + ' ? 1 : 0)';
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
 *   lbl: string,
 *   lk: string,
 *   alias: (string|undefined)
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
 *   inlineTempOffset: number,
 *   labelStack: !Array<!Wasm2Lang.Backend.Php64Codegen.LabelEntry_>,
 *   importedNames: !Object<string, string>,
 *   indent: number,
 *   wasmModule: !BinaryenModule,
 *   visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor,
 *   pendingBlockFusion: string,
 *   doWhileBodyPtrs: !Object<string, boolean>,
 *   doWhileConditionStr: string,
 *   whileBodyPtrs: !Object<string, boolean>,
 *   whileConditionStr: string,
 *   rootSwitchExitMap: ?Object<string, !Array<number>>,
 *   rootSwitchRsName: string,
 *   rootSwitchLoopName: string
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
  return Wasm2Lang.Backend.AbstractCodegen.resolveReservedIdentifier_(
    Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(name.replace(/[^a-zA-Z0-9_]/g, '_')),
    Wasm2Lang.Backend.Php64Codegen.RESERVED_,
    true
  );
};

/**
 * Wraps an expression string with the i32 coercion helper unless it is a
 * numeric constant that already fits in the i32 range.
 *
 * @private
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.wrapI32_ = function (expr) {
  if (Wasm2Lang.Backend.I32Coercion.isConstant(expr)) return expr;
  var /** @const {string} */ helperName = this.n_('_w2l_i');
  var /** @const {string} */ prefix = helperName + '(';
  // Avoid double-wrapping: if the expression is already a helper call,
  // it is already i32-truncated.
  var /** @const {number} */ len = expr.length;
  var /** @const {number} */ prefixLen = prefix.length;
  if (
    len > prefixLen &&
    prefix === expr.slice(0, prefixLen) &&
    ')' === expr.charAt(len - 1) &&
    Wasm2Lang.Backend.AbstractCodegen.Precedence_.isFullyParenthesized(expr.slice(prefixLen - 1))
  ) {
    return expr;
  }
  return prefix + expr + ')';
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
    return this.wrapI32_(expr);
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return this.n_('_w2l_f32') + '(' + expr + ')';
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    if (0 === expr.indexOf('(float)')) return expr;
    return '(float)(' + expr + ')';
  }
  return expr;
};

/**
 * PHP helpers declare typed return values (`: int`, `: float`), so the
 * coercion wrapper that the base implementation adds is always redundant.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} helperName
 * @param {!Array<string>} args
 * @param {number} resultType
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderHelperCall_ = function (binaryen, helperName, args, resultType) {
  this.markHelper_(helperName);
  return this.n_(helperName) + '(' + args.join(', ') + ')';
};

/**
 * PHP float is always f64 — an f32-clipped value is still a PHP float, so
 * CAT_F32 satisfies an f64 target without an additional cast.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} cat
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.coerceToType_ = function (binaryen, expr, cat, wasmType) {
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
 * @param {number=} opt_valueCat
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.renderNumericUnaryOp_ = function (binaryen, info, valueExpr, opt_valueCat) {
  var /** @const {string} */ name = info.opName;
  var /** @const {boolean} */ isF32 = Wasm2Lang.Backend.ValueType.isF32(binaryen, info.operandType);
  var /** @const {string} */ nI = this.n_('_w2l_i');
  var /** @const {string} */ nF32 = this.n_('_w2l_f32');

  if ('abs' === name || 'ceil' === name || 'floor' === name || 'sqrt' === name) {
    if (isF32) {
      return nF32 + '(' + name + '(' + this.renderCoercionByType_(binaryen, valueExpr, info.operandType) + '))';
    }
    return name + '(' + this.renderCoercionByType_(binaryen, valueExpr, info.operandType) + ')';
  }

  if ('convert_s_i32_to_f32' === name) {
    return nF32 + '(' + nI + '(' + valueExpr + '))';
  }
  if ('convert_s_i32_to_f64' === name) {
    return '(float)' + nI + '(' + valueExpr + ')';
  }

  if ('demote_f64_to_f32' === name) {
    return nF32 + '(' + this.renderCoercionByType_(binaryen, valueExpr, info.operandType) + ')';
  }
  if ('promote_f32_to_f64' === name) {
    // PHP float is f64 — the f32 operand is already a PHP float, promotion is a no-op.
    return valueExpr;
  }

  // f64/f32 neg: negation of a float is always float — WASM typing guarantees
  // the operand is already the correct float type, skip the coercion wrapper.
  if ('neg' === name) {
    var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    return isF32 ? nF32 + '(' + P.renderPrefix('-', valueExpr) + ')' : P.renderPrefix('-', valueExpr);
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
Wasm2Lang.Backend.Php64Codegen.prototype.renderNumericBinaryOp_ = function (binaryen, info, L, R) {
  if ('min' === info.opName || 'max' === info.opName) {
    var /** @const {string} */ fn = info.opName;
    if (Wasm2Lang.Backend.ValueType.isF32(binaryen, info.retType)) {
      return this.n_('_w2l_f32') + '(' + fn + '((float)(' + L + '), (float)(' + R + ')))';
    }
    return (
      fn +
      '(' +
      this.renderCoercionByType_(binaryen, L, info.retType) +
      ', ' +
      this.renderCoercionByType_(binaryen, R, info.retType) +
      ')'
    );
  }

  // f64 arithmetic: coerce operands individually — PHP float arithmetic
  // preserves the float type, so the outer (float) wrap is unnecessary.
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, info.retType) && !info.isComparison && '' !== info.opStr) {
    var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    var /** @type {number} */ precedence = P.PREC_ADDITIVE_;
    if ('mul' === info.opName || 'div' === info.opName) {
      precedence = P.PREC_MULTIPLICATIVE_;
    }
    return P.renderInfix(
      this.renderCoercionByType_(binaryen, L, info.retType),
      info.opStr,
      this.renderCoercionByType_(binaryen, R, info.retType),
      precedence
    );
  }

  return Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericBinaryOp_.call(this, binaryen, info, L, R);
};

// renderNumericComparisonResult_: inherited from AbstractCodegen (ternary ? 1 : 0).

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
Wasm2Lang.Backend.Php64Codegen.prototype.renderPtrWithOffset_ = function (baseExpr, offset) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (0 === offset) return baseExpr;
  return this.n_('_w2l_i') + '(' + P.renderInfix(baseExpr, '+', String(offset), P.PREC_ADDITIVE_) + ')';
};

// formatCondition_: inherited from AbstractCodegen (delegates to Precedence_).

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
  var /** @const */ hp = A.hasPrefix_;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @type {number} */ resultCat = A.CAT_VOID;
  var /** @const */ self = this;
  /** @param {number} tempIndex @return {string} */
  var inlineTemp = function (tempIndex) {
    return self.localN_(state.inlineTempOffset + tempIndex);
  };

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
          : A.CAT_F64;
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
      result = this.phpVar_('$g_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(globalGetName));
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
          // f64 arithmetic/min/max: coerce operands individually using categories
          // so that known-float operands (locals, consts, loads) skip the cast.
          var /** @const {boolean} */ isF64Ret = Wasm2Lang.Backend.ValueType.isF64(binaryen, numericBinInfo.retType);
          var /** @const {boolean} */ isF32Ret = Wasm2Lang.Backend.ValueType.isF32(binaryen, numericBinInfo.retType);
          var /** @const {string} */ numBinOpName = numericBinInfo.opName;
          // Float min/max: coerce operands with categories so that known-float
          // operands (locals, consts, loads, helper results) skip the cast.
          if ((isF64Ret || isF32Ret) && ('min' === numBinOpName || 'max' === numBinOpName)) {
            var /** @const {string} */ mmInner =
                numBinOpName +
                '(' +
                this.coerceToType_(binaryen, cr(0), cc(0), numericBinInfo.retType) +
                ', ' +
                this.coerceToType_(binaryen, cr(1), cc(1), numericBinInfo.retType) +
                ')';
            result = isF32Ret ? this.n_('_w2l_f32') + '(' + mmInner + ')' : mmInner;
          } else if (isF64Ret && !numericBinInfo.isComparison) {
            if ('' !== numericBinInfo.opStr) {
              var /** @type {number} */ f64Prec = A.Precedence_.PREC_ADDITIVE_;
              if ('mul' === numBinOpName || 'div' === numBinOpName) {
                f64Prec = A.Precedence_.PREC_MULTIPLICATIVE_;
              }
              result = A.Precedence_.renderInfix(
                this.coerceToType_(binaryen, cr(0), cc(0), numericBinInfo.retType),
                numericBinInfo.opStr,
                this.coerceToType_(binaryen, cr(1), cc(1), numericBinInfo.retType),
                f64Prec
              );
            } else {
              // copysign — delegate to renderNumericBinaryOp_.
              result = this.renderNumericBinaryOp_(binaryen, numericBinInfo, cr(0), cr(1));
            }
          } else {
            result = this.renderNumericBinaryOp_(binaryen, numericBinInfo, cr(0), cr(1));
          }
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
        var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
        result = '(' + P.renderInfix('0', '===', cr(0), P.PREC_EQUALITY_) + ' ? 1 : 0)';
        resultCat = C.SIGNED;
      } else if (C.UNARY_CLZ === unCat) {
        this.markHelper_('_w2l_clz');
        result = this.n_('_w2l_clz') + '(' + cr(0) + ')';
        resultCat = C.SIGNED;
      } else if (C.UNARY_CTZ === unCat) {
        this.markHelper_('_w2l_ctz');
        result = this.n_('_w2l_ctz') + '(' + cr(0) + ')';
        resultCat = C.SIGNED;
      } else if (C.UNARY_POPCNT === unCat) {
        this.markHelper_('_w2l_popcnt');
        result = this.n_('_w2l_popcnt') + '(' + cr(0) + ')';
        resultCat = C.SIGNED;
      } else {
        var /** @const {?Wasm2Lang.Backend.NumericOps.UnaryOpInfo} */ numericUnInfo =
            Wasm2Lang.Backend.NumericOps.classifyUnaryOp(binaryen, /** @type {number} */ (expr['op']));
        if (numericUnInfo) {
          // f64 abs/ceil/floor/sqrt/demote: coerce operand using category so
          // that known-float operands skip the redundant (float) cast.
          var /** @const {string} */ unOpName = numericUnInfo.opName;
          if (
            Wasm2Lang.Backend.ValueType.isF64(binaryen, numericUnInfo.operandType) &&
            ('abs' === unOpName || 'ceil' === unOpName || 'floor' === unOpName || 'sqrt' === unOpName)
          ) {
            result = unOpName + '(' + this.coerceToType_(binaryen, cr(0), cc(0), numericUnInfo.operandType) + ')';
          } else if (
            Wasm2Lang.Backend.ValueType.isF64(binaryen, numericUnInfo.operandType) &&
            'demote_f64_to_f32' === unOpName
          ) {
            result = this.n_('_w2l_f32') + '(' + this.coerceToType_(binaryen, cr(0), cc(0), numericUnInfo.operandType) + ')';
          } else {
            result = this.renderNumericUnaryOp_(binaryen, numericUnInfo, cr(0));
          }
          resultCat = A.catForCoercedType_(binaryen, numericUnInfo.retType);
        } else {
          result = '0 /* unknown unop ' + expr['op'] + ' */';
          resultCat = A.CAT_RAW;
        }
      }
      break;
    }
    case binaryen.LoadId: {
      var /** @const {string} */ loadPtr = this.renderPtrWithOffset_(cr(0), /** @type {number} */ (expr['offset']));
      var /** @const {number} */ loadBytes = /** @type {number} */ (expr['bytes']);
      var /** @const {boolean} */ loadSigned = !!expr['isSigned'];
      var /** @const {number} */ loadType = /** @type {number} */ (expr['type']);
      var /** @const {string} */ nBuf = this.phpVar_('buffer');

      if (Wasm2Lang.Backend.ValueType.isF64(binaryen, loadType)) {
        result = "unpack('e', " + nBuf + ', ' + loadPtr + ')[1]';
      } else if (Wasm2Lang.Backend.ValueType.isF32(binaryen, loadType)) {
        result = this.n_('_w2l_f32') + "(unpack('g', " + nBuf + ', ' + loadPtr + ')[1])';
      } else if (4 === loadBytes) {
        result = this.n_('_w2l_i') + "(unpack('V', " + nBuf + ', ' + loadPtr + ')[1])';
      } else if (2 === loadBytes) {
        if (loadSigned) {
          var /** @const {string} */ tV16 = inlineTemp(Wasm2Lang.Backend.Php64Codegen.TEMP_V_);
          result =
            '((' + tV16 + " = unpack('v', " + nBuf + ', ' + loadPtr + ')[1]) > 32767 ? ' + tV16 + ' - 65536 : ' + tV16 + ')';
        } else {
          result = "unpack('v', " + nBuf + ', ' + loadPtr + ')[1]';
        }
      } else {
        if (loadSigned) {
          var /** @const {string} */ tV8 = inlineTemp(Wasm2Lang.Backend.Php64Codegen.TEMP_V_);
          result = '((' + tV8 + ' = ord(' + nBuf + '[' + loadPtr + '])) > 127 ? ' + tV8 + ' - 256 : ' + tV8 + ')';
        } else {
          result = 'ord(' + nBuf + '[' + loadPtr + '])';
        }
      }
      resultCat = A.catForCoercedType_(binaryen, loadType);
      break;
    }
    case binaryen.StoreId: {
      var /** @const {string} */ storePtr = this.renderPtrWithOffset_(cr(0), /** @type {number} */ (expr['offset']));
      var /** @const {number} */ storeBytes = /** @type {number} */ (expr['bytes']);
      var /** @const {number} */ storeType = /** @type {number} */ (expr['valueType']) || binaryen.i32;
      var /** @const {string} */ sBuf = this.phpVar_('buffer');

      var /** @const {string} */ tP = inlineTemp(Wasm2Lang.Backend.Php64Codegen.TEMP_P_);
      var /** @const {string} */ tS = inlineTemp(Wasm2Lang.Backend.Php64Codegen.TEMP_S_);
      if (Wasm2Lang.Backend.ValueType.isF64(binaryen, storeType)) {
        result =
          pad(ind) +
          tP +
          ' = ' +
          storePtr +
          '; ' +
          tS +
          " = pack('e', " +
          this.coerceToType_(binaryen, cr(1), cc(1), storeType) +
          '); ' +
          sBuf +
          '[' +
          tP +
          '] = ' +
          tS +
          '[0]; ' +
          sBuf +
          '[' +
          tP +
          ' + 1] = ' +
          tS +
          '[1]; ' +
          sBuf +
          '[' +
          tP +
          ' + 2] = ' +
          tS +
          '[2]; ' +
          sBuf +
          '[' +
          tP +
          ' + 3] = ' +
          tS +
          '[3]; ' +
          sBuf +
          '[' +
          tP +
          ' + 4] = ' +
          tS +
          '[4]; ' +
          sBuf +
          '[' +
          tP +
          ' + 5] = ' +
          tS +
          '[5]; ' +
          sBuf +
          '[' +
          tP +
          ' + 6] = ' +
          tS +
          '[6]; ' +
          sBuf +
          '[' +
          tP +
          ' + 7] = ' +
          tS +
          '[7];\n';
      } else if (Wasm2Lang.Backend.ValueType.isF32(binaryen, storeType)) {
        result =
          pad(ind) +
          tP +
          ' = ' +
          storePtr +
          '; ' +
          tS +
          " = pack('g', " +
          this.n_('_w2l_f32') +
          '(' +
          cr(1) +
          ')); ' +
          sBuf +
          '[' +
          tP +
          '] = ' +
          tS +
          '[0]; ' +
          sBuf +
          '[' +
          tP +
          ' + 1] = ' +
          tS +
          '[1]; ' +
          sBuf +
          '[' +
          tP +
          ' + 2] = ' +
          tS +
          '[2]; ' +
          sBuf +
          '[' +
          tP +
          ' + 3] = ' +
          tS +
          '[3];\n';
      } else if (4 === storeBytes) {
        result =
          pad(ind) +
          tP +
          ' = ' +
          storePtr +
          '; ' +
          tS +
          " = pack('V', " +
          this.coerceToType_(binaryen, cr(1), cc(1), binaryen.i32) +
          '); ' +
          sBuf +
          '[' +
          tP +
          '] = ' +
          tS +
          '[0]; ' +
          sBuf +
          '[' +
          tP +
          ' + 1] = ' +
          tS +
          '[1]; ' +
          sBuf +
          '[' +
          tP +
          ' + 2] = ' +
          tS +
          '[2]; ' +
          sBuf +
          '[' +
          tP +
          ' + 3] = ' +
          tS +
          '[3];\n';
      } else if (2 === storeBytes) {
        result =
          pad(ind) +
          tP +
          ' = ' +
          storePtr +
          '; ' +
          tS +
          " = pack('v', (" +
          this.coerceToType_(binaryen, cr(1), cc(1), binaryen.i32) +
          ') & 0xFFFF); ' +
          sBuf +
          '[' +
          tP +
          '] = ' +
          tS +
          '[0]; ' +
          sBuf +
          '[' +
          tP +
          ' + 1] = ' +
          tS +
          '[1];\n';
      } else {
        result =
          pad(ind) +
          sBuf +
          '[' +
          storePtr +
          '] = chr((' +
          this.coerceToType_(binaryen, cr(1), cc(1), binaryen.i32) +
          ') & 0xFF);\n';
      }
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
        this.phpVar_('$g_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(globalName)) +
        ' = ' +
        this.coerceToType_(binaryen, cr(0), cc(0), globalType) +
        ';\n';
      break;
    }
    case binaryen.CallId: {
      var /** @const {string} */ callTarget = /** @type {string} */ (expr['target']);
      var /** @const {string} */ importBase = state.importedNames[callTarget] || '';
      var /** @type {string} */ callName =
          '' !== importBase
            ? this.phpVar_('$if_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(importBase))
            : this.phpVar_(Wasm2Lang.Backend.Php64Codegen.phpSafeName_(callTarget));
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
      result = this.renderCoercionByType_(binaryen, '(' + cr(0) + ' ? ' + cr(1) + ' : ' + cr(2) + ')', selectType);
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
      var /** @const {boolean} */ isFusedBlock = !!blockName && hp(blockName, A.LB_FUSION_PREFIX_);
      var /** @const {string} */ blockPtrKey = String(nodeCtx.expressionPointer);
      var /** @const {boolean} */ isDWBody = blockPtrKey in state.doWhileBodyPtrs;
      if (isDWBody) {
        delete state.doWhileBodyPtrs[blockPtrKey];
      }
      var /** @const {boolean} */ isWhileBody = blockPtrKey in state.whileBodyPtrs;
      if (isWhileBody) {
        delete state.whileBodyPtrs[blockPtrKey];
      }
      var /** @const {boolean} */ hasTrailingCond = isDWBody || isWhileBody;
      var /** @const {number} */ childInd = blockName && !isFusedBlock ? ind + 1 : ind;
      var /** @const {number} */ emitCount =
          hasTrailingCond && 0 < childResults.length ? childResults.length - 1 : childResults.length;
      var /** @const {string} */ blockBody = A.assembleBlockChildren_(childResults, emitCount, childInd);
      if (isDWBody) {
        state.doWhileConditionStr = cr(childResults.length - 1);
      }
      if (isWhileBody) {
        state.whileConditionStr = cr(childResults.length - 1);
      }
      if (isFusedBlock) {
        result = blockBody;
      } else if (blockName) {
        result = pad(ind) + 'do {\n' + blockBody + pad(ind) + '} while (false);\n';
      } else {
        result = blockBody;
      }
      break;
    }
    case binaryen.LoopId: {
      var /** @const {string} */ loopName = /** @type {string} */ (expr['name']);
      if (hp(loopName, A.LF_FORLOOP_PREFIX_) || hp(loopName, A.LC_CONTINUE_PREFIX_)) {
        result = pad(ind) + 'while (true) {\n' + cr(0) + pad(ind) + '}\n';
      } else if (hp(loopName, A.LE_DOWHILE_PREFIX_) || hp(loopName, A.LD_DOWHILE_PREFIX_)) {
        var /** @const {string} */ dwCond = state.doWhileConditionStr;
        state.doWhileConditionStr = '';
        result = pad(ind) + 'do {\n' + cr(0) + pad(ind) + '} while ' + this.formatCondition_(dwCond) + ';\n';
      } else if (hp(loopName, A.LY_WHILE_PREFIX_) || hp(loopName, A.LW_WHILE_PREFIX_)) {
        var /** @const {string} */ whCond = state.whileConditionStr;
        state.whileConditionStr = '';
        result = pad(ind) + 'while ' + this.formatCondition_(whCond) + ' {\n' + cr(0) + pad(ind) + '}\n';
      } else {
        result = pad(ind) + 'while (true) {\n' + cr(0) + pad(ind + 1) + 'break;\n' + pad(ind) + '}\n';
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
            // Compute depth to the root-switch loop.
            var /** @type {number} */ rsLoopDepth = 0;
            for (var /** number */ rsi = state.labelStack.length - 1; 0 <= rsi; --rsi) {
              ++rsLoopDepth;
              if (state.labelStack[rsi].lbl === state.rootSwitchLoopName) {
                break;
              }
            }
            rsExitLines[rsExitLines.length] = pad(ind) + 'break' + (1 < rsLoopDepth ? ' ' + rsLoopDepth : '') + ';\n';
          }
          if (0 !== brCondPtr) {
            result = pad(ind) + 'if ' + this.formatCondition_(cr(0)) + ' {\n' + rsExitLines.join('') + pad(ind) + '}\n';
          } else {
            result = rsExitLines.join('');
          }
          break;
        }
        if (brName === state.rootSwitchRsName) {
          // Break to the rs$ block = break the loop.
          var /** @type {number} */ rsBreakDepth = 0;
          for (var /** number */ rsbi = state.labelStack.length - 1; 0 <= rsbi; --rsbi) {
            ++rsBreakDepth;
            if (state.labelStack[rsbi].lbl === state.rootSwitchLoopName) {
              break;
            }
          }
          var /** @const {string} */ rsBrStmt = 'break' + (1 < rsBreakDepth ? ' ' + rsBreakDepth : '') + ';\n';
          result = this.emitConditionalStatement_(ind, brCondPtr, cr(0), rsBrStmt);
          break;
        }
      }
      // Compute depth by scanning label stack from top.
      var /** @type {number} */ depth = 0;
      var /** @type {string} */ brKind = 'block';
      for (var /** number */ si = state.labelStack.length - 1; 0 <= si; --si) {
        ++depth;
        if (state.labelStack[si].lbl === brName) {
          brKind = state.labelStack[si].lk;
          break;
        }
        if (state.labelStack[si].alias === brName) {
          brKind = 'block';
          break;
        }
      }

      var /** @const {string} */ brStmt = ('loop' === brKind ? 'continue' : 'break') + (1 < depth ? ' ' + depth : '') + ';\n';
      result = this.emitConditionalStatement_(ind, brCondPtr, cr(0), brStmt);
      break;
    }
    case binaryen.SwitchId: {
      var /** @const {!Array<string>} */ switchNames = /** @type {!Array<string>} */ (expr['names'] || []);
      var /** @const {string} */ switchDefault = /** @type {string} */ (expr['defaultName'] || '');
      var /** @const {!Array<string>} */ switchLines = [];
      switchLines[switchLines.length] = pad(ind) + 'switch (' + cr(0) + ') {\n';
      var /** @type {number} */ swIdx = 0;
      while (swIdx < switchNames.length) {
        var /** @const {string} */ switchTarget = switchNames[swIdx];
        while (swIdx < switchNames.length && switchNames[swIdx] === switchTarget) {
          switchLines[switchLines.length] = pad(ind + 1) + 'case ' + swIdx + ':\n';
          ++swIdx;
        }
        var /** @type {number} */ swDepth = 0;
        var /** @type {string} */ swKind = 'block';
        for (var /** number */ swi = state.labelStack.length - 1; 0 <= swi; --swi) {
          ++swDepth;
          if (state.labelStack[swi].lbl === switchTarget) {
            swKind = state.labelStack[swi].lk;
            break;
          }
          if (state.labelStack[swi].alias === switchTarget) {
            swKind = 'block';
            break;
          }
        }
        switchLines[switchLines.length] =
          pad(ind + 2) + ('loop' === swKind ? 'continue' : 'break') + ' ' + (swDepth + 1) + ';\n';
      }
      if ('' !== switchDefault) {
        switchLines[switchLines.length] = pad(ind + 1) + 'default:\n';
        var /** @type {number} */ swDefDepth = 0;
        var /** @type {string} */ swDefKind = 'block';
        for (var /** number */ swdi = state.labelStack.length - 1; 0 <= swdi; --swdi) {
          ++swDefDepth;
          if (state.labelStack[swdi].lbl === switchDefault) {
            swDefKind = state.labelStack[swdi].lk;
            break;
          }
          if (state.labelStack[swdi].alias === switchDefault) {
            swDefKind = 'block';
            break;
          }
        }
        switchLines[switchLines.length] =
          pad(ind + 2) + ('loop' === swDefKind ? 'continue' : 'break') + ' ' + (swDefDepth + 1) + ';\n';
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
 * Emits a flat switch for a br_table dispatch block (PHP variant).
 *
 * PHP uses {@code break N} (numeric depth) instead of labeled breaks.  The
 * outer block becomes {@code do { switch (...) { ... } } while (false);} so
 * that {@code break 2;} inside a case exits both the switch and the do-while.
 *
 * @private
 * @param {!Wasm2Lang.Backend.Php64Codegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitFlatSwitch_ = function (state, nodeCtx) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {number} */ ind = state.indent;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ vis =
    /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor);
  // prettier-ignore
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.SwitchDispatchInfo_} */ info =
    /** @type {!Wasm2Lang.Backend.AbstractCodegen.SwitchDispatchInfo_} */ (
      A.extractSwitchDispatchStructure_(binaryen, nodeCtx.expressionPointer)
    );

  // The leave wrapper already popped the outer block from labelStack.
  // Re-push it as a single entry so that breaks targeting the outer name
  // resolve to depth 1 (= exit the switch).  No do-while wrapper needed
  // because the flat switch consumes the entire outer block with no tail code.
  state.labelStack[state.labelStack.length] = {lbl: info.outerName, lk: 'block'};

  // Sub-walk the switch condition.
  var /** @const {string} */ condStr = A.subWalkString_(
      A.subWalkExpression_(state.wasmModule, binaryen, state.functionInfo, vis, info.conditionPtr)
    );

  var /** @const {!Array<string>} */ lines = [];
  A.emitFlatSwitchHeader_(lines, ind, condStr, '', info);

  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_>} */ groups = info.caseGroups;
  for (var /** number */ gi = 0; gi < groups.length; ++gi) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_} */ group = groups[gi];
    var /** @const {!Array<number>} */ indices = group.indices;
    for (var /** number */ ii = 0; ii < indices.length; ++ii) {
      lines[lines.length] = pad(ind + 1) + 'case ' + indices[ii] + ':\n';
    }
    var /** @const {number} */ savedIndent = state.indent;
    state.indent = ind + 2;
    var /** @const {boolean} */ strippedBreak = A.emitSwitchCaseActions_(
        lines,
        state.wasmModule,
        binaryen,
        state.functionInfo,
        vis,
        group.actionPtrs,
        ind + 2,
        info.outerName
      );
    if (group.externalTarget) {
      // External target: emit break/continue with computed depth.
      // state.indent is still ind+2 so the sub-walked break inherits
      // the correct case-body indentation.
      var /** @const {string} */ etCode = A.subWalkString_(
          A.subWalkExpression_(
            state.wasmModule,
            binaryen,
            state.functionInfo,
            vis,
            state.wasmModule.break(group.externalTarget, 0, 0)
          )
        );
      if ('' !== etCode) {
        if (-1 === etCode.indexOf('\n')) {
          lines[lines.length] = pad(ind + 2) + etCode + ';\n';
        } else {
          lines[lines.length] = etCode;
        }
      }
    } else if (group.needsBreak || strippedBreak) {
      A.emitFlatSwitchBreak_(lines, ind + 2, '', info);
    }
    state.indent = savedIndent;
  }

  var /** @type {?Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_} */ defGroup = info.defaultGroup;
  if (defGroup) {
    lines[lines.length] = pad(ind + 1) + 'default:\n';
    var /** @const {number} */ savedIndent2 = state.indent;
    state.indent = ind + 2;
    var /** @const {boolean} */ strippedDefBreak = A.emitSwitchCaseActions_(
        lines,
        state.wasmModule,
        binaryen,
        state.functionInfo,
        vis,
        defGroup.actionPtrs,
        ind + 2,
        info.outerName
      );
    if (defGroup.externalTarget) {
      var /** @const {string} */ defEtCode = A.subWalkString_(
          A.subWalkExpression_(
            state.wasmModule,
            binaryen,
            state.functionInfo,
            vis,
            state.wasmModule.break(defGroup.externalTarget, 0, 0)
          )
        );
      if ('' !== defEtCode) {
        if (-1 === defEtCode.indexOf('\n')) {
          lines[lines.length] = pad(ind + 2) + defEtCode + ';\n';
        } else {
          lines[lines.length] = defEtCode;
        }
      }
    } else if (defGroup.needsBreak || strippedDefBreak) {
      A.emitFlatSwitchBreak_(lines, ind + 2, '', info);
    }
    state.indent = savedIndent2;
  }

  lines[lines.length] = pad(ind) + '}\n';

  // Remove the outer block entry we re-pushed.
  state.labelStack.pop();

  return lines.join('');
};

/**
 * Emits a root-switch-loop structure where the outer block wrappers are
 * eliminated and exit code is inlined into the switch cases.
 *
 * @private
 * @param {!Wasm2Lang.Backend.Php64Codegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitRootSwitch_ = function (state, nodeCtx) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ vis =
    /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor);
  // prettier-ignore
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.RootSwitchInfo_} */ info =
    /** @type {!Wasm2Lang.Backend.AbstractCodegen.RootSwitchInfo_} */ (
      A.extractRootSwitchStructure_(binaryen, nodeCtx.expressionPointer)
    );

  // Set up root-switch state for BreakId interception.
  state.rootSwitchExitMap = info.exitPaths;
  state.rootSwitchRsName = info.rsBlockName;
  state.rootSwitchLoopName = info.loopName;

  // Sub-walk the loop — its enter/leave produce the complete loop code
  // (the loop enter pushes to labelStack, the loop leave pops it).
  var /** @const {string} */ loopCode = A.subWalkString_(
      A.subWalkExpression_(state.wasmModule, binaryen, state.functionInfo, vis, info.loopPtr)
    );

  // Clear root-switch state.
  state.rootSwitchExitMap = null;
  state.rootSwitchRsName = '';
  state.rootSwitchLoopName = '';

  return loopCode;
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

  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ hp = A.hasPrefix_;

  if (binaryen.BlockId === id) {
    var /** @const {?string} */ bName = /** @type {?string} */ (expr['name']);
    if (bName) {
      if (hp(bName, A.LB_FUSION_PREFIX_)) {
        // Fused block: DON'T push label stack or change indent.
        var /** @const {!Array<number>|void} */ ch = /** @type {!Array<number>|void} */ (expr['children']);
        if (ch && 1 === ch.length && binaryen.getExpressionInfo(ch[0]).id === binaryen.LoopId) {
          // Pattern A (block wraps loop): loop enters next.
          state.pendingBlockFusion = bName;
        } else {
          // Pattern B (block inside loop): add alias to top entry.
          state.labelStack[state.labelStack.length - 1].alias = bName;
        }
      } else if (hp(bName, A.RS_ROOT_SWITCH_PREFIX_)) {
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else if (hp(bName, A.SW_DISPATCH_PREFIX_)) {
        state.labelStack[state.labelStack.length] = {lbl: bName, lk: 'block'};
        ++state.indent;
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else {
        state.labelStack[state.labelStack.length] = {lbl: bName, lk: 'block'};
        ++state.indent;
      }
    }
  } else if (binaryen.LoopId === id) {
    var /** @const {string} */ loopName = /** @type {string} */ (expr['name']);
    if ('' !== state.pendingBlockFusion) {
      state.labelStack[state.labelStack.length] = {lbl: loopName, lk: 'loop', alias: state.pendingBlockFusion};
      state.pendingBlockFusion = '';
    } else {
      state.labelStack[state.labelStack.length] = {lbl: loopName, lk: 'loop'};
    }
    ++state.indent;
    if (hp(loopName, A.LD_DOWHILE_PREFIX_) || hp(loopName, A.LE_DOWHILE_PREFIX_)) {
      state.doWhileBodyPtrs[String(/** @type {number} */ (expr['body']))] = true;
    } else if (hp(loopName, A.LW_WHILE_PREFIX_) || hp(loopName, A.LY_WHILE_PREFIX_)) {
      state.whileBodyPtrs[String(/** @type {number} */ (expr['body']))] = true;
    }
  } else if (binaryen.IfId === id) {
    ++state.indent;
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
  entries[entries.length] = '&' + this.phpVar_('buffer');
  for (var /** number */ gi = 0, /** @const {number} */ gLen = globals.length; gi !== gLen; ++gi) {
    entries[entries.length] = '&' + this.phpVar_('$g_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(globals[gi].globalName));
  }
  for (var /** number */ ii = 0, /** @const {number} */ iLen = imports.length; ii !== iLen; ++ii) {
    entries[entries.length] =
      '&' + this.phpVar_('$if_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(imports[ii].importBaseName));
  }
  for (var /** number */ fi = 0, /** @const {number} */ fLen = internalFuncNames.length; fi !== fLen; ++fi) {
    entries[entries.length] = '&' + this.phpVar_(internalFuncNames[fi]);
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
  var /** @const {string} */ fnName = this.phpVar_(Wasm2Lang.Backend.Php64Codegen.phpSafeName_(funcInfo.name));
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(funcInfo.params);
  var /** @const {number} */ numParams = paramTypes.length;
  var /** @const {!Array<number>} */ varTypes = /** @type {!Array<number>} */ (funcInfo.vars) || [];
  var /** @const {number} */ numVars = varTypes.length;

  // Build use clause.
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ useClause = this.buildUseClause_(globals, imports, internalFuncNames);

  // Parameter list.
  var /** @const {!Array<string>} */ paramNames = [];
  for (var /** number */ pi = 0; pi !== numParams; ++pi) {
    paramNames[paramNames.length] = this.localN_(pi);
  }
  parts[parts.length] = pad(1) + fnName + ' = function(' + paramNames.join(', ') + ') use (' + useClause + ') {';

  // Coerce parameters to their wasm types.
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
    parts[parts.length] = pad(2) + varDecls.join('; ') + ';';
  }

  // Walk the body with the code-gen visitor.
  if (0 !== funcInfo.body) {
    var /** @const {!Wasm2Lang.Backend.Php64Codegen.EmitState_} */ emitState = {
        binaryen: binaryen,
        functionInfo: funcInfo,
        functionSignatures: functionSignatures,
        globalTypes: globalTypes,
        inlineTempOffset: numParams + numVars,
        labelStack: [],
        importedNames: importedNames,
        indent: 2,
        wasmModule: wasmModule,
        visitor: null,
        pendingBlockFusion: '',
        doWhileBodyPtrs: /** @type {!Object<string, boolean>} */ (Object.create(null)),
        doWhileConditionStr: '',
        whileBodyPtrs: /** @type {!Object<string, boolean>} */ (Object.create(null)),
        whileConditionStr: '',
        rootSwitchExitMap: null,
        rootSwitchRsName: '',
        rootSwitchLoopName: ''
      };

    var /** @const */ self = this;
    var /** @const */ hp = Wasm2Lang.Backend.AbstractCodegen.hasPrefix_;
    // prettier-ignore
    var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
      /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
        enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc) { return self.emitEnter_(emitState, nc); },
        leave: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} cr @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc, cr) {
          var /** @const {!Object<string, *>} */ e = /** @type {!Object<string, *>} */ (nc.expression);
          var /** @const {number} */ eId = /** @type {number} */ (e['id']);
          var /** @const {boolean} */ isFusedBlock = binaryen.BlockId === eId && !!e['name'] &&
              hp(/** @type {string} */ (e['name']), Wasm2Lang.Backend.AbstractCodegen.LB_FUSION_PREFIX_);
          var /** @const {boolean} */ isRsBlock = binaryen.BlockId === eId && !!e['name'] &&
              hp(/** @type {string} */ (e['name']), Wasm2Lang.Backend.AbstractCodegen.RS_ROOT_SWITCH_PREFIX_);
          if (binaryen.LoopId === eId || binaryen.IfId === eId) {
            --emitState.indent;
          } else if (binaryen.BlockId === eId && e['name'] && !isFusedBlock && !isRsBlock) {
            --emitState.indent;
          }
          // Pop label stack for blocks/loops after adjusting indent.
          if (binaryen.LoopId === eId) {
            emitState.labelStack.pop();
          } else if (binaryen.BlockId === eId && e['name'] && !isFusedBlock && !isRsBlock) {
            emitState.labelStack.pop();
          }
          return self.emitLeave_(emitState, nc, cr || []);
        }
      });
    emitState.visitor = visitor;
    var /** @type {*} */ bodyResult = this.walkFunctionBody_(wasmModule, binaryen, funcInfo, visitor);
    Wasm2Lang.Backend.AbstractCodegen.appendNonEmptyLines_(parts, bodyResult);
  }

  parts[parts.length] = pad(1) + '};';
  return parts.join('\n');
};

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<!Wasm2Lang.OutputSink.ChunkEntry>}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitCode = function (wasmModule, options) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} */ moduleInfo =
      this.collectModuleCodegenInfo_(wasmModule);
  var /** @const {!Array<string>} */ outputParts = [];

  // Collect internal function names (safe identifiers, unmangled keys).
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
      moduleInfo.impFuncs,
      internalFuncNames,
      moduleInfo.functionSignatures,
      moduleInfo.globalTypes
    );
  }
  var /** @const {!Object<string, boolean>} */ used = this.usedHelpers_;
  this.usedHelpers_ = null;

  // Pre-resolve mangled helper names used across multiple definitions.
  var /** @const {string} */ nI = this.n_('_w2l_i');
  var /** @const {string} */ nF32 = this.n_('_w2l_f32');

  // Core coercion helpers (always emitted).
  outputParts[outputParts.length] =
    'function ' + nI + '($v): int { $v = (int)$v; $v &= 0xFFFFFFFF; return ($v > 2147483647) ? ($v - 4294967296) : $v; }';
  outputParts[outputParts.length] = 'function ' + nF32 + "($v): float { return unpack('g', pack('g', (float)$v))[1]; }";

  // Opcode-specific helpers (only when referenced).
  if (used['_w2l_clz']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_clz') +
      '(int $v): int { $v = ' +
      nI +
      '($v) & 0xFFFFFFFF; if (0 === $v) return 32; $n = 0; while (0 === ($v & 0x80000000)) { ++$n; $v = ($v << 1) & 0xFFFFFFFF; } return $n; }';
  }
  if (used['_w2l_ctz']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_ctz') +
      '(int $v): int { $v = ' +
      nI +
      '($v) & 0xFFFFFFFF; if (0 === $v) return 32; $n = 0; while (0 === ($v & 1)) { ++$n; $v >>= 1; } return $n; }';
  }
  if (used['_w2l_popcnt']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_popcnt') +
      '(int $v): int { $v = ' +
      nI +
      '($v) & 0xFFFFFFFF; $n = 0; while (0 !== $v) { $n += $v & 1; $v >>= 1; } return $n; }';
  }
  if (used['_w2l_imul']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_imul') +
      '(int $a, int $b): int { $al = $a & 0xFFFF; $ah = ($a >> 16) & 0xFFFF; return ' +
      nI +
      '($al * ($b & 0xFFFF) + (($ah * ($b & 0xFFFF) + $al * (($b >> 16) & 0xFFFF)) << 16)); }';
  }
  if (used['_w2l_copysign_f64']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_copysign_f64') +
      '($x, $y): float { $x = abs((float)$x); return (ord(pack("E", (float)$y)[0]) & 128) ? -$x : $x; }';
  }
  if (used['_w2l_copysign_f32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_copysign_f32') +
      '($x, $y): float { return ' +
      nF32 +
      '(' +
      this.n_('_w2l_copysign_f64') +
      '($x, $y)); }';
  }
  if (used['_w2l_trunc_f64']) {
    outputParts[outputParts.length] =
      'function ' + this.n_('_w2l_trunc_f64') + '($x): float { $x = (float)$x; return $x < 0.0 ? ceil($x) : floor($x); }';
  }
  if (used['_w2l_trunc_f32']) {
    outputParts[outputParts.length] =
      'function ' + this.n_('_w2l_trunc_f32') + '($x): float { return ' + nF32 + '(' + this.n_('_w2l_trunc_f64') + '($x)); }';
  }
  if (used['_w2l_nearest_f64']) {
    outputParts[outputParts.length] =
      'function ' + this.n_('_w2l_nearest_f64') + '($x): float { return round((float)$x, 0, PHP_ROUND_HALF_EVEN); }';
  }
  if (used['_w2l_nearest_f32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_nearest_f32') +
      '($x): float { return ' +
      nF32 +
      '(' +
      this.n_('_w2l_nearest_f64') +
      '($x)); }';
  }
  if (used['_w2l_trunc_s_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_s_f32_to_i32') +
      '($x): int { return ' +
      nI +
      '((int)' +
      this.n_('_w2l_trunc_f64') +
      '(' +
      nF32 +
      '($x))); }';
  }
  if (used['_w2l_trunc_u_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_u_f32_to_i32') +
      '($x): int { return ' +
      this.n_('_w2l_trunc_u_f64_to_i32') +
      '(' +
      nF32 +
      '($x)); }';
  }
  if (used['_w2l_trunc_s_f64_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_s_f64_to_i32') +
      '($x): int { return ' +
      nI +
      '((int)' +
      this.n_('_w2l_trunc_f64') +
      '((float)$x)); }';
  }
  if (used['_w2l_trunc_u_f64_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_u_f64_to_i32') +
      '($x): int { $x = ' +
      this.n_('_w2l_trunc_f64') +
      '((float)$x); return $x >= 2147483648.0 ? ' +
      nI +
      '((int)($x - 2147483648.0) + -2147483648) : ' +
      nI +
      '((int)$x); }';
  }
  if (used['_w2l_trunc_sat_s_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_sat_s_f32_to_i32') +
      '($x): int { return ' +
      this.n_('_w2l_trunc_sat_s_f64_to_i32') +
      '(' +
      nF32 +
      '($x)); }';
  }
  if (used['_w2l_trunc_sat_u_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_sat_u_f32_to_i32') +
      '($x): int { return ' +
      this.n_('_w2l_trunc_sat_u_f64_to_i32') +
      '(' +
      nF32 +
      '($x)); }';
  }
  if (used['_w2l_trunc_sat_s_f64_to_i32']) {
    var /** @const {string} */ nTruncF64 = this.n_('_w2l_trunc_f64');
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_sat_s_f64_to_i32') +
      '($x): int { $x = ' +
      nTruncF64 +
      '((float)$x); return is_nan($x) ? 0 : ($x >= 2147483648.0 ? ' +
      nI +
      '(2147483647) : ($x <= -2147483649.0 ? ' +
      nI +
      '(-2147483648) : ' +
      nI +
      '((int)$x))); }';
  }
  if (used['_w2l_trunc_sat_u_f64_to_i32']) {
    var /** @const {string} */ nTruncF64u = this.n_('_w2l_trunc_f64');
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_sat_u_f64_to_i32') +
      '($x): int { $x = ' +
      nTruncF64u +
      '((float)$x); if (is_nan($x) || $x < 0.0) return 0; if ($x >= 4294967296.0) return ' +
      nI +
      '(-1); return $x >= 2147483648.0 ? ' +
      nI +
      '((int)($x - 2147483648.0) + -2147483648) : ' +
      nI +
      '((int)$x); }';
  }
  if (used['_w2l_convert_u_i32_to_f32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_convert_u_i32_to_f32') +
      '($x): float { $x = ' +
      nI +
      '($x); return ' +
      nF32 +
      '($x < 0 ? $x + 4294967296.0 : $x); }';
  }
  if (used['_w2l_convert_u_i32_to_f64']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_convert_u_i32_to_f64') +
      '($x): float { $x = ' +
      nI +
      '($x); return $x < 0 ? $x + 4294967296.0 : (float)$x; }';
  }
  if (used['_w2l_reinterpret_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_reinterpret_f32_to_i32') +
      '($x): int { return ' +
      nI +
      "(unpack('V', pack('g', " +
      nF32 +
      '($x)))[1]); }';
  }
  if (used['_w2l_reinterpret_i32_to_f32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_reinterpret_i32_to_f32') +
      '($x): float { return ' +
      nF32 +
      "(unpack('g', pack('V', " +
      nI +
      '($x)))[1]); }';
  }

  // Module header.
  var /** @const {string} */ pad1 = Wasm2Lang.Backend.AbstractCodegen.pad_(1);
  var /** @const {string} */ nBuf = this.phpVar_('buffer');
  outputParts[outputParts.length] = '$' + moduleName + ' = function(array $foreign, string &' + nBuf + '): array {';

  // Imported function bindings.
  for (var /** number */ i = 0, /** @const {number} */ importCount = moduleInfo.impFuncs.length; i !== importCount; ++i) {
    outputParts[outputParts.length] =
      pad1 +
      this.phpVar_('$if_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(moduleInfo.impFuncs[i].importBaseName)) +
      " = $foreign['" +
      moduleInfo.impFuncs[i].importBaseName +
      "'] ?? null;";
  }

  // Module-level globals.
  for (var /** number */ gi = 0, /** @const {number} */ gLen = moduleInfo.globals.length; gi !== gLen; ++gi) {
    outputParts[outputParts.length] =
      pad1 +
      this.phpVar_('$g_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(moduleInfo.globals[gi].globalName)) +
      ' = ' +
      moduleInfo.globals[gi].globalInitValue +
      ';';
  }

  // Forward declarations for internal functions.
  for (var /** number */ fi = 0, /** @const {number} */ fNameLen = internalFuncNames.length; fi !== fNameLen; ++fi) {
    outputParts[outputParts.length] = pad1 + this.phpVar_(internalFuncNames[fi]) + ' = null;';
  }

  // Append function bodies.
  for (var /** number */ fp = 0, /** @const {number} */ fpLen = functionParts.length; fp !== fpLen; ++fp) {
    outputParts[outputParts.length] = functionParts[fp];
  }

  // Return array.
  var /** @const {!Array<string>} */ returnEntries = [];
  for (var /** number */ r = 0, /** @const {number} */ exportCount = moduleInfo.expFuncs.length; r !== exportCount; ++r) {
    returnEntries[returnEntries.length] =
      "'" +
      moduleInfo.expFuncs[r].exportName +
      "' => " +
      this.phpVar_(Wasm2Lang.Backend.Php64Codegen.phpSafeName_(moduleInfo.expFuncs[r].internalName));
  }
  outputParts[outputParts.length] = pad1 + 'return [' + returnEntries.join(', ') + '];';
  outputParts[outputParts.length] = '};';

  // Traversal summary.
  // prettier-ignore
  outputParts[outputParts.length] = /** @type {string} */ (Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode.call(this, wasmModule, options));

  return Wasm2Lang.OutputSink.interleaveNewlines(outputParts);
};
