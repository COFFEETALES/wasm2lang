'use strict';

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderCoercionByType_ = function (binaryen, expr, wasmType) {
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {?string} */ cast = null;
  if (V.isI64(binaryen, wasmType)) cast = '(long)';
  else if (V.isF32(binaryen, wasmType)) cast = '(float)';
  else if (V.isF64(binaryen, wasmType)) cast = '(double)';
  return null === cast ? expr : cast + P.wrap_(expr, P.PREC_UNARY_, true);
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} value
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderConst_ = function (binaryen, value, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return String(value);
  }
  return Wasm2Lang.Backend.CsharpCodegen.formatCsharpFloat_(value, Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType));
};

/**
 * Renders a binaryen i64 constant as a C# {@code long} literal.  Unlike
 * Java, a C# hex literal with bit 63 set has type {@code ulong} and does not
 * implicitly convert to {@code long}, so negative values outside the small
 * range are wrapped in {@code unchecked((long)0x…UL)}.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {*} value
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderI64Const_ = function (binaryen, value) {
  void binaryen;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {!Array<number>} */ parts = A.decomposeI64_(value);
  var /** @const {number} */ low = parts[0];
  var /** @const {number} */ high = parts[1];
  if (0 === low && 0 === high) return '0L';
  if (0 === high) return String(low) + 'L';
  if (-1 === high && low >= 0x80000000) return String(low - 4294967296) + 'L';
  if (high < 0) return 'unchecked((long)' + A.renderI64HexLiteral_(high, low, 'UL') + ')';
  return A.renderI64HexLiteral_(high, low, 'L');
};

/**
 * @override
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderLocalInit_ = function (binaryen, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI64(binaryen, wasmType)) {
    return '0L';
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return '0.0f';
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return '0.0';
  }
  return '0';
};

/**
 * Numeric range per cast target for {@link narrowingCast_}'s constant check.
 * Types absent from the table never overflow ({@code long}, {@code float},
 * {@code double} — widening or value-converting casts).
 *
 * @private
 * @const {!Object<string, !Array<number>>}
 */
Wasm2Lang.Backend.CsharpCodegen.CAST_RANGES_ = {
  'sbyte': [-128, 127],
  'byte': [0, 255],
  'short': [-32768, 32767],
  'int': [-2147483648, 2147483647],
  'uint': [0, 4294967295],
  'ulong': [0, Infinity]
};

/**
 * Keywords that may appear inside a rendered C# CONSTANT expression (cast
 * type names and the {@code unchecked} operator).  Any other identifier
 * marks the expression as runtime-dependent.
 *
 * @private
 * @const {!Object<string, boolean>}
 */
Wasm2Lang.Backend.CsharpCodegen.CONST_EXPR_KEYWORDS_ = {
  'unchecked': true,
  'int': true,
  'long': true,
  'uint': true,
  'ulong': true,
  'sbyte': true,
  'byte': true,
  'short': true,
  'float': true,
  'double': true
};

/**
 * Returns whether a rendered expression is a C# CONSTANT expression —
 * literals, parentheses, integer operators, casts between numeric types,
 * and {@code unchecked(...)}, with no runtime identifiers.  C# folds such
 * expressions at compile time in CHECKED mode, so emitters must wrap
 * overflowing ones in {@code unchecked(...)} even though runtime arithmetic
 * wraps silently.  Sound by construction: every accepted token is either a
 * numeric literal, an operator, or a whitelisted type/operator keyword.
 *
 * @param {string} expr
 * @return {boolean}
 */
