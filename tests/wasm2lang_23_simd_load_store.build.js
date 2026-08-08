'use strict';

// SIMD load/store family, shared by the Java and C# backends.
//
// This family was covered by NO test in the repository, which is why both
// backends were wrong about it for so long without anything noticing: Java
// rendered every SIMDLoad variant as a full-width v128.load (ignoring the
// opcode entirely) and every lane op as a fixed 32-bit lane, and C# emitted an
// `/* unknown expr id */` comment that did not even compile.
//
// Every value here is chosen so a full-width load, a wrong splat width, a
// missing sign extension or a fixed 32-bit lane produces a DIFFERENT number
// from the wasm oracle.

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

  // 32 bytes of source data, planted by an explicit store rather than a data
  // segment: a harness that hands the module a freshly zeroed buffer never
  // applies data segments, so every load would read zeros and prove nothing.
  // High bits alternate so sign- versus zero-extension shows up, and the two
  // halves differ so a splat or widening half taken from the wrong end shows up.
  const SEED_LO = i8(0x81, 0x02, 0x83, 0x04, 0x85, 0x06, 0x87, 0x08, 0x89, 0x0a, 0x8b, 0x0c, 0x8d, 0x0e, 0x8f, 0x10);
  const SEED_HI = i8(0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20);
  const seed = () => [
    module.v128.store(0, 1, module.i32.const(0), v(SEED_LO)),
    module.v128.store(0, 1, module.i32.const(16), v(SEED_HI))
  ];

  // Reads one i32 word of a vector back out of memory, so a wrong lane WIDTH
  // shows up even when the lane 0 value alone would not distinguish it.
  const fn = (name, vec, byteOffset) => {
    module.addFunction(
      name,
      binaryen.none,
      binaryen.i32,
      [],
      module.block(
        null,
        seed().concat([
          module.v128.store(0, 16, module.i32.const(256), vec),
          module.i32.load(256 + byteOffset, 4, module.i32.const(0))
        ]),
        binaryen.i32
      )
    );
    module.addFunctionExport(name, name);
  };

  const P = off => module.i32.const(off);

  // --- splat loads: the element is broadcast at its OWN width ---------------
  fn('load8_splat', module.v128.load8_splat(0, 1, P(0)), 0);
  fn('load16_splat', module.v128.load16_splat(0, 1, P(0)), 0);
  fn('load32_splat', module.v128.load32_splat(0, 1, P(0)), 0);
  fn('load64_splat', module.v128.load64_splat(0, 1, P(0)), 0);
  fn('load64_splat_hi', module.v128.load64_splat(0, 1, P(0)), 12);

  // --- extending loads: 8 bytes -> 8 shorts etc, signed vs zero extension ---
  fn('load8x8_s', module.v128.load8x8_s(0, 1, P(0)), 0);
  fn('load8x8_u', module.v128.load8x8_u(0, 1, P(0)), 0);
  fn('load8x8_s_hi', module.v128.load8x8_s(0, 1, P(0)), 12);
  // Offset 8 starts at 0x89, whose sign bit separates _s from _u.
  fn('load8x8_s_off', module.v128.load8x8_s(0, 1, P(8)), 0);
  fn('load8x8_u_off', module.v128.load8x8_u(0, 1, P(8)), 0);
  fn('load16x4_s', module.v128.load16x4_s(0, 1, P(0)), 0);
  fn('load16x4_u', module.v128.load16x4_u(0, 1, P(0)), 0);
  fn('load16x4_s_off', module.v128.load16x4_s(0, 1, P(8)), 4);
  fn('load32x2_s', module.v128.load32x2_s(0, 1, P(0)), 0);
  fn('load32x2_s_hi', module.v128.load32x2_s(0, 1, P(0)), 4);
  fn('load32x2_u_hi', module.v128.load32x2_u(0, 1, P(0)), 4);

  // --- zero-extending scalar loads: upper lanes MUST be zero ----------------
  fn('load32_zero', module.v128.load32_zero(0, 1, P(0)), 0);
  fn('load32_zero_hi', module.v128.load32_zero(0, 1, P(0)), 4);
  fn('load64_zero', module.v128.load64_zero(0, 1, P(0)), 0);
  fn('load64_zero_hi', module.v128.load64_zero(0, 1, P(0)), 12);

  // --- lane loads: only the named lane changes ------------------------------
  const ZERO = v(i32v(0, 0, 0, 0));
  const KEEP = v(i32v(0x44434241, 0x48474645, 0x4c4b4a49, 0x504f4e4d));
  fn('load8_lane', module.v128.load8_lane(0, 1, 1, P(0), ZERO), 0);
  fn('load16_lane', module.v128.load16_lane(0, 1, 1, P(0), ZERO), 0);
  fn('load32_lane', module.v128.load32_lane(0, 1, 1, P(0), ZERO), 4);
  fn('load64_lane', module.v128.load64_lane(0, 1, 1, P(0), ZERO), 12);
  // The lanes NOT named must survive untouched.
  fn('load8_lane_keep', module.v128.load8_lane(0, 1, 1, P(0), KEEP), 0);
  fn('load16_lane_keep', module.v128.load16_lane(0, 1, 3, P(0), KEEP), 4);
  fn('load32_lane_keep', module.v128.load32_lane(0, 1, 2, P(0), KEEP), 12);

  // --- lane stores: only the named lane's bytes reach memory ----------------
  const storeFn = (name, storeExpr, readOffset) => {
    module.addFunction(
      name,
      binaryen.none,
      binaryen.i32,
      [],
      module.block(
        null,
        [
          module.v128.store(0, 16, module.i32.const(512), v(i32v(0x7f7f7f7f, 0x7f7f7f7f, 0x7f7f7f7f, 0x7f7f7f7f))),
          storeExpr,
          module.i32.load(512 + readOffset, 4, module.i32.const(0))
        ],
        binaryen.i32
      )
    );
    module.addFunctionExport(name, name);
  };
  storeFn('store8_lane', module.v128.store8_lane(0, 1, 2, module.i32.const(512), KEEP), 0);
  storeFn('store16_lane', module.v128.store16_lane(0, 1, 1, module.i32.const(512), KEEP), 0);
  storeFn('store32_lane', module.v128.store32_lane(0, 1, 1, module.i32.const(512), KEEP), 0);
  storeFn('store64_lane', module.v128.store64_lane(0, 1, 1, module.i32.const(512), KEEP), 0);
  // A lane store must leave the following bytes alone.
  storeFn('store32_lane_keep', module.v128.store32_lane(0, 1, 0, module.i32.const(512), KEEP), 4);

  common.finalizeAndOutput(module);
})();
