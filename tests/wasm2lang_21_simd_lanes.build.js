'use strict';

// SIMD lane-semantics test module, shared by the Java and C# backends.
//
// The pre-existing SIMD coverage (wasm2lang_14_simd) is 97% i32x4 and
// JAVA-only, which is exactly why the Java backend could render every op
// against a 4x32 species for years without a test noticing: i32x4 is the one
// lane type that shape happens to get right.  Every function here is chosen so
// a lane-type-ignoring or width-ignoring implementation produces a DIFFERENT
// value from the wasm oracle — carries that must not cross lane boundaries,
// floats that must not be added as integers, sign vs zero extension, shift
// counts at and above the lane width, and lane counts for bitmask/all_true.
//
// Each exported function returns one i32 so the harnesses can compare against
// the value the wasm oracle produced, which is recorded in the shared data.

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const {module} = common.createTestModule(binaryen, {memoryPages: 8, heapBase: 1024});
  module.setFeatures(binaryen.Features.MVP | binaryen.Features.SIMD128);

  // v128.const from 16 bytes in memory order.
  const v = bytes => module.v128.const(bytes);
  const i8 = (...b) => {
    const a = new Array(16).fill(0);
    b.forEach((x, i) => (a[i] = x & 0xff));
    return a;
  };
  const i16 = (...h) => {
    const a = new Array(16).fill(0);
    h.forEach((x, i) => {
      a[i * 2] = x & 0xff;
      a[i * 2 + 1] = (x >>> 8) & 0xff;
    });
    return a;
  };
  const i32v = (...w) => {
    const a = new Array(16).fill(0);
    w.forEach((x, i) => {
      a[i * 4] = x & 0xff;
      a[i * 4 + 1] = (x >>> 8) & 0xff;
      a[i * 4 + 2] = (x >>> 16) & 0xff;
      a[i * 4 + 3] = (x >>> 24) & 0xff;
    });
    return a;
  };
  const f32v = (...f) => {
    const a = new Array(16).fill(0);
    const buf = new DataView(new ArrayBuffer(4));
    f.forEach((x, i) => {
      buf.setFloat32(0, x, true);
      for (let k = 0; k < 4; ++k) a[i * 4 + k] = buf.getUint8(k);
    });
    return a;
  };
  const f64v = (...d) => {
    const a = new Array(16).fill(0);
    const buf = new DataView(new ArrayBuffer(8));
    d.forEach((x, i) => {
      buf.setFloat64(0, x, true);
      for (let k = 0; k < 8; ++k) a[i * 8 + k] = buf.getUint8(k);
    });
    return a;
  };

  // Adds an exported function returning i32.
  //
  // The body is used as the function's value directly rather than wrapped in
  // an explicit `return`.  A value-typed block inside a `return` is the shape
  // binaryen:min/max exist to flatten, and the `baseline` variant deliberately
  // runs no normalization at all, so wrapping would exercise an unrelated
  // pre-existing gap in value-typed-block emission instead of lane semantics.
  const fn = (name, body) => {
    module.addFunction(name, binaryen.none, binaryen.i32, [], body);
    module.addFunctionExport(name, name);
  };

  // Reads one i32 word of a vector back out of memory, so a wrong lane WIDTH
  // shows up even when the lane 0 value alone would not distinguish it.
  const wordAt = (vec, byteOffset) =>
    module.block(
      null,
      [module.v128.store(0, 16, module.i32.const(0), vec), module.i32.load(byteOffset, 4, module.i32.const(0))],
      binaryen.i32
    );
  const word0 = vec => wordAt(vec, 0);
  // f64 lane 0's LOW word is zero for every value used here, so reading word 0
  // would pass no matter what the implementation did; the exponent and sign
  // live in the high word.
  const word1 = vec => wordAt(vec, 4);

  // --- integer lane arithmetic: carries must not cross lanes ---------------
  fn('i8x16_add_carry', word0(module.i8x16.add(v(i8(0xff, 0xff, 0xff, 0xff)), v(i8(1, 1, 1, 1)))));
  fn('i8x16_sub_borrow', word0(module.i8x16.sub(v(i8(0, 0, 0, 0)), v(i8(1, 1, 1, 1)))));
  fn('i16x8_add_carry', word0(module.i16x8.add(v(i16(0xffff, 0xffff)), v(i16(1, 1)))));
  fn('i16x8_mul', word0(module.i16x8.mul(v(i16(0x1000, 2)), v(i16(0x0010, 3)))));
  fn('i32x4_add', word0(module.i32x4.add(v(i32v(0x7fffffff)), v(i32v(1)))));
  fn('i64x2_add', word0(module.i64x2.add(v(i32v(0xffffffff, 0)), v(i32v(1, 0)))));

  // --- float lane arithmetic: must not operate on bit patterns -------------
  fn('f32x4_add', word0(module.f32x4.add(v(f32v(1.5)), v(f32v(2.25)))));
  fn('f32x4_mul', word0(module.f32x4.mul(v(f32v(3)), v(f32v(0.5)))));
  fn('f32x4_div', word0(module.f32x4.div(v(f32v(7)), v(f32v(2)))));
  fn('f32x4_sqrt', word0(module.f32x4.sqrt(v(f32v(4)))));
  fn('f32x4_neg', word0(module.f32x4.neg(v(f32v(1)))));
  fn('f32x4_abs', word0(module.f32x4.abs(v(f32v(-1)))));
  fn('f64x2_mul', word1(module.f64x2.mul(v(f64v(3)), v(f64v(2)))));
  fn('f64x2_sqrt', word1(module.f64x2.sqrt(v(f64v(9)))));

  // --- splat must fill every lane of the right width -----------------------
  fn('i8x16_splat', word0(module.i8x16.splat(module.i32.const(0x2a))));
  fn('i16x8_splat', word0(module.i16x8.splat(module.i32.const(0x1234))));
  fn('f32x4_splat', word0(module.f32x4.splat(module.f32.const(1.5))));

  // --- comparisons produce all-ones per lane, at the lane's width ----------
  fn('i8x16_eq', word0(module.i8x16.eq(v(i8(5, 9, 5, 9)), v(i8(5, 7, 5, 7)))));
  fn('i16x8_lt_u', word0(module.i16x8.lt_u(v(i16(0xffff, 1)), v(i16(1, 0xffff)))));
  fn('i16x8_lt_s', word0(module.i16x8.lt_s(v(i16(0xffff, 1)), v(i16(1, 0xffff)))));
  fn('f32x4_eq', word0(module.f32x4.eq(v(f32v(1.5, 2)), v(f32v(1.5, 3)))));

  // --- unsigned vs signed lane reading -------------------------------------
  fn('i8x16_min_u', word0(module.i8x16.min_u(v(i8(0xff)), v(i8(1)))));
  fn('i8x16_min_s', word0(module.i8x16.min_s(v(i8(0xff)), v(i8(1)))));
  fn('i8x16_max_u', word0(module.i8x16.max_u(v(i8(0xff)), v(i8(1)))));
  fn('i8x16_avgr_u', word0(module.i8x16.avgr_u(v(i8(200, 255)), v(i8(100, 255)))));

  // --- lane access: sign vs zero extension, and narrowing on replace -------
  fn('extract_s8', module.i8x16.extract_lane_s(v(i8(0xff)), 0));
  fn('extract_u8', module.i8x16.extract_lane_u(v(i8(0xff)), 0));
  fn('extract_s16', module.i16x8.extract_lane_s(v(i16(0xffff)), 0));
  fn('extract_u16', module.i16x8.extract_lane_u(v(i16(0xffff)), 0));
  fn('extract_hi_lane', module.i8x16.extract_lane_u(v(i8(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x7e)), 15));
  fn('replace8_narrows', module.i8x16.extract_lane_u(module.i8x16.replace_lane(v(i8(0)), 1, module.i32.const(0x1ff)), 1));

  // --- shifts: count is taken modulo the lane width ------------------------
  fn('i8x16_shl', word0(module.i8x16.shl(v(i8(1, 1, 1, 1)), module.i32.const(4))));
  fn('i8x16_shl_mod', word0(module.i8x16.shl(v(i8(1, 1, 1, 1)), module.i32.const(12))));
  fn('i8x16_shr_s', word0(module.i8x16.shr_s(v(i8(0x80, 0x80, 0x80, 0x80)), module.i32.const(1))));
  fn('i8x16_shr_u', word0(module.i8x16.shr_u(v(i8(0x80, 0x80, 0x80, 0x80)), module.i32.const(1))));
  fn('i16x8_shr_s', word0(module.i16x8.shr_s(v(i16(0x8000, 0x8000)), module.i32.const(4))));
  fn('i32x4_shr_u', word0(module.i32x4.shr_u(v(i32v(0x80000000)), module.i32.const(4))));
  fn('i64x2_shl_mod', word0(module.i64x2.shl(v(i32v(1, 0)), module.i32.const(68))));

  // --- whole-vector predicates: lane COUNT matters -------------------------
  fn('any_true_zero', module.v128.any_true(v(i32v(0, 0, 0, 0))));
  fn('any_true_one_bit', module.v128.any_true(v(i8(0, 0, 0, 1))));
  fn('all_true_i8_gap', module.i8x16.all_true(v(i8(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0))));
  fn('all_true_i32_gap', module.i32x4.all_true(v(i8(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0))));
  fn('all_true_i8_full', module.i8x16.all_true(v(i8(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1))));
  fn('bitmask_i8', module.i8x16.bitmask(v(i8(0x80, 0, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x80))));
  fn('bitmask_i16', module.i16x8.bitmask(v(i16(0x8000, 0, 0x8000, 0, 0, 0, 0, 0x8000))));
  fn('bitmask_i32', module.i32x4.bitmask(v(i32v(0x80000000, 0, 0x80000000, 0))));

  // --- bitwise, whole-vector ----------------------------------------------
  fn('v128_and', word0(module.v128.and(v(i32v(0xf0f0f0f0)), v(i32v(0x3c3c3c3c)))));
  fn('v128_or', word0(module.v128.or(v(i32v(0xf0f0f0f0)), v(i32v(0x3c3c3c3c)))));
  fn('v128_xor', word0(module.v128.xor(v(i32v(0xf0f0f0f0)), v(i32v(0x3c3c3c3c)))));
  fn('v128_andnot', word0(module.v128.andnot(v(i32v(0xf0f0f0f0)), v(i32v(0x3c3c3c3c)))));
  fn('v128_not', word0(module.v128.not(v(i32v(0xf0f0f0f0)))));
  fn('v128_bitselect', word0(module.v128.bitselect(v(i32v(0xaaaaaaaa)), v(i32v(0x55555555)), v(i32v(0xffff0000)))));

  // bitselect's mask occurs twice in its formula: (a & c) | (b & ~c).
  // Keep the mask call effectful so an inline renderer that spells that
  // formula directly returns 2 here, while wasm's evaluate-once semantics and
  // the three-parameter backend helper both return 1.
  module.addGlobal('bitselectMaskCalls', binaryen.i32, true, module.i32.const(0));
  module.addFunction(
    'nextBitselectMask',
    binaryen.none,
    binaryen.v128,
    [],
    module.block(
      null,
      [
        module.global.set(
          'bitselectMaskCalls',
          module.i32.add(module.global.get('bitselectMaskCalls', binaryen.i32), module.i32.const(1))
        ),
        v(i32v(0xffff0000))
      ],
      binaryen.v128
    )
  );
  fn(
    'v128_bitselect_call_count',
    module.block(
      null,
      [
        module.global.set('bitselectMaskCalls', module.i32.const(0)),
        module.v128.store(
          128,
          16,
          module.i32.const(0),
          module.v128.bitselect(v(i32v(0xaaaaaaaa)), v(i32v(0x55555555)), module.call('nextBitselectMask', [], binaryen.v128))
        ),
        module.global.get('bitselectMaskCalls', binaryen.i32)
      ],
      binaryen.i32
    )
  );

  // --- memory: unaligned v128 load/store round trip ------------------------
  module.addFunction(
    'storeAt',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.v128.store(0, 1, module.local.get(0, binaryen.i32), v(i8(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)))
  );
  module.addFunctionExport('storeAt', 'storeAt');
  fn(
    'unaligned_roundtrip',
    module.block(
      null,
      [
        module.v128.store(0, 1, module.i32.const(2049), v(i8(9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 6))),
        module.i32x4.extract_lane(module.v128.load(0, 1, module.i32.const(2049)), 0)
      ],
      binaryen.i32
    )
  );

  common.finalizeAndOutput(module);
})();