Wasm2Lang.Backend.CsharpCodegen.isConstantExpression_ = function (expr) {
  // Strip numeric literals first so hex digits and type suffixes are not
  // misread as identifiers.
  var /** @const {string} */ stripped = expr
      .replace(/0[xX][0-9a-fA-F]+(?:UL|ul|[lLuU])?/g, '0')
      .replace(/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?:UL|ul|[fFdDlLuUmM])?/g, '0');
  if (!/^[\s0-9()+\-*\/%<>&^|~A-Za-z_]*$/.test(stripped)) return false;
  var /** @const {?Array<string>} */ tokens = stripped.match(/[A-Za-z_][A-Za-z0-9_]*/g);
  if (!tokens) return true;
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = tokens.length; i < len; ++i) {
    if (!Wasm2Lang.Backend.CsharpCodegen.CONST_EXPR_KEYWORDS_[tokens[i]]) return false;
  }
  return true;
};

/**
 * Renders a reinterpreting/narrowing cast.  C# checks CONSTANT expressions
 * for conversion overflow even in unchecked contexts (CS0221), so a literal
 * operand outside the target range — or any non-literal constant expression
 * the compiler would fold ({@code (1 << 16) - 1}, an i64 literal rendered as
 * {@code unchecked((long)0x…UL)}, …) — gets an explicit
 * {@code unchecked(...)} around the cast.  Runtime operands keep the bare
 * cast.
 *
 * @param {string} castType  C# target type name (e.g. {@code 'uint'}).
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.narrowingCast_ = function (castType, expr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ wrapped = P.wrap_(expr, P.PREC_UNARY_, true);
  var /** @type {boolean} */ needsUnchecked = false;
  var /** @const {?Array<string>} */ m = /^(-?\d+)L?$/.exec(expr);
  var /** @const {!Array<number>|undefined} */ range = Wasm2Lang.Backend.CsharpCodegen.CAST_RANGES_[castType];
  if (m && range) {
    var /** @const {number} */ v = Number(m[1]);
    needsUnchecked = v < range[0] || v > range[1];
  } else if (range && Wasm2Lang.Backend.CsharpCodegen.isConstantExpression_(expr)) {
    // Compound constant expression: the exact folded value is not computed
    // here, so wrap conservatively — unchecked(...) is a no-op at runtime.
    needsUnchecked = true;
  }
  if (needsUnchecked) {
    return 'unchecked((' + castType + ')' + wrapped + ')';
  }
  return '(' + castType + ')' + wrapped;
};

/**
 * Method name for each i32 {@code UNARY_*} category that dispatches to a
 * static {@code System.Numerics.BitOperations} call.  Keyed by the numeric
 * UNARY_* constant.
 *
 * @const {!Object<number, string>}
 * @private
 */
Wasm2Lang.Backend.CsharpCodegen.CS_I32_UNARY_METHODS_ = /** @type {!Object<number, string>} */ (
  Wasm2Lang.Backend.I32Coercion.buildKeyedTable([
    [Wasm2Lang.Backend.I32Coercion.UNARY_CLZ, 'System.Numerics.BitOperations.LeadingZeroCount'],
    [Wasm2Lang.Backend.I32Coercion.UNARY_CTZ, 'System.Numerics.BitOperations.TrailingZeroCount'],
    [Wasm2Lang.Backend.I32Coercion.UNARY_POPCNT, 'System.Numerics.BitOperations.PopCount']
  ])
);

/**
 * Target C# primitive type for each sign-extend {@code UNARY_*} category.
 * The narrowing cast result widens back to {@code int} implicitly.
 *
 * @const {!Object<number, string>}
 * @private
 */
Wasm2Lang.Backend.CsharpCodegen.CS_I32_UNARY_CASTS_ = /** @type {!Object<number, string>} */ (
  Wasm2Lang.Backend.I32Coercion.buildKeyedTable([
    [Wasm2Lang.Backend.I32Coercion.UNARY_EXTEND8_S, 'sbyte'],
    [Wasm2Lang.Backend.I32Coercion.UNARY_EXTEND16_S, 'short']
  ])
);

/**
 * Method name for each i64 {@code UNARY_*} category.  C#'s
 * {@code BitOperations} overloads on {@code ulong}, so the method names
 * match the i32 table; the table is still keyed by the I64Coercion
 * constants to keep the two dispatch families independent.
 *
 * @const {!Object<number, string>}
 * @private
 */
