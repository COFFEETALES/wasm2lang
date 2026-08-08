'use strict';

// ---------------------------------------------------------------------------
// C# SIMD128 rendering — System.Runtime.Intrinsics.Vector128<T>.
//
// The carrier is Vector128<byte> (see CsharpCodegen.V128_TYPE_): wasm v128 is
// 128 untyped bits, and every instruction reinterprets them as its own lane
// geometry.  So each op reinterprets the carrier into the lane view it needs
// with As*(), computes, and reinterprets back with AsByte().  As*() is a
// bit-preserving view change, so the round trip costs nothing at run time.
//
// This is the property the Java backend lacked: it carried everything as a
// 4x32 IntVector and never reinterpreted, so i8x16 arithmetic carried across
// byte boundaries and float ops added bit patterns as integers.  Every helper
// below therefore takes laneType from the shared classifier and refuses rather
// than guessing when it has no lane view (see laneView_).
//
// Every API method named here was verified to exist and to behave as wasm
// requires by compiling and running a probe against .NET 10 on 2026-08-02;
// nothing is assumed from documentation alone.  Two results from that probe
// shaped the code: Vector128.Narrow TRUNCATES where wasm narrow saturates
// (so narrow_s/narrow_u clamp first), and Vector128.Min/Max follow the lane
// view's signedness (so no XOR-flip trick is needed for the _u forms).
// ---------------------------------------------------------------------------

/**
 * Lane views: laneType -> [signedAs, unsignedAs, elementType].
 * The As* method reinterprets the byte carrier into that lane view; the
 * element type is the C# scalar the lane holds, needed for casts and for
 * Vector128<T>.Zero.
 *
 * @private
 * @const {!Object<string, !Array<string>>}
 */
Wasm2Lang.Backend.CsharpCodegen.SIMD_LANE_VIEW_ = {
  'i8x16': ['AsSByte', 'AsByte', 'sbyte'],
  'i16x8': ['AsInt16', 'AsUInt16', 'short'],
  'i32x4': ['AsInt32', 'AsUInt32', 'int'],
  'i64x2': ['AsInt64', 'AsUInt64', 'long'],
  'f32x4': ['AsSingle', 'AsSingle', 'float'],
  'f64x2': ['AsDouble', 'AsDouble', 'double'],
  // v128 ops are whole-vector bitwise: the byte view is already correct.
  'v128': ['AsByte', 'AsByte', 'byte']
};

/**
 * @param {string} laneType
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.CsharpCodegen.simdView_ = function (laneType) {
  return Wasm2Lang.Backend.SIMDOps.laneViewRow(Wasm2Lang.Backend.CsharpCodegen.SIMD_LANE_VIEW_, laneType, 'C#');
};

/**
 * Renders {@code expr} reinterpreted into the lane view for {@code laneType}.
 *
 * @param {string} expr
 * @param {string} laneType
 * @param {boolean} unsigned
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.laneView_ = function (expr, laneType, unsigned) {
  var /** @const {!Array<string>} */ view = Wasm2Lang.Backend.CsharpCodegen.simdView_(laneType);
  return 'System.Runtime.Intrinsics.Vector128.' + view[unsigned ? 1 : 0] + '(' + expr + ')';
};

/**
 * Reinterprets a lane-view expression back to the byte carrier.
 *
 * As*() and CopyTo() are extension methods on {@code Vector128<T>}, and the
 * emitted compilation unit carries no using directives, so every one of them
 * is written in the static form {@code Vector128.AsByte(v)} rather than
 * {@code v.AsByte()}.  The instance form does not compile here — verified
 * 2026-08-02, it fails with CS1061.
 *
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.toCarrier_ = function (expr) {
  return 'System.Runtime.Intrinsics.Vector128.AsByte(' + expr + ')';
};

/**
 * Signed C# scalar type -> its unsigned counterpart.  Float types map to
 * themselves: an unsigned float lane view is meaningless and never requested.
 *
 * @private
 * @const {!Object<string, string>}
 */
Wasm2Lang.Backend.CsharpCodegen.SIMD_UNSIGNED_ELEM_ = {
  'sbyte': 'byte',
  'short': 'ushort',
  'int': 'uint',
  'long': 'ulong'
};

