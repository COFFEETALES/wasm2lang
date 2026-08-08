'use strict';

// Widening integer SIMD ops, C#-only.
//
// This module is NOT shared with Java the way wasm2lang_21_simd_lanes is,
// because Java refuses every op exercised here: jdk.incubator.vector has no
// saturating or widening-multiply operator, so the Java backend stops with a
// named refusal rather than emitting something plausible.  Adding these to the
// shared module would make it fail on Java for a reason that is documented
// rather than defective.  Move them into the shared module the moment Java
// grows the ops.
//
// Every value below is chosen so a signed reading and an unsigned reading of
// the same lane differ, and so the low and high halves carry different values:
// extmul_low vs extmul_high and _s vs _u are exactly the distinctions a
// half-ignoring or sign-ignoring implementation gets wrong.

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const {module} = common.createTestModule(binaryen, {memoryPages: 8, heapBase: 1024});
  module.setFeatures(binaryen.Features.MVP | binaryen.Features.SIMD128);

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
  const v = bytes => module.v128.const(bytes);

  // Reads one i32 word of a vector back out of memory, so a wrong lane WIDTH
  // shows up even when the lane 0 value alone would not distinguish it.
  const wordAt = (vec, byteOffset) =>
    module.block(
      null,
      [module.v128.store(0, 16, module.i32.const(0), vec), module.i32.load(byteOffset, 4, module.i32.const(0))],
      binaryen.i32
    );
  // The body is the function's value directly rather than wrapped in an
  // explicit `return`: a value-typed block inside a return is the shape
  // binaryen:min/max exist to flatten, and the `baseline` variant runs none.
  const fn = (name, vec, off) => {
    module.addFunction(name, binaryen.none, binaryen.i32, [], wordAt(vec, off));
    module.addFunctionExport(name, name);
  };

  const a8 = v(i8(0x81, 0x02, 0xff, 0x7f, 0x10, 0x20, 0x30, 0x40, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c));
  const b8 = v(i8(0x02, 0x03, 0x02, 0x7f, 0x02, 0x02, 0x02, 0x02, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18));
  const a16 = () => v(i16(0x8001, 0x0002, 0xffff, 0x7fff, 0x1234, 0x0005, 0x0006, 0x0007));
  const b16 = () => v(i16(0x0003, 0x0004, 0x0002, 0x7fff, 0x0002, 0x0011, 0x0012, 0x0013));
  const a32 = () => v(i32v(0x80000001, 0x00000002, 0xffffffff, 0x7fffffff));
  const b32 = () => v(i32v(0x00000003, 0x00000004, 0x00000002, 0x7fffffff));

  // --- extmul: result lane is twice the source lane, so no product overflows.
  fn('extmul_low_s_16', module.i16x8.extmul_low_i8x16_s(a8, b8), 0);
  fn('extmul_low_s_16b', module.i16x8.extmul_low_i8x16_s(a8, b8), 4);
  fn('extmul_high_s_16', module.i16x8.extmul_high_i8x16_s(a8, b8), 0);
  fn('extmul_low_u_16', module.i16x8.extmul_low_i8x16_u(a8, b8), 0);
  fn('extmul_high_u_16', module.i16x8.extmul_high_i8x16_u(a8, b8), 4);

  fn('extmul_low_s_32', module.i32x4.extmul_low_i16x8_s(a16(), b16()), 0);
  fn('extmul_high_s_32', module.i32x4.extmul_high_i16x8_s(a16(), b16()), 0);
  fn('extmul_low_u_32', module.i32x4.extmul_low_i16x8_u(a16(), b16()), 0);
  fn('extmul_high_u_32', module.i32x4.extmul_high_i16x8_u(a16(), b16()), 4);

  fn('extmul_low_s_64', module.i64x2.extmul_low_i32x4_s(a32(), b32()), 0);
  fn('extmul_low_s_64h', module.i64x2.extmul_low_i32x4_s(a32(), b32()), 4);
  fn('extmul_high_s_64', module.i64x2.extmul_high_i32x4_s(a32(), b32()), 0);
  fn('extmul_low_u_64', module.i64x2.extmul_low_i32x4_u(a32(), b32()), 0);
  fn('extmul_high_u_64', module.i64x2.extmul_high_i32x4_u(a32(), b32()), 4);

  // --- narrow: _u clamps a negative source to 0, _s clamps it to the signed
  // minimum.  Both bounds are exercised in the same vector.
  fn('narrow_u_8', module.i8x16.narrow_i16x8_u(a16(), b16()), 0);
  fn('narrow_u_8b', module.i8x16.narrow_i16x8_u(a16(), b16()), 12);
  fn('narrow_u_16', module.i16x8.narrow_i32x4_u(a32(), b32()), 0);
  fn('narrow_u_16b', module.i16x8.narrow_i32x4_u(a32(), b32()), 12);
  fn('narrow_s_8', module.i8x16.narrow_i16x8_s(a16(), b16()), 0);
  fn('narrow_s_16', module.i16x8.narrow_i32x4_s(a32(), b32()), 0);

  // --- extend: the half selected must come from the right end of the source.
  fn('extend_low_s_16', module.i16x8.extend_low_i8x16_s(a8), 0);
  fn('extend_high_s_16', module.i16x8.extend_high_i8x16_s(a8), 0);
  fn('extend_low_u_16', module.i16x8.extend_low_i8x16_u(a8), 0);
  fn('extend_high_u_16', module.i16x8.extend_high_i8x16_u(a8), 0);
  fn('extend_low_s_32', module.i32x4.extend_low_i16x8_s(a16()), 0);
  fn('extend_high_u_32', module.i32x4.extend_high_i16x8_u(a16()), 0);

  // --- saturating add/sub: the clamp must be at the LANE's bound, per lane.
  fn('add_sat_s_8', module.i8x16.add_saturate_s(a8, b8), 0);
  fn('add_sat_u_8', module.i8x16.add_saturate_u(a8, b8), 0);
  fn('sub_sat_s_8', module.i8x16.sub_saturate_s(a8, b8), 0);
  fn('sub_sat_u_8', module.i8x16.sub_saturate_u(a8, b8), 0);
  fn('add_sat_s_16', module.i16x8.add_saturate_s(a16(), b16()), 0);
  fn('add_sat_u_16', module.i16x8.add_saturate_u(a16(), b16()), 0);
  fn('sub_sat_s_16', module.i16x8.sub_saturate_s(a16(), b16()), 0);
  fn('sub_sat_u_16', module.i16x8.sub_saturate_u(a16(), b16()), 0);

  common.finalizeAndOutput(module);
})();