Wasm2Lang.Backend.CsharpCodegen.CS_I64_UNARY_METHODS_ = /** @type {!Object<number, string>} */ (
  Wasm2Lang.Backend.I32Coercion.buildKeyedTable([
    [Wasm2Lang.Backend.I64Coercion.UNARY_CLZ, 'System.Numerics.BitOperations.LeadingZeroCount'],
    [Wasm2Lang.Backend.I64Coercion.UNARY_CTZ, 'System.Numerics.BitOperations.TrailingZeroCount'],
    [Wasm2Lang.Backend.I64Coercion.UNARY_POPCNT, 'System.Numerics.BitOperations.PopCount']
  ])
);

/**
 * Target C# primitive type for each i64 sign-extend {@code UNARY_*}
 * category.  The narrowing cast is followed by an explicit {@code (long)}
 * widening so the result type stays CAT_I64-truthful.
 *
 * @const {!Object<number, string>}
 * @private
 */
Wasm2Lang.Backend.CsharpCodegen.CS_I64_UNARY_CASTS_ = /** @type {!Object<number, string>} */ (
  Wasm2Lang.Backend.I32Coercion.buildKeyedTable([
    [Wasm2Lang.Backend.I64Coercion.UNARY_EXTEND8_S, 'sbyte'],
    [Wasm2Lang.Backend.I64Coercion.UNARY_EXTEND16_S, 'short'],
    [Wasm2Lang.Backend.I64Coercion.UNARY_EXTEND32_S, 'int']
  ])
);

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} unaryCategory
 * @param {string} operandExpr
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitI32Unary_ = function (binaryen, unaryCategory, operandExpr) {
  void binaryen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (C.UNARY_EQZ === unaryCategory) {
    return {
      emittedString: P.renderInfix(operandExpr, '==', '0', P.PREC_EQUALITY_),
      resultCat: Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32
    };
  }
  var /** @const {string|undefined} */ method = Wasm2Lang.Backend.CsharpCodegen.CS_I32_UNARY_METHODS_[unaryCategory];
  if (method) {
    return {
      emittedString: method + '(' + Wasm2Lang.Backend.CsharpCodegen.narrowingCast_('uint', operandExpr) + ')',
      resultCat: C.SIGNED
    };
  }
  var /** @const {string|undefined} */ cast = Wasm2Lang.Backend.CsharpCodegen.CS_I32_UNARY_CASTS_[unaryCategory];
  if (cast) {
    return {emittedString: Wasm2Lang.Backend.CsharpCodegen.narrowingCast_(cast, operandExpr), resultCat: C.SIGNED};
  }
  return null;
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} unaryCategory
 * @param {string} operandExpr
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitI64Unary_ = function (binaryen, unaryCategory, operandExpr) {
  void binaryen;
  var /** @const */ I = Wasm2Lang.Backend.I64Coercion;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ P = A.Precedence_;
  if (I.UNARY_EQZ === unaryCategory) {
    return {
      emittedString: P.renderInfix(operandExpr, '==', '0L', P.PREC_EQUALITY_),
      resultCat: A.CAT_BOOL_I32
    };
  }
  var /** @const {string|undefined} */ method = Wasm2Lang.Backend.CsharpCodegen.CS_I64_UNARY_METHODS_[unaryCategory];
  if (method) {
    return {
      emittedString: '(long)' + method + '(' + Wasm2Lang.Backend.CsharpCodegen.narrowingCast_('ulong', operandExpr) + ')',
      resultCat: A.CAT_I64
    };
  }
  var /** @const {string|undefined} */ cast = Wasm2Lang.Backend.CsharpCodegen.CS_I64_UNARY_CASTS_[unaryCategory];
  if (cast) {
    return {
      emittedString: '(long)' + Wasm2Lang.Backend.CsharpCodegen.narrowingCast_(cast, operandExpr),
      resultCat: A.CAT_I64
    };
  }
  return null;
};