/**
 * C# scalar element type for a lane type.
 *
 * @param {string} laneType
 * @param {boolean} unsigned
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.laneElemType_ = function (laneType, unsigned) {
  var /** @const {!Array<string>} */ view = Wasm2Lang.Backend.CsharpCodegen.simdView_(laneType);
  var /** @const {string} */ signed = view[2];
  if (!unsigned) return signed;
  var /** @const {string|undefined} */ un = Wasm2Lang.Backend.CsharpCodegen.SIMD_UNSIGNED_ELEM_[signed];
  return un ? un : signed;
};

/**
 * Binary ops that map onto one static Vector128 method taking both operands
 * in the op's own lane view.  opName -> [methodName, usesUnsignedView].
 *
 * Comparisons are included: Vector128.Equals / LessThan / GreaterThan and the
 * OrEqual forms all return an all-ones-or-all-zeros mask per lane, which is
 * exactly what wasm defines, so no 0/1 materialization is needed.
 *
 * @private
 * @const {!Object<string, !Array<*>>}
 */
Wasm2Lang.Backend.CsharpCodegen.SIMD_BINARY_METHOD_ = {
  'add': ['Add', false],
  'sub': ['Subtract', false],
  'mul': ['Multiply', false],
  'div': ['Divide', false],
  'and': ['BitwiseAnd', false],
  'or': ['BitwiseOr', false],
  'xor': ['Xor', false],
  'andnot': ['AndNot', false],
  'add_sat_s': ['AddSaturate', false],
  'add_sat_u': ['AddSaturate', true],
  'sub_sat_s': ['SubtractSaturate', false],
  'sub_sat_u': ['SubtractSaturate', true],
  'min_s': ['Min', false],
  'min_u': ['Min', true],
  'max_s': ['Max', false],
  'max_u': ['Max', true],
  'eq': ['Equals', false],
  'ne': ['__ne', false],
  'lt_s': ['LessThan', false],
  'lt_u': ['LessThan', true],
  'gt_s': ['GreaterThan', false],
  'gt_u': ['GreaterThan', true],
  'le_s': ['LessThanOrEqual', false],
  'le_u': ['LessThanOrEqual', true],
  'ge_s': ['GreaterThanOrEqual', false],
  'ge_u': ['GreaterThanOrEqual', true],
  // Float comparisons carry no _s/_u suffix; the float lane view is unsigned-agnostic.
  'lt': ['LessThan', false],
  'gt': ['GreaterThan', false],
  'le': ['LessThanOrEqual', false],
  'ge': ['GreaterThanOrEqual', false],
  // The float min/max, which carry no signedness suffix either and were simply
  // absent — every f32x4.min in a module stopped the build.  Measured on
  // .NET 10 rather than assumed, because these are the two ops where a
  // plausible implementation is wrong in two specific places: Vector128.Min
  // propagates a NaN operand as a NaN and resolves min(+0,-0) to -0 in BOTH
  // operand orders, which is wasm's definition exactly.  Vector128.MinNative
  // does neither — measured, it returns the non-NaN operand — so it must not be
  // substituted here however much faster it looks.
  'min': ['Min', false],
  'max': ['Max', false]
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.SIMDOps.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitSIMDBinaryOp_ = function (binaryen, info, L, R) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ Cs = Wasm2Lang.Backend.CsharpCodegen;
  var /** @const {string} */ opName = info.opName;
  var /** @const {string} */ lane = info.laneType;
  var /** @const {string} */ V = 'System.Runtime.Intrinsics.Vector128';

  var /** @const {!Array<*>|undefined} */ direct = Cs.SIMD_BINARY_METHOD_[opName];
  if (direct) {
    var /** @const {boolean} */ uns = /** @type {boolean} */ (direct[1]);
    var /** @const {string} */ lv = Cs.laneView_(L, lane, uns);
    var /** @const {string} */ rv = Cs.laneView_(R, lane, uns);
    // wasm 'ne' is the complement of the eq mask; Vector128 has no NotEquals.
    if ('__ne' === direct[0]) {
      return {
        emittedString: Cs.toCarrier_(V + '.OnesComplement(' + V + '.Equals(' + lv + ', ' + rv + '))'),
        resultCat: A.CAT_V128
      };
    }
    return {
      emittedString: Cs.toCarrier_(V + '.' + String(direct[0]) + '(' + lv + ', ' + rv + ')'),
      resultCat: A.CAT_V128
    };
  }

  // avgr_u and pmin/pmax each need both operands twice, so they go through a
  // helper: repeating an operand in an expression repeats whatever computed it,
  // and a call-valued operand would then be evaluated twice.  The formulas
  // themselves live in emitSIMDDuplicatingHelpers_.
  if ('avgr_u' === opName || 'pmin' === opName || 'pmax' === opName) {
    var /** @const {string} */ dupName = '$w2l_v128_' + opName + '_' + lane;
    this.markHelper_(dupName);
    return {emittedString: this.n_(dupName) + '(' + L + ', ' + R + ')', resultCat: A.CAT_V128};
  }

  // dot_s and q15mulr_sat_s both widen each operand twice (low half and high
  // half), so they take the same helper route.  Their names are fixed rather
  // than lane-derived: wasm defines exactly one of each.
  if ('dot_s' === opName) {
    this.markHelper_('$w2l_v128_dot_s_i32x4');
    return {emittedString: this.n_('$w2l_v128_dot_s_i32x4') + '(' + L + ', ' + R + ')', resultCat: A.CAT_V128};
  }
  if ('q15mulr_sat_s' === opName) {
    this.markHelper_('$w2l_v128_q15mulr_sat_s_i16x8');
    return {
      emittedString: this.n_('$w2l_v128_q15mulr_sat_s_i16x8') + '(' + L + ', ' + R + ')',
      resultCat: A.CAT_V128
    };
  }

  // swizzle indexes BYTES of L by the byte values of R; any index >= 16 yields
  // zero.  Vector128.Shuffle has exactly that out-of-range rule.  It must NOT
  // be ShuffleNative, which leaves out-of-range lanes implementation-defined.
  if ('swizzle' === opName) {
    return {
      emittedString: Cs.toCarrier_(V + '.Shuffle(' + Cs.laneView_(L, lane, true) + ', ' + Cs.laneView_(R, lane, true) + ')'),
      resultCat: A.CAT_V128
    };
  }

  // narrow_s packs two vectors into one of half-width lanes, saturating at the
  // SIGNED bounds of the target lane.  NarrowWithSaturation reads the source
  // through the view it is given, so the signed view is required; the unsigned
  // form (narrow_u) is deliberately absent here because passing the unsigned
  // view makes negative sources saturate to the top instead of to zero.
  if ('narrow_s' === opName) {
    var /** @const {string} */ wide = Wasm2Lang.Backend.SIMDOps.widerLane(lane);
    return {
      emittedString: Cs.toCarrier_(
        V + '.NarrowWithSaturation(' + Cs.laneView_(L, wide, false) + ', ' + Cs.laneView_(R, wide, false) + ')'
      ),
      resultCat: A.CAT_V128
    };
  }

  // narrow_u saturates at the UNSIGNED bounds of the target lane: a negative
  // source clamps to 0, not to the top.  NarrowWithSaturation cannot express
  // that (see narrow_s above), so the clamp is explicit and Narrow then merely
  // truncates — exact, because every lane is already inside the target range.
  // Max-then-Min keeps each operand referenced exactly once, which is what lets
  // this be an expression at all; see the operand-duplication note on
  // emitSIMDBinaryOp_.
  if ('narrow_u' === opName) {
    var /** @const {string} */ nuWide = Wasm2Lang.Backend.SIMDOps.widerLane(lane);
    var /** @const {string} */ nuElem = Cs.laneElemType_(nuWide, false);
    // The unsigned ceiling of the TARGET lane, which is where the clamp lands.
    var /** @const {string} */ nuMax = String(Math.pow(2, Wasm2Lang.Backend.SIMDOps.laneInfo(lane).laneBits) - 1);
    var clampU = /** @param {string} e @return {string} */ function (e) {
      return (
        V +
        '.Min(' +
        V +
        '.Max(' +
        Wasm2Lang.Backend.CsharpCodegen.laneView_(e, nuWide, false) +
        ', ' +
        Wasm2Lang.Backend.CsharpCodegen.V128_OF_ +
        nuElem +
        '>.Zero), ' +
        V +
        '.Create((' +
        nuElem +
        ')' +
        nuMax +
        '))'
      );
    };
    return {
      emittedString: Cs.toCarrier_(V + '.Narrow(' + clampU(L) + ', ' + clampU(R) + ')'),
      resultCat: A.CAT_V128
    };
  }

  // extmul widens one HALF of each operand and multiplies there, so the result
  // lane is twice the source lane and no product can overflow.  Each operand is
  // referenced once, so this needs no temporary.
  var /** @const {!Array<string>|undefined} */ xm = Wasm2Lang.Backend.CsharpCodegen.SIMD_EXTMUL_[opName];
  if (xm) {
    // The classifier reports the RESULT lane for extmul, so the sources are one
    // width down.
    var /** @const {string} */ xmSrc = Wasm2Lang.Backend.SIMDOps.narrowerLane(lane);
    if (xmSrc) {
      var /** @const {boolean} */ xmUns = 'u' === xm[1];
      return {
        emittedString: Cs.toCarrier_(
          V +
            '.Multiply(' +
            V +
            '.' +
            xm[0] +
            '(' +
            Cs.laneView_(L, xmSrc, xmUns) +
            '), ' +
            V +
            '.' +
            xm[0] +
            '(' +
            Cs.laneView_(R, xmSrc, xmUns) +
            '))'
        ),
        resultCat: A.CAT_V128
      };
    }
  }

  this.refuseSIMDOp_('binary', opName, lane);
  return {emittedString: '', resultCat: A.CAT_V128};
};

