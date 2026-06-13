'use strict';

// ---------------------------------------------------------------------------
// C# binary-op renderers.  Unsigned division/comparison route through
// `(uint)` / `(ulong)` casts (C# has real unsigned types — no helper class
// needed), rotations through `System.Numerics.BitOperations`, and signed
// remainder through a `_w2l_rem_*` helper because C# throws
// OverflowException on `int.MinValue % -1` where WASM requires 0.  Signed
// division stays a plain infix `/`: C# throws on `int.MinValue / -1` and on
// division by zero, which matches the WASM trap semantics exactly.
// ---------------------------------------------------------------------------

/**
 * Wraps a rendered integer infix in {@code unchecked(...)} when the result
 * is a CONSTANT expression that overflows the operand type.  C# evaluates
 * constant expressions in checked mode (CS0220) even though runtime
 * arithmetic defaults to unchecked wrap-around, so un-folded constant math
 * like {@code 65536 * 65537} from baseline (binaryen:none) IR would
 * otherwise fail to compile.  The operand width is inferred from the
 * {@code L} literal suffix (i64 literals always carry it).
 *
 * @private
 * @param {string} rendered  The already-rendered infix expression.
 * @param {string} opStr
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.guardConstArithmetic_ = function (rendered, opStr, L, R) {
  var /** @const */ Cs = Wasm2Lang.Backend.CsharpCodegen;
  var /** @const {?Array<string>} */ lm = /^(-?\d+|-?0[xX][0-9a-fA-F]+)(UL|L)?$/.exec(L);
  var /** @const {?Array<string>} */ rm = /^(-?\d+|-?0[xX][0-9a-fA-F]+)(UL|L)?$/.exec(R);
  if (!lm || !rm) {
    // Compound constant expressions ((1 << 16) - 1, unchecked((long)0x…UL),
    // …) keep the containing expression constant; their folded value is not
    // computed here, so wrap conservatively — unchecked(...) is a no-op at
    // runtime.
    if (Cs.isConstantExpression_(L) && Cs.isConstantExpression_(R)) {
      return 'unchecked(' + rendered + ')';
    }
    return rendered;
  }
  var /** @const {boolean} */ isLong = void 0 !== lm[2] || void 0 !== rm[2];
  var /** @const {number} */ a = Number(lm[1]);
  var /** @const {number} */ b = Number(rm[1]);
  var /** @const {number} */ v = '+' === opStr ? a + b : '-' === opStr ? a - b : a * b;
  // Beyond 2^53 the JS doubles above lose integer precision, so the exact
  // i64 range test is unreliable — wrap conservatively.
  var /** @const {number} */ PRECISE = 9007199254740992;
  if (isLong && (Math.abs(a) >= PRECISE || Math.abs(b) >= PRECISE || Math.abs(v) >= PRECISE)) {
    return 'unchecked(' + rendered + ')';
  }
  var /** @const {number} */ lo = isLong ? -9223372036854775808 : -2147483648;
  var /** @const {number} */ hi = isLong ? 9223372036854775807 : 2147483647;
  if (v < lo || v > hi) {
    return 'unchecked(' + rendered + ')';
  }
  return rendered;
};

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.CsharpCodegen.renderArithmeticBinary_ = function (self, info, L, R) {
  return Wasm2Lang.Backend.CsharpCodegen.guardConstArithmetic_(
    Wasm2Lang.Backend.AbstractCodegen.renderPlainArithmeticBinary_(self, info, L, R),
    info.opStr,
    L,
    R
  );
};

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.CsharpCodegen.renderMultiplyBinary_ = function (self, info, L, R) {
  return Wasm2Lang.Backend.CsharpCodegen.guardConstArithmetic_(
    Wasm2Lang.Backend.AbstractCodegen.renderPlainMultiplyBinary_(self, info, L, R),
    '*',
    L,
    R
  );
};

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.CsharpCodegen.renderBitwiseBinary_ = Wasm2Lang.Backend.AbstractCodegen.renderPlainBitwiseBinary_;

/**
 * Builds a division/remainder renderer.  Unsigned ops compute in the
 * unsigned twin type and cast the result back; signed division is plain
 * infix; signed remainder delegates to the {@code remHelper} so that
 * {@code MIN % -1} yields 0 instead of throwing.
 *
 * @private
 * @param {string} signedType  {@code 'int'} or {@code 'long'}.
 * @param {string} unsignedType  {@code 'uint'} or {@code 'ulong'}.
 * @param {string} remHelper  Signed-remainder helper key.
 * @return {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_}
 */
