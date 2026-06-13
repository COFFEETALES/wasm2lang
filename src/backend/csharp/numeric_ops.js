'use strict';

/**
 * Simple-cast unary ops: op name → C# target type name (rendered through
 * {@code narrowingCast_} so out-of-range constant operands get
 * {@code unchecked(...)}).
 *
 * @private
 * @const {!Object<string, string>}
 */
Wasm2Lang.Backend.CsharpCodegen.CAST_UNARY_OPS_ = {
  'convert_s_i32_to_f32': 'float',
  'convert_s_i32_to_f64': 'double',
  'demote_f64_to_f32': 'float',
  'promote_f32_to_f64': 'double',
  'wrap_i64_to_i32': 'int',
  'extend_s_i32_to_i64': 'long',
  'convert_s_i64_to_f32': 'float',
  'convert_s_i64_to_f64': 'double'
};

/**
 * Unsigned-cast unary ops: the operand is reinterpreted through the unsigned
 * twin type, then converted by the leading cast.  C#'s real unsigned types
 * make Java's {@code Integer.toUnsignedLong} / shift-trick helpers
 * unnecessary.  Values are {@code [outerCast, unsignedType]} pairs.
 *
 * @private
 * @const {!Object<string, !Array<string>>}
 */
Wasm2Lang.Backend.CsharpCodegen.UNSIGNED_CAST_UNARY_OPS_ = {
  'convert_u_i32_to_f32': ['(float)', 'uint'],
  'convert_u_i32_to_f64': ['(double)', 'uint'],
  'extend_u_i32_to_i64': ['(long)', 'uint'],
  'convert_u_i64_to_f32': ['(float)', 'ulong'],
  'convert_u_i64_to_f64': ['(double)', 'ulong']
};

/**
 * Math/MathF unary ops.  Maps wasm op name → C# method name (shared by
 * {@code Math} for f64 and {@code MathF} for f32).  {@code Math.Round}
 * defaults to round-half-to-even, matching wasm {@code nearest}.
 *
 * @private
 * @const {!Object<string, string>}
 */
Wasm2Lang.Backend.CsharpCodegen.MATH_UNARY_OPS_ = {
  'abs': 'Abs',
  'ceil': 'Ceiling',
  'floor': 'Floor',
  'sqrt': 'Sqrt',
  'nearest': 'Round',
  'trunc': 'Truncate'
};

/**
 * Math/MathF binary ops.  {@code Math.Min}/{@code Max} follow IEEE 754
 * semantics on .NET (NaN propagation, -0 < +0), matching wasm min/max.
 *
 * @private
 * @const {!Object<string, string>}
 */
Wasm2Lang.Backend.CsharpCodegen.MATH_BINARY_OPS_ = {
  'min': 'Min',
  'max': 'Max',
  'copysign': 'CopySign'
};

/**
 * Helper-delegated unary ops (trapping and saturating float→int
 * truncations): op name → true.  Each maps to {@code $w2l_} + name.
 *
 * @private
 * @const {!Object<string, boolean>}
 */