/**
 * extmul op name -> [Widen method, signedness tag].  The half selected by the
 * name is the half of the SOURCE lane view, and the result lane is the op's
 * own lane type.
 *
 * @const {!Object<string, !Array<string>>}
 */
Wasm2Lang.Backend.CsharpCodegen.SIMD_EXTMUL_ = {
  'extmul_low_s': ['WidenLower', 's'],
  'extmul_high_s': ['WidenUpper', 's'],
  'extmul_low_u': ['WidenLower', 'u'],
  'extmul_high_u': ['WidenUpper', 'u']
};

/**
 * Unary ops that map onto one static Vector128 method in the op's lane view.
 *
 * @private
 * @const {!Object<string, string>}
 */
Wasm2Lang.Backend.CsharpCodegen.SIMD_UNARY_METHOD_ = {
  'neg': 'Negate',
  'abs': 'Abs',
  'sqrt': 'Sqrt',
  'ceil': 'Ceiling',
  'floor': 'Floor',
  'trunc': 'Truncate',
  // wasm 'nearest' is round-half-to-even, which is Vector128.Round's default
  // midpoint mode — measured identical to Round(v, MidpointRounding.ToEven).
  'nearest': 'Round',
  'not': 'OnesComplement'
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.SIMDOps.UnaryOpInfo} info
 * @param {string} operandExpr
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitSIMDUnaryOp_ = function (binaryen, info, operandExpr) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ Cs = Wasm2Lang.Backend.CsharpCodegen;
  var /** @const {string} */ opName = info.opName;
  var /** @const {string} */ lane = info.laneType;
  var /** @const {string} */ V = 'System.Runtime.Intrinsics.Vector128';

  var /** @const {string|undefined} */ method = Cs.SIMD_UNARY_METHOD_[opName];
  if (method) {
    return {
      emittedString: Cs.toCarrier_(V + '.' + method + '(' + Cs.laneView_(operandExpr, lane, false) + ')'),
      resultCat: A.CAT_V128
    };
  }

  // splat: broadcast a scalar into every lane of the op's lane view.  The
  // scalar arrives as an i32 (or i64/f32/f64) and must be narrowed to the lane
  // element type first, which is what wasm's splat does implicitly.
  if ('splat' === opName) {
    var /** @const {string} */ elem = Cs.laneElemType_(lane, false);
    var /** @const {string} */ arg = Wasm2Lang.Backend.SIMDOps.laneNeedsNarrowingCast(lane)
        ? Wasm2Lang.Backend.CsharpCodegen.narrowingCast_(elem, operandExpr)
        : operandExpr;
    return {emittedString: Cs.toCarrier_(V + '.Create(' + arg + ')'), resultCat: A.CAT_V128};
  }

  // bitmask: gather the sign bit of every lane into the low bits of an i32.
  // ExtractMostSignificantBits returns a uint whose bit count equals the lane
  // count, which is exactly wasm's definition.
  if ('bitmask' === opName) {
    return {
      emittedString: '(int)' + V + '.ExtractMostSignificantBits(' + Cs.laneView_(operandExpr, lane, false) + ')',
      resultCat: C.SIGNED
    };
  }

  // any_true is defined over the whole vector: any non-zero BIT, independent
  // of lane type.  all_true is per-lane in the op's lane view.
  if ('any_true' === opName) {
    return {
      emittedString: '(' + Cs.laneView_(operandExpr, 'v128', false) + ' != ' + Cs.V128_TYPE_ + '.Zero ? 1 : 0)',
      resultCat: C.SIGNED
    };
  }
  if ('all_true' === opName) {
    var /** @const {string} */ zeroT = 'System.Runtime.Intrinsics.Vector128<' + Cs.laneElemType_(lane, false) + '>.Zero';
    return {
      emittedString: '(' + V + '.EqualsAny(' + Cs.laneView_(operandExpr, lane, false) + ', ' + zeroT + ') ? 0 : 1)',
      resultCat: C.SIGNED
    };
  }

  // Width-changing conversions.  The op NAME carries the source, while
  // SIMDOps records laneType as the source for extends and as the result for
  // converts/truncations — so each entry names the view to read explicitly
  // rather than deriving it from laneType and getting half of them backwards.
  //   opName -> [readLaneType, readUnsigned, Vector128 method]
  var /** @const {!Array<*>|undefined} */ conv = Wasm2Lang.Backend.CsharpCodegen.SIMD_CONVERT_[opName];
  if (conv) {
    var /** @const {string} */ readLane = 'src' === conv[0] ? lane : /** @type {string} */ (conv[0]);
    var /** @type {string} */ convExpr =
        V + '.' + String(conv[2]) + '(' + Cs.laneView_(operandExpr, readLane, /** @type {boolean} */ (conv[1])) + ')';
    // The f64x2 <-> i32x4 conversions need two calls, not one: neither
    // direction has a single Vector128 method that both changes the element
    // type and moves between a 2-lane and a 4-lane shape.
    if (conv[3]) {
      convExpr = V + '.' + String(conv[3]) + '(' + convExpr + (conv[4] ? ', ' + String(conv[4]) : '') + ')';
    }
    return {emittedString: Cs.toCarrier_(convExpr), resultCat: A.CAT_V128};
  }

  // demote_zero packs the two f64 lanes into the low two f32 lanes and zeroes
  // the upper half, which is Narrow against a zero vector.
  if ('demote_zero_f64x2' === opName) {
    return {
      emittedString: Cs.toCarrier_(
        V + '.Narrow(' + Cs.laneView_(operandExpr, 'f64x2', false) + ', System.Runtime.Intrinsics.Vector128<double>.Zero)'
      ),
      resultCat: A.CAT_V128
    };
  }

  // popcnt and extadd_pairwise both need their operand more than once — popcnt
  // because the SWAR reduction feeds each step back into itself, extadd_pairwise
  // because the even and odd lanes are two different reads of the same vector.
  // Both therefore go through a helper; see emitSIMDDuplicatingHelpers_.
  if ('popcnt' === opName) {
    this.markHelper_('$w2l_v128_popcnt_i8x16');
    return {emittedString: this.n_('$w2l_v128_popcnt_i8x16') + '(' + operandExpr + ')', resultCat: A.CAT_V128};
  }
  if ('extadd_pairwise_s' === opName || 'extadd_pairwise_u' === opName) {
    // The classifier reports the SOURCE lane for this op (i8x16 for the op that
    // yields i16x8), while the helper is named and computed in the WIDE view
    // that holds the sums, so the name is keyed by the widened lane.
    var /** @const {string} */ eaWide = Wasm2Lang.Backend.SIMDOps.widerLane(lane);
    if (eaWide) {
      var /** @const {string} */ eaName = '$w2l_v128_' + opName + '_' + eaWide;
      this.markHelper_(eaName);
      return {emittedString: this.n_(eaName) + '(' + operandExpr + ')', resultCat: A.CAT_V128};
    }
  }

  this.refuseSIMDOp_('unary', opName, lane);
  return {emittedString: '', resultCat: A.CAT_V128};
};