Wasm2Lang.Backend.CsharpCodegen.makeDivisionRenderer_ = function (signedType, unsignedType, remHelper) {
  var /** @type {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */ renderer = function (self, info, L, R) {
      var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
      if (info.unsigned) {
        var /** @const {string} */ uL = Wasm2Lang.Backend.CsharpCodegen.narrowingCast_(unsignedType, L);
        var /** @const {string} */ uR = Wasm2Lang.Backend.CsharpCodegen.narrowingCast_(unsignedType, R);
        return '(' + signedType + ')(' + uL + ' ' + info.opStr + ' ' + uR + ')';
      }
      if ('%' === info.opStr) {
        self.markHelper_(remHelper);
        return self.n_(remHelper) + '(' + L + ', ' + R + ')';
      }
      return P.renderInfix(L, '/', R, P.PREC_MULTIPLICATIVE_);
    };
  return renderer;
};

/**
 * Builds a rotate renderer routed through {@code BitOperations.RotateLeft} /
 * {@code RotateRight}, which operate on the unsigned twin type and take an
 * {@code int} rotation amount.
 *
 * @private
 * @param {string} signedType
 * @param {string} unsignedType
 * @param {boolean} castAmountToInt  True for i64 (the amount arrives as long).
 * @return {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_}
 */
Wasm2Lang.Backend.CsharpCodegen.makeRotateRenderer_ = function (signedType, unsignedType, castAmountToInt) {
  var /** @type {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */ renderer = function (self, info, L, R) {
      void self;
      var /** @const {string} */ amountExpr = castAmountToInt ? Wasm2Lang.Backend.CsharpCodegen.narrowingCast_('int', R) : R;
      var /** @const {string} */ method = info.rotateLeft ? 'RotateLeft' : 'RotateRight';
      return (
        '(' +
        signedType +
        ')System.Numerics.BitOperations.' +
        method +
        '(' +
        Wasm2Lang.Backend.CsharpCodegen.narrowingCast_(unsignedType, L) +
        ', ' +
        amountExpr +
        ')'
      );
    };
  return renderer;
};

/**
 * Builds a comparison renderer.  Unsigned comparisons cast both operands to
 * the unsigned twin type; signed comparisons map straight to the infix
 * operator carried on {@code info.opStr}.
 *
 * @private
 * @param {string} unsignedType
 * @return {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_}
 */
Wasm2Lang.Backend.CsharpCodegen.makeComparisonRenderer_ = function (unsignedType) {
  var /** @type {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */ renderer = function (self, info, L, R) {
      void self;
      var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
      return A.renderComparisonInfix_(info, L, R, function (x) {
        return Wasm2Lang.Backend.CsharpCodegen.narrowingCast_(unsignedType, x);
      });
    };
  return renderer;
};

/**
 * i64 bitwise renderer.  C# shift operators require an {@code int} count, so
 * the i64 right-hand side of {@code <<} / {@code >>} / {@code >>>} gets an
 * explicit {@code (int)} cast — semantics-preserving because both C# and
 * WASM mask the count to the low 6 bits, which truncation to int keeps.
 *
 * @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_}
 */
Wasm2Lang.Backend.CsharpCodegen.renderI64BitwiseBinary_ = function (self, info, L, R) {
  void self;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const */ bi = P.bitwiseInfo(info.opStr);
  var /** @type {string} */ right = R;
  if (P.PREC_SHIFT_ === bi.bitwisePrecedence) {
    right = Wasm2Lang.Backend.CsharpCodegen.narrowingCast_('int', R);
  }
  return P.renderInfix(L, info.opStr, right, bi.bitwisePrecedence, bi.bitwiseAllowRightEqual);
};

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.CsharpCodegen.renderDivisionBinary_ = Wasm2Lang.Backend.CsharpCodegen.makeDivisionRenderer_(
  'int',
  'uint',
  '$w2l_rem_i32'
);

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.CsharpCodegen.renderRotateBinary_ = Wasm2Lang.Backend.CsharpCodegen.makeRotateRenderer_('int', 'uint', false);

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.CsharpCodegen.renderComparisonBinary_ = Wasm2Lang.Backend.CsharpCodegen.makeComparisonRenderer_('uint');

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.CsharpCodegen.renderI64DivisionBinary_ = Wasm2Lang.Backend.CsharpCodegen.makeDivisionRenderer_(
  'long',
  'ulong',
  '$w2l_rem_i64'
);

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.CsharpCodegen.renderI64RotateBinary_ = Wasm2Lang.Backend.CsharpCodegen.makeRotateRenderer_(
  'long',
  'ulong',
  true
);

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.CsharpCodegen.renderI64ComparisonBinary_ = Wasm2Lang.Backend.CsharpCodegen.makeComparisonRenderer_('ulong');