Wasm2Lang.Backend.CsharpCodegen.HELPER_UNARY_OPS_ = {
  'trunc_s_f32_to_i32': true,
  'trunc_u_f32_to_i32': true,
  'trunc_sat_s_f32_to_i32': true,
  'trunc_sat_u_f32_to_i32': true,
  'trunc_s_f64_to_i32': true,
  'trunc_u_f64_to_i32': true,
  'trunc_sat_s_f64_to_i32': true,
  'trunc_sat_u_f64_to_i32': true,
  'trunc_s_f32_to_i64': true,
  'trunc_u_f32_to_i64': true,
  'trunc_sat_s_f32_to_i64': true,
  'trunc_sat_u_f32_to_i64': true,
  'trunc_s_f64_to_i64': true,
  'trunc_u_f64_to_i64': true,
  'trunc_sat_s_f64_to_i64': true,
  'trunc_sat_u_f64_to_i64': true
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
Wasm2Lang.Backend.CsharpCodegen.prototype.renderNumericUnaryOp_ = function (binaryen, info, valueExpr, opt_valueCat) {
  var /** @const {string} */ name = info.opName;
  var /** @const {boolean} */ isF32 = Wasm2Lang.Backend.ValueType.isF32(binaryen, info.operandType);
  var /** @const {number} */ cat = null != opt_valueCat ? opt_valueCat : Wasm2Lang.Backend.AbstractCodegen.CAT_RAW;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {string} */ inner;

  // neg: C# negation preserves float type — skip coercion when input category confirms type.
  if ('neg' === name) {
    return this.coerceToType_(binaryen, P.renderPrefix('-', valueExpr), cat, info.retType);
  }

  var /** @const {string|void} */ unaryMathName = Wasm2Lang.Backend.CsharpCodegen.MATH_UNARY_OPS_[name];
  if (unaryMathName) {
    if (isF32) {
      inner = this.coerceToType_(binaryen, valueExpr, cat, info.operandType);
      return 'System.MathF.' + unaryMathName + '(' + P.stripOuter(inner) + ')';
    }
    return 'System.Math.' + unaryMathName + '(' + P.stripOuter(valueExpr) + ')';
  }

  // Simple casts: convert_s_i32_to_f32 → (float)expr, etc.
  var /** @type {string|void} */ castOp = Wasm2Lang.Backend.CsharpCodegen.CAST_UNARY_OPS_[name];
  if (castOp) {
    return Wasm2Lang.Backend.CsharpCodegen.narrowingCast_(castOp, valueExpr);
  }

  // Unsigned conversions through the unsigned twin type.
  var /** @type {!Array<string>|void} */ unsignedCastOp = Wasm2Lang.Backend.CsharpCodegen.UNSIGNED_CAST_UNARY_OPS_[name];
  if (unsignedCastOp) {
    return unsignedCastOp[0] + Wasm2Lang.Backend.CsharpCodegen.narrowingCast_(unsignedCastOp[1], valueExpr);
  }

  // Reinterpret ops.
  if ('reinterpret_f32_to_i32' === name) {
    inner = this.coerceToType_(binaryen, valueExpr, cat, info.operandType);
    return 'System.BitConverter.SingleToInt32Bits(' + P.stripOuter(inner) + ')';
  }
  if ('reinterpret_i32_to_f32' === name) return 'System.BitConverter.Int32BitsToSingle(' + P.stripOuter(valueExpr) + ')';
  if ('reinterpret_i64_to_f64' === name) return 'System.BitConverter.Int64BitsToDouble(' + P.stripOuter(valueExpr) + ')';
  if ('reinterpret_f64_to_i64' === name) return 'System.BitConverter.DoubleToInt64Bits(' + P.stripOuter(valueExpr) + ')';

  // Helper-delegated ops: mark helper, call with optional f32 coercion.
  if (Wasm2Lang.Backend.CsharpCodegen.HELPER_UNARY_OPS_[name]) {
    var /** @const {string} */ helperName = '$w2l_' + name;
    this.markHelper_(helperName);
    var /** @type {string} */ arg = isF32 ? this.coerceToType_(binaryen, valueExpr, cat, info.operandType) : valueExpr;
    return this.n_(helperName) + '(' + P.stripOuter(arg) + ')';
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
 * @param {number=} opt_catL
 * @param {number=} opt_catR
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderNumericBinaryOp_ = function (binaryen, info, L, R, opt_catL, opt_catR) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ P = A.Precedence_;
  var /** @const {boolean} */ isF32 = Wasm2Lang.Backend.ValueType.isF32(binaryen, info.retType);

  var /** @const {string|void} */ binaryMathName = Wasm2Lang.Backend.CsharpCodegen.MATH_BINARY_OPS_[info.opName];
  if (binaryMathName) {
    var /** @const {number} */ catL = null != opt_catL ? opt_catL : A.CAT_RAW;
    var /** @const {number} */ catR = null != opt_catR ? opt_catR : A.CAT_RAW;
    if (isF32) {
      var /** @const {string} */ Lf = this.coerceToType_(binaryen, L, catL, info.retType);
      var /** @const {string} */ Rf = this.coerceToType_(binaryen, R, catR, info.retType);
      return 'System.MathF.' + binaryMathName + '(' + P.stripOuter(Lf) + ', ' + P.stripOuter(Rf) + ')';
    }
    return 'System.Math.' + binaryMathName + '(' + P.stripOuter(L) + ', ' + P.stripOuter(R) + ')';
  }

  if (info.isComparison) {
    return Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericBinaryOp_.call(this, binaryen, info, L, R);
  }

  // C# float/double arithmetic preserves the operand type — no cast needed.
  var /** @type {number} */ prec = P.PREC_ADDITIVE_;
  if ('mul' === info.opName || 'div' === info.opName) {
    prec = P.PREC_MULTIPLICATIVE_;
  }
  return P.renderInfix(L, info.opStr, R, prec);
};

// renderNumericComparisonResult_: inherited from AbstractCodegen (ternary ? 1 : 0).