/**
 * Width-changing unary conversions.
 * opName -> [readLaneType ('src' = the op's own laneType), readUnsigned,
 *            method, optional outer method, optional outer second argument].
 *
 * Every entry below was measured on .NET 10 rather than taken from
 * documentation.  Two results are worth keeping: ConvertToInt32 already
 * implements wasm's trunc_sat exactly (NaN maps to 0, out-of-range saturates
 * to INT_MIN/INT_MAX), and ConvertToUInt32 likewise clamps negatives to 0 —
 * so neither needs the NaN pre-check a naive implementation would add.
 *
 * The four f64x2 <-> i32x4 rows carry an outer method because they cross both
 * the element type and the lane COUNT, which no single Vector128 call does.
 * Measured the same way, on the same day, and the composition is exact:
 * {@code NarrowWithSaturation(ConvertToInt64(v), Vector128<long>.Zero)} clamps
 * at the *int* bounds — NaN to 0, 1e20 to INT_MAX, -1e20 to INT_MIN, 3e9 to
 * INT_MAX — with the upper two lanes zero, which is wasm's trunc_sat_zero_s in
 * full.  The unsigned form clamps negatives and NaN to 0 and 1e20 to
 * 4294967295.  Until 2026-08-02 all four ops reached refuseSIMDOp_ instead.
 *
 * @const {!Object<string, !Array<*>>}
 */
Wasm2Lang.Backend.CsharpCodegen.SIMD_CONVERT_ = {
  'extend_low_s': ['src', false, 'WidenLower'],
  'extend_high_s': ['src', false, 'WidenUpper'],
  'extend_low_u': ['src', true, 'WidenLower'],
  'extend_high_u': ['src', true, 'WidenUpper'],
  'trunc_sat_s_f32x4': ['f32x4', false, 'ConvertToInt32'],
  'trunc_sat_u_f32x4': ['f32x4', false, 'ConvertToUInt32'],
  'convert_s_i32x4': ['i32x4', false, 'ConvertToSingle'],
  'convert_u_i32x4': ['i32x4', true, 'ConvertToSingle'],
  'promote_low_f32x4': ['f32x4', false, 'WidenLower'],
  'convert_low_s_i32x4': ['i32x4', false, 'WidenLower', 'ConvertToDouble', ''],
  'convert_low_u_i32x4': ['i32x4', true, 'WidenLower', 'ConvertToDouble', ''],
  'trunc_sat_zero_s_f64x2': [
    'f64x2',
    false,
    'ConvertToInt64',
    'NarrowWithSaturation',
    'System.Runtime.Intrinsics.Vector128<long>.Zero'
  ],
  'trunc_sat_zero_u_f64x2': [
    'f64x2',
    false,
    'ConvertToUInt64',
    'NarrowWithSaturation',
    'System.Runtime.Intrinsics.Vector128<ulong>.Zero'
  ]
};

/**
 * Renders a lane-typed vector shift.
 *
 * The count is a plain i32 operand rather than an immediate, and wasm reduces it
 * modulo the lane bit width where Vector128.ShiftLeft and friends do not; that
 * reduction is shared with java in
 * {@code AbstractCodegen.renderLaneShiftCount_}.  What stays here is the method
 * name and the signedness of the view it reads.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.SIMDOps.LaneOpInfo} info
 * @param {string} vecExpr
 * @param {string} countExpr
 * @param {number} countCat
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderSIMDShift_ = function (binaryen, info, vecExpr, countExpr, countCat) {
  var /** @const */ Cs = Wasm2Lang.Backend.CsharpCodegen;
  var /** @const {string} */ count = Wasm2Lang.Backend.AbstractCodegen.renderLaneShiftCount_(info.laneType, countExpr);
  var /** @const {boolean} */ unsigned = 'shr_u' === info.kind;
  var /** @const {string} */ method =
      'shl' === info.kind ? 'ShiftLeft' : 'shr_s' === info.kind ? 'ShiftRightArithmetic' : 'ShiftRightLogical';
  return Cs.toCarrier_(
    'System.Runtime.Intrinsics.Vector128.' + method + '(' + Cs.laneView_(vecExpr, info.laneType, unsigned) + ', ' + count + ')'
  );
};

/**
 * csharp expresses v128 through {@code System.Runtime.Intrinsics.Vector128}.
 *
 * @override
 * @protected
 * @return {boolean}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.supportsSIMD_ = function () {
  return true;
};
