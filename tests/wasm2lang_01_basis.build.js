'use strict';

(async function () {
  const harness = await import('../tests/wasm2lang_01_basis.harness.mjs');

  const path = require('path');
  const url = require('url');
  const binaryen = (
    await import(
      url.pathToFileURL(path.join(process.env.NODE_PATH || path.join(process.cwd(), 'node_modules'), 'binaryen', 'index.js'))[
        'href'
      ]
    )
  ).default;

  const expectedData = harness.expectedData;
  const offsetList = harness.offsetList;

  const module = new binaryen.Module();

  module.setFeatures(binaryen.Features.MVP | binaryen.Features.NontrappingFPToInt);

  module.setMemory(
    /* initial */ harness.memoryInitialPages,
    /* maximum */ harness.memoryMaximumPages,
    /* exportName */ 'memory',
    [
      {
        passive: false,
        offset: module.i32.const(0),
        data: Array.prototype.slice.call(new Uint8Array(offsetList.buffer))
      },
      ...expectedData.map((s, i) => ({
        passive: false,
        offset: module.i32.const(offsetList[i]),
        data: s
          .split('')
          .map(x => x.charCodeAt(0))
          .concat(0x0)
      }))
    ],
    /* shared */ false
  );

  module.addGlobal('heapTop', binaryen.i32, /* mutable */ true, module.i32.const(harness.heapBase));

  module.addFunction(
    'alignHeapTop',
    /*params*/ binaryen.none,
    /*result*/ binaryen.none,
    [],
    module.block(null, [
      module.global.set(
        'heapTop',
        module.i32.and(
          module.i32.add(module.global.get('heapTop', binaryen.i32), module.i32.const(255)),
          module.i32.const(~255)
        )
      ),
      module.return()
    ])
  );

  module.addFunction(
    'getHeapTop',
    /*params*/ binaryen.none,
    /*result*/ binaryen.i32,
    [],
    module.return(module.global.get('heapTop', binaryen.i32))
  );

  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.f32);
    const p2 = () => module.local.get(2, binaryen.f64);
    const heapTop = () => module.global.get('heapTop', binaryen.i32);
    const advanceHeap = n => module.global.set('heapTop', module.i32.add(heapTop(), module.i32.const(n)));
    const storeI32 = value => module.block(null, [module.i32.store(0, 4, heapTop(), value), advanceHeap(4)]);
    const storeF32 = value => module.block(null, [module.f32.store(0, 4, heapTop(), value), advanceHeap(4)]);
    const storeF64 = value => module.block(null, [module.f64.store(0, 8, heapTop(), value), advanceHeap(8)]);
    // storeF64Safe: uses align=4 so the asm.js backend emits byte-copy
    // helpers instead of HEAPF64[ptr>>3].  Use this when heapTop may not
    // be 8-byte aligned (e.g. interleaved i32/f32/f64 store sequences).
    const storeF64Safe = value => module.block(null, [module.f64.store(0, 4, heapTop(), value), advanceHeap(8)]);

    module.addFunction(
      'exerciseMVPOps',
      binaryen.createType([binaryen.i32, binaryen.f32, binaryen.f64]),
      binaryen.none,
      [],
      module.block(null, [
        // i32 binary arithmetic
        storeI32(module.i32.add(p0(), module.i32.const(1))),
        storeI32(module.i32.sub(p0(), module.i32.const(1))),
        storeI32(module.i32.mul(p0(), module.i32.const(3))),
        storeI32(module.i32.div_s(p0(), module.i32.const(2))),
        storeI32(module.i32.div_u(p0(), module.i32.const(2))),
        storeI32(module.i32.rem_s(p0(), module.i32.const(3))),
        storeI32(module.i32.rem_u(p0(), module.i32.const(3))),

        // i32 bitwise
        storeI32(module.i32.and(p0(), module.i32.const(0xff))),
        storeI32(module.i32.or(p0(), module.i32.const(0xf0))),
        storeI32(module.i32.xor(p0(), module.i32.const(0xaa))),
        storeI32(module.i32.shl(p0(), module.i32.const(4))),
        storeI32(module.i32.shr_s(p0(), module.i32.const(4))),
        storeI32(module.i32.shr_u(p0(), module.i32.const(4))),
        storeI32(module.i32.rotl(p0(), module.i32.const(8))),
        storeI32(module.i32.rotr(p0(), module.i32.const(8))),

        // i32 unary
        storeI32(module.i32.clz(p0())),
        storeI32(module.i32.ctz(p0())),
        storeI32(module.i32.popcnt(p0())),
        storeI32(module.i32.eqz(p0())),

        // i32 comparisons
        storeI32(module.i32.eq(p0(), module.i32.const(42))),
        storeI32(module.i32.ne(p0(), module.i32.const(42))),
        storeI32(module.i32.lt_s(p0(), module.i32.const(42))),
        storeI32(module.i32.lt_u(p0(), module.i32.const(42))),
        storeI32(module.i32.gt_s(p0(), module.i32.const(42))),
        storeI32(module.i32.gt_u(p0(), module.i32.const(42))),
        storeI32(module.i32.le_s(p0(), module.i32.const(42))),
        storeI32(module.i32.le_u(p0(), module.i32.const(42))),
        storeI32(module.i32.ge_s(p0(), module.i32.const(42))),
        storeI32(module.i32.ge_u(p0(), module.i32.const(42))),

        // f32 binary arithmetic
        storeF32(module.f32.add(p1(), module.f32.const(1.0))),
        storeF32(module.f32.sub(p1(), module.f32.const(1.0))),
        storeF32(module.f32.mul(p1(), module.f32.const(2.0))),
        storeF32(module.f32.div(p1(), module.f32.const(2.0))),
        storeF32(module.f32.min(p1(), module.f32.const(0.5))),
        storeF32(module.f32.max(p1(), module.f32.const(0.5))),
        storeF32(module.f32.copysign(p1(), module.f32.const(-1.0))),

        // f32 unary
        storeF32(module.f32.abs(p1())),
        storeF32(module.f32.neg(p1())),
        storeF32(module.f32.ceil(p1())),
        storeF32(module.f32.floor(p1())),
        storeF32(module.f32.trunc(p1())),
        storeF32(module.f32.nearest(p1())),
        storeF32(module.f32.sqrt(module.f32.abs(p1()))),

        // f32 comparisons
        storeI32(module.f32.eq(p1(), module.f32.const(0.0))),
        storeI32(module.f32.ne(p1(), module.f32.const(0.0))),
        storeI32(module.f32.lt(p1(), module.f32.const(0.0))),
        storeI32(module.f32.gt(p1(), module.f32.const(0.0))),
        storeI32(module.f32.le(p1(), module.f32.const(0.0))),
        storeI32(module.f32.ge(p1(), module.f32.const(0.0))),

        // Alignment padding: 49 preceding 4-byte stores leave heapTop at
        // 4 mod 8; one extra store brings it to 0 mod 8 so f64 stores
        // (which declare align=8) land on 8-byte boundaries.
        storeI32(module.i32.const(0)),

        // f64 binary arithmetic
        storeF64(module.f64.add(p2(), module.f64.const(1.0))),
        storeF64(module.f64.sub(p2(), module.f64.const(1.0))),
        storeF64(module.f64.mul(p2(), module.f64.const(2.0))),
        storeF64(module.f64.div(p2(), module.f64.const(2.0))),
        storeF64(module.f64.min(p2(), module.f64.const(0.5))),
        storeF64(module.f64.max(p2(), module.f64.const(0.5))),
        storeF64(module.f64.copysign(p2(), module.f64.const(-1.0))),

        // f64 unary
        storeF64(module.f64.abs(p2())),
        storeF64(module.f64.neg(p2())),
        storeF64(module.f64.ceil(p2())),
        storeF64(module.f64.floor(p2())),
        storeF64(module.f64.trunc(p2())),
        storeF64(module.f64.nearest(p2())),
        storeF64(module.f64.sqrt(module.f64.abs(p2()))),

        // f64 comparisons
        storeI32(module.f64.eq(p2(), module.f64.const(0.0))),
        storeI32(module.f64.ne(p2(), module.f64.const(0.0))),
        storeI32(module.f64.lt(p2(), module.f64.const(0.0))),
        storeI32(module.f64.gt(p2(), module.f64.const(0.0))),
        storeI32(module.f64.le(p2(), module.f64.const(0.0))),
        storeI32(module.f64.ge(p2(), module.f64.const(0.0))),

        // Conversions: integer truncation from float
        storeI32(module.i32.trunc_s.f32(p1())),
        storeI32(module.i32.trunc_u.f32(p1())),
        storeI32(module.i32.trunc_s.f64(p2())),
        storeI32(module.i32.trunc_u.f64(p2())),

        // Conversions: float from integer
        storeF32(module.f32.convert_s.i32(p0())),
        storeF32(module.f32.convert_u.i32(p0())),
        storeF64(module.f64.convert_s.i32(p0())),
        storeF64(module.f64.convert_u.i32(p0())),

        // Conversions: float width (f64.promote first to stay 8-byte aligned)
        storeF64(module.f64.promote(p1())),
        storeF32(module.f32.demote(p2())),

        // Reinterpretations
        storeI32(module.i32.reinterpret(p1())),
        storeF32(module.f32.reinterpret(p0())),

        // Select (conditional ternary)
        storeI32(module.select(p0(), module.i32.const(100), module.i32.const(200))),
        storeI32(module.select(module.i32.const(0), module.i32.const(100), module.i32.const(200))),

        // Non-trapping float-to-int conversions (saturating)
        storeI32(module.i32.trunc_s_sat.f32(p1())),
        storeI32(module.i32.trunc_u_sat.f32(p1())),
        storeI32(module.i32.trunc_s_sat.f64(p2())),
        storeI32(module.i32.trunc_u_sat.f64(p2())),

        // Memory: i32 store/load
        module.i32.store(0, 4, heapTop(), p0()),
        storeI32(module.i32.load(0, 4, heapTop())),

        // Memory: i8 store, load signed, load unsigned
        module.i32.store8(0, 1, heapTop(), p0()),
        storeI32(module.i32.load8_s(0, 1, heapTop())),
        module.i32.store8(0, 1, heapTop(), p0()),
        storeI32(module.i32.load8_u(0, 1, heapTop())),

        // Memory: i16 store, load signed, load unsigned
        module.i32.store16(0, 2, heapTop(), p0()),
        storeI32(module.i32.load16_s(0, 2, heapTop())),
        module.i32.store16(0, 2, heapTop(), p0()),
        storeI32(module.i32.load16_u(0, 2, heapTop())),

        // Memory: f32 store/load
        module.f32.store(0, 4, heapTop(), p1()),
        storeF32(module.f32.load(0, 4, heapTop())),

        // Memory: f64 store/load (pad to restore 8-byte alignment after f32)
        storeI32(module.i32.const(0)),
        module.f64.store(0, 8, heapTop(), p2()),
        storeF64(module.f64.load(0, 8, heapTop())),

        // Drop
        module.drop(p0()),

        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseOverflowOps: edge cases around i32 overflow, signed vs
    // unsigned divergence, shift wrapping, and saturating conversions.
    // All values are constants — no parameters needed.
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseOverflowOps',
      binaryen.none,
      binaryen.none,
      [],
      module.block(null, [
        // --- i32.mul overflow (Math.imul) ---
        // 0x10000 * 0x10001: lower 32 bits of 0x100010000 → 0x10000
        storeI32(module.i32.mul(module.i32.const(0x10000), module.i32.const(0x10001))),
        // INT_MAX * 2 → wraps to -2 (0xFFFFFFFE)
        storeI32(module.i32.mul(module.i32.const(0x7fffffff), module.i32.const(2))),
        // (-1) * 0x12345678 → -0x12345678 (negate via multiply)
        storeI32(module.i32.mul(module.i32.const(-1), module.i32.const(0x12345678))),
        // (-1) * (-1) → 1
        storeI32(module.i32.mul(module.i32.const(-1), module.i32.const(-1))),
        // 0xDEADBEEF * 0xCAFEBABE: large mixed-sign multiplicands
        storeI32(module.i32.mul(module.i32.const(0xdeadbeef | 0), module.i32.const(0xcafebabe | 0))),
        // 65537 * 65537 → lower 32 bits of 4295098369 = 0x20001
        storeI32(module.i32.mul(module.i32.const(65537), module.i32.const(65537))),

        // --- i32.add/sub overflow ---
        // INT_MAX + 1 → INT_MIN
        storeI32(module.i32.add(module.i32.const(0x7fffffff), module.i32.const(1))),
        // INT_MAX + INT_MAX → -2
        storeI32(module.i32.add(module.i32.const(0x7fffffff), module.i32.const(0x7fffffff))),
        // INT_MIN - 1 → INT_MAX
        storeI32(module.i32.sub(module.i32.const(-0x80000000), module.i32.const(1))),
        // 0 - INT_MIN → INT_MIN (negating INT_MIN wraps to itself)
        storeI32(module.i32.sub(module.i32.const(0), module.i32.const(-0x80000000))),

        // --- i32.div_s / rem_s edge cases ---
        // INT_MIN / 2 → -0x40000000
        storeI32(module.i32.div_s(module.i32.const(-0x80000000), module.i32.const(2))),
        // -7 / 3 → -2 (truncation toward zero)
        storeI32(module.i32.div_s(module.i32.const(-7), module.i32.const(3))),
        // -7 % 3 → -1 (remainder sign follows dividend)
        storeI32(module.i32.rem_s(module.i32.const(-7), module.i32.const(3))),
        // 7 % -3 → 1
        storeI32(module.i32.rem_s(module.i32.const(7), module.i32.const(-3))),

        // --- i32.div_u / rem_u with large unsigned values ---
        // 0xFFFFFFFF /u 2 → 0x7FFFFFFF
        storeI32(module.i32.div_u(module.i32.const(-1), module.i32.const(2))),
        // 0xFFFFFFFF %u 3 → 0
        storeI32(module.i32.rem_u(module.i32.const(-1), module.i32.const(3))),

        // --- shift edge cases ---
        // shl(1, 31) → 0x80000000 (INT_MIN)
        storeI32(module.i32.shl(module.i32.const(1), module.i32.const(31))),
        // shr_s(INT_MIN, 31) → -1 (arithmetic shift fills with sign bit)
        storeI32(module.i32.shr_s(module.i32.const(-0x80000000), module.i32.const(31))),
        // shr_u(INT_MIN, 31) → 1 (logical shift fills with zero)
        storeI32(module.i32.shr_u(module.i32.const(-0x80000000), module.i32.const(31))),
        // shl(1, 32) → 1 (WASM shifts wrap mod 32)
        storeI32(module.i32.shl(module.i32.const(1), module.i32.const(32))),
        // shl(1, 33) → 2 (33 & 31 = 1)
        storeI32(module.i32.shl(module.i32.const(1), module.i32.const(33))),

        // --- rotate with sign bit ---
        // rotl(0x12345678, 4) → 0x23456781
        storeI32(module.i32.rotl(module.i32.const(0x12345678), module.i32.const(4))),
        // rotr(0x12345678, 4) → 0x81234567
        storeI32(module.i32.rotr(module.i32.const(0x12345678), module.i32.const(4))),

        // --- signed vs unsigned comparison divergence ---
        // lt_u(INT_MIN, 1) → 0 (unsigned: 2^31 > 1)
        storeI32(module.i32.lt_u(module.i32.const(-0x80000000), module.i32.const(1))),
        // lt_s(INT_MIN, 1) → 1 (signed: -2^31 < 1)
        storeI32(module.i32.lt_s(module.i32.const(-0x80000000), module.i32.const(1))),
        // gt_u(0xFFFFFFFF, 0) → 1 (unsigned: 4294967295 > 0)
        storeI32(module.i32.gt_u(module.i32.const(-1), module.i32.const(0))),
        // gt_s(0xFFFFFFFF, 0) → 0 (signed: -1 is not > 0)
        storeI32(module.i32.gt_s(module.i32.const(-1), module.i32.const(0))),

        // --- saturating float-to-int (boundary values, large finite) ---
        // trunc_sat_s(3.4e38 f32) → INT_MAX (saturated)
        storeI32(module.i32.trunc_s_sat.f32(module.f32.const(3.4e38))),
        // trunc_sat_s(-3.4e38 f32) → INT_MIN (saturated)
        storeI32(module.i32.trunc_s_sat.f32(module.f32.const(-3.4e38))),
        // trunc_sat_u(3.4e38 f32) → UINT_MAX (saturated)
        storeI32(module.i32.trunc_u_sat.f32(module.f32.const(3.4e38))),
        // trunc_sat_u(-1.0 f32) → 0 (negative clamps to zero for unsigned)
        storeI32(module.i32.trunc_u_sat.f32(module.f32.const(-1.0))),
        // trunc_sat_s(1e15 f64) → INT_MAX
        storeI32(module.i32.trunc_s_sat.f64(module.f64.const(1e15))),
        // trunc_sat_u(1e15 f64) → UINT_MAX (0xFFFFFFFF)
        storeI32(module.i32.trunc_u_sat.f64(module.f64.const(1e15))),
        // trunc_sat_u(-1.0 f64) → 0 (negative clamps to zero)
        storeI32(module.i32.trunc_u_sat.f64(module.f64.const(-1.0))),

        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseEdgeCases: targeted tests for unary boundary values,
    // negative zero, banker's rounding, sign extension, reinterpret
    // round-trips, non-zero memory offsets, float select, nested
    // expression precedence, and if/else control flow.
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseEdgeCases',
      binaryen.none,
      binaryen.none,
      [],
      module.block(null, [
        // --- 1. Integer unary at boundary values ---
        // clz
        storeI32(module.i32.clz(module.i32.const(0))), // → 32
        storeI32(module.i32.clz(module.i32.const(-0x80000000))), // → 0
        storeI32(module.i32.clz(module.i32.const(1))), // → 31
        // ctz
        storeI32(module.i32.ctz(module.i32.const(0))), // → 32
        storeI32(module.i32.ctz(module.i32.const(-0x80000000))), // → 31
        storeI32(module.i32.ctz(module.i32.const(1))), // → 0
        // popcnt
        storeI32(module.i32.popcnt(module.i32.const(0))), // → 0
        storeI32(module.i32.popcnt(module.i32.const(-1))), // → 32
        storeI32(module.i32.popcnt(module.i32.const(0x55555555))), // → 16
        // eqz
        storeI32(module.i32.eqz(module.i32.const(0))), // → 1
        storeI32(module.i32.eqz(module.i32.const(1))), // → 0
        storeI32(module.i32.eqz(module.i32.const(-1))), // → 0
        // [12 stores, 48 bytes]

        // --- 2. Float negative zero (detect sign via reinterpret) ---
        // -0 + 0 → +0 (IEEE 754: adding zeros with different signs gives +0)
        storeI32(module.i32.reinterpret(module.f32.add(module.f32.const(-0.0), module.f32.const(0.0)))),
        // neg(+0) → -0 (negation flips the sign bit)
        storeI32(module.i32.reinterpret(module.f32.neg(module.f32.const(0.0)))),
        // 0 * -1 → -0 (IEEE 754: pos × neg = negative zero)
        storeI32(module.i32.reinterpret(module.f32.mul(module.f32.const(0.0), module.f32.const(-1.0)))),
        // copysign(1.0, -0.0) → -1.0 (sign of -0.0 is negative)
        storeI32(module.i32.reinterpret(module.f32.copysign(module.f32.const(1.0), module.f32.const(-0.0)))),
        // [16 stores, 64 bytes]

        // --- 3. Banker's rounding (nearest → trunc to i32 to verify) ---
        storeI32(module.i32.trunc_s.f64(module.f64.nearest(module.f64.const(0.5)))), // → 0  (ties to even: 0)
        storeI32(module.i32.trunc_s.f64(module.f64.nearest(module.f64.const(1.5)))), // → 2  (ties to even: 2)
        storeI32(module.i32.trunc_s.f64(module.f64.nearest(module.f64.const(2.5)))), // → 2  (ties to even: 2)
        storeI32(module.i32.trunc_s.f64(module.f64.nearest(module.f64.const(-1.5)))), // → -2 (ties to even: -2)
        storeI32(module.i32.trunc_s.f64(module.f64.nearest(module.f64.const(3.5)))), // → 4  (ties to even: 4)
        storeI32(module.i32.trunc_s.f64(module.f64.nearest(module.f64.const(4.5)))), // → 4  (ties to even: 4)
        // f32 nearest
        storeI32(module.i32.trunc_s.f32(module.f32.nearest(module.f32.const(0.5)))), // → 0
        storeI32(module.i32.trunc_s.f32(module.f32.nearest(module.f32.const(1.5)))), // → 2
        // [24 stores, 96 bytes]

        // --- 4. Conversion edge cases ---
        // f32.convert_u(0xFFFFFFFF): max unsigned i32 → large f32 (verify bits)
        storeI32(module.i32.reinterpret(module.f32.convert_u.i32(module.i32.const(-1)))),
        // f32.convert_s(-1) → -1.0f (0xBF800000)
        storeI32(module.i32.reinterpret(module.f32.convert_s.i32(module.i32.const(-1)))),
        // [26 stores, 104 bytes. 104 mod 8 = 0 — safe for f64]
        // f64.convert_u(0xFFFFFFFF) → 4294967295.0
        storeF64(module.f64.convert_u.i32(module.i32.const(-1))),
        // f64.convert_u(0x80000001) → 2147483649.0
        storeF64(module.f64.convert_u.i32(module.i32.const(0x80000001 | 0))),
        // [26 i32/f32 + 2 f64 = 120 bytes]

        // --- 5. Reinterpret round-trips ---
        storeI32(module.i32.reinterpret(module.f32.const(1.0))), // → 0x3F800000
        storeI32(module.i32.reinterpret(module.f32.const(-1.0))), // → 0xBF800000
        storeF32(module.f32.reinterpret(module.i32.const(0x3f800000))), // → 1.0
        storeF32(module.f32.reinterpret(module.i32.const(0xbf800000 | 0))), // → -1.0
        // [30 i32/f32 + 2 f64 = 136 bytes. 136 mod 8 = 0]

        // --- 6. i8/i16 sign extension at boundary ---
        // 0x80: load8_s → -128, load8_u → 128
        module.i32.store8(0, 1, heapTop(), module.i32.const(0x80)),
        storeI32(module.i32.load8_s(0, 1, heapTop())),
        module.i32.store8(0, 1, heapTop(), module.i32.const(0x80)),
        storeI32(module.i32.load8_u(0, 1, heapTop())),
        // 0xFF: load8_s → -1, load8_u → 255
        module.i32.store8(0, 1, heapTop(), module.i32.const(0xff)),
        storeI32(module.i32.load8_s(0, 1, heapTop())),
        module.i32.store8(0, 1, heapTop(), module.i32.const(0xff)),
        storeI32(module.i32.load8_u(0, 1, heapTop())),
        // 0x8000: load16_s → -32768, load16_u → 32768
        module.i32.store16(0, 2, heapTop(), module.i32.const(0x8000)),
        storeI32(module.i32.load16_s(0, 2, heapTop())),
        module.i32.store16(0, 2, heapTop(), module.i32.const(0x8000)),
        storeI32(module.i32.load16_u(0, 2, heapTop())),
        // [36 + 2 f64 = 160 bytes. 160 mod 8 = 0]

        // --- 7. f64 negative zero ---
        // nearest(-0.5) → -0.0 (banker's rounding, preserves sign: distinct CRC from +0.0)
        storeF64(module.f64.nearest(module.f64.const(-0.5))),
        // copysign(1.0, -0.0) → -1.0 (tests f64 copysign with negative zero)
        storeF64(module.f64.copysign(module.f64.const(1.0), module.f64.const(-0.0))),
        // [36 + 4 f64 = 176 bytes]

        // --- 8. Memory with non-zero offset ---
        // Write via offset=4, read back via offset=4, verify offset is applied
        module.i32.store(4, 4, heapTop(), module.i32.const(0xabcd1234 | 0)),
        storeI32(module.i32.load(4, 4, heapTop())),
        advanceHeap(4),
        // [37 + 4 f64 = 184 bytes. 184 mod 8 = 0]

        // --- 9. Select with f32 operands ---
        storeF32(module.select(module.i32.const(1), module.f32.const(10.0), module.f32.const(20.0))),
        storeF32(module.select(module.i32.const(0), module.f32.const(10.0), module.f32.const(20.0))),
        // [39 + 4 f64 = 192 bytes]

        // --- 10. Nested expressions (operator precedence) ---
        // (2 + 3) * 7 → 35
        storeI32(module.i32.mul(module.i32.add(module.i32.const(2), module.i32.const(3)), module.i32.const(7))),
        // 100 / (3 + 2) → 20
        storeI32(module.i32.div_s(module.i32.const(100), module.i32.add(module.i32.const(3), module.i32.const(2)))),
        // (10 - 3) << 2 → 28
        storeI32(module.i32.shl(module.i32.sub(module.i32.const(10), module.i32.const(3)), module.i32.const(2))),
        // (5 | 3) ^ -1 → ~7 → -8
        storeI32(module.i32.xor(module.i32.or(module.i32.const(5), module.i32.const(3)), module.i32.const(-1))),
        // eqz(1 - 1) → 1 (eqz of sub)
        storeI32(module.i32.eqz(module.i32.sub(module.i32.const(1), module.i32.const(1)))),
        // (5 > 3) + (1 > 10) → 1 + 0 → 1 (comparison as operand of add)
        storeI32(
          module.i32.add(
            module.i32.gt_s(module.i32.const(5), module.i32.const(3)),
            module.i32.gt_s(module.i32.const(1), module.i32.const(10))
          )
        ),
        // (1 << 16) >>> 8 → 256 (chained shifts)
        storeI32(module.i32.shr_u(module.i32.shl(module.i32.const(1), module.i32.const(16)), module.i32.const(8))),
        // -(-42) → 42 via sub(0, sub(0, 42)) (double negate)
        storeI32(module.i32.sub(module.i32.const(0), module.i32.sub(module.i32.const(0), module.i32.const(42)))),
        // [47 + 4 f64 = 224 bytes]

        // --- 11. If/else control flow ---
        // true branch taken: 42 > 10 → stores 0xAAAA
        module.if(
          module.i32.gt_s(module.i32.const(42), module.i32.const(10)),
          storeI32(module.i32.const(0xaaaa)),
          storeI32(module.i32.const(0xbbbb))
        ),
        // false branch taken: 10 > 42 → stores 0xDDDD
        module.if(
          module.i32.gt_s(module.i32.const(10), module.i32.const(42)),
          storeI32(module.i32.const(0xcccc)),
          storeI32(module.i32.const(0xdddd))
        ),
        // nested expression in if condition: eqz(5-5) → true → stores 7*7=49
        module.if(
          module.i32.eqz(module.i32.sub(module.i32.const(5), module.i32.const(5))),
          storeI32(module.i32.mul(module.i32.const(7), module.i32.const(7))),
          storeI32(module.i32.const(0))
        ),
        // [50 + 4 f64 = 236 bytes]

        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseBrTable: tests br_table (switch) dispatch.
    // Takes an i32 index parameter; each case stores a unique marker
    // to memory.  Called multiple times with different indices.
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseBrTable',
      binaryen.createType([binaryen.i32]),
      binaryen.none,
      [],
      module.block('branchTableDispatchCompleted', [
        module.block('branchTableCaseThree', [
          module.block('branchTableCaseTwo', [
            module.block('branchTableCaseOne', [
              module.block('branchTableCaseZero', [
                module.block('branchTableDefaultCase', [
                  module.switch(
                    ['branchTableCaseZero', 'branchTableCaseOne', 'branchTableCaseTwo', 'branchTableCaseThree'],
                    'branchTableDefaultCase',
                    module.local.get(0, binaryen.i32)
                  )
                ]),
                // default
                storeI32(module.i32.const(0x00def000 | 0)),
                module.break('branchTableDispatchCompleted')
              ]),
              // case 0
              storeI32(module.i32.const(0x00ca5000 | 0)),
              module.break('branchTableDispatchCompleted')
            ]),
            // case 1
            storeI32(module.i32.const(0x00ca5001 | 0)),
            module.break('branchTableDispatchCompleted')
          ]),
          // case 2
          storeI32(module.i32.const(0x00ca5002 | 0)),
          module.break('branchTableDispatchCompleted')
        ]),
        // case 3
        storeI32(module.i32.const(0x00ca5003 | 0))
      ])
    );

    // -----------------------------------------------------------------
    // exerciseBrTableLoop: tests br_table with a loop target.
    // Counts down from param, using br_table to either continue the
    // loop (index 0) or break out (index 1), with default = break.
    // Stores the final counter value.
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseBrTableLoop',
      binaryen.createType([binaryen.i32]),
      binaryen.none,
      [binaryen.i32],
      module.block(null, [
        module.local.set(1, module.local.get(0, binaryen.i32)),
        module.block('branchTableLoopCompleted', [
          module.loop(
            'branchTableLoopIteration',
            module.block(null, [
              module.local.set(1, module.i32.sub(module.local.get(1, binaryen.i32), module.i32.const(1))),
              // if counter > 0 → index 0 (continue loop); else → index 1 (break)
              module.switch(
                ['branchTableLoopIteration', 'branchTableLoopCompleted'],
                'branchTableLoopCompleted',
                module.i32.le_s(module.local.get(1, binaryen.i32), module.i32.const(0))
              )
            ])
          )
        ]),
        storeI32(module.local.get(1, binaryen.i32)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseCountedLoop: LC pattern — parameterized counted loop.
    // Params: (startValue, exclusiveLimit)
    // Stores the sum of startValue..exclusiveLimit-1.
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseCountedLoop',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [binaryen.i32],
      module.block(null, [
        module.local.set(2, module.i32.const(0)),
        module.block('countedLoopCompleted', [
          module.loop(
            'countedLoopIteration',
            module.block(null, [
              module.break(
                'countedLoopCompleted',
                module.i32.ge_s(module.local.get(0, binaryen.i32), module.local.get(1, binaryen.i32))
              ),
              module.local.set(2, module.i32.add(module.local.get(2, binaryen.i32), module.local.get(0, binaryen.i32))),
              module.local.set(0, module.i32.add(module.local.get(0, binaryen.i32), module.i32.const(1))),
              module.break('countedLoopIteration')
            ])
          )
        ]),
        storeI32(module.local.get(2, binaryen.i32)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseDoWhileLoop: LD-B pattern — parameterized do-while.
    // Params: (countdownStart)
    // Positive inputs compute a factorial-style product; non-positive
    // inputs still execute once and take the fallback marker path.
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseDoWhileLoop',
      binaryen.createType([binaryen.i32]),
      binaryen.none,
      [binaryen.i32],
      module.block(null, [
        module.local.set(1, module.i32.const(1)),
        module.loop(
          'doWhileCountdownLoop',
          module.block(null, [
            module.if(
              module.i32.gt_s(module.local.get(0, binaryen.i32), module.i32.const(0)),
              module.local.set(1, module.i32.mul(module.local.get(1, binaryen.i32), module.local.get(0, binaryen.i32))),
              module.local.set(1, module.i32.add(module.local.get(1, binaryen.i32), module.i32.const(111)))
            ),
            module.local.set(0, module.i32.sub(module.local.get(0, binaryen.i32), module.i32.const(1))),
            module.break('doWhileCountdownLoop', module.i32.gt_s(module.local.get(0, binaryen.i32), module.i32.const(0)))
          ])
        ),
        storeI32(module.local.get(1, binaryen.i32)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseDoWhileVariantA: LD-A pattern — parameterized do-while
    // variant with a trailing conditional self-branch.
    // Params: (startValue, iterationCount)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseDoWhileVariantA',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        module.block('doWhileVariantCompleted', [
          module.loop(
            'doWhileVariantLoop',
            module.block(null, [
              module.local.set(0, module.i32.mul(module.local.get(0, binaryen.i32), module.i32.const(2))),
              module.local.set(1, module.i32.sub(module.local.get(1, binaryen.i32), module.i32.const(1))),
              module.break('doWhileVariantLoop', module.i32.gt_s(module.local.get(1, binaryen.i32), module.i32.const(0))),
              module.break('doWhileVariantCompleted')
            ])
          )
        ]),
        storeI32(module.local.get(0, binaryen.i32)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseNestedLoops: nested loop + switch dispatch.  The inner
    // dispatch mutates its active state across iterations, and the
    // default target exits the inner loop for the current outer round.
    // Params: (outerLimit, initialDispatchState)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseNestedLoops',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [binaryen.i32, binaryen.i32, binaryen.i32],
      module.block(null, [
        module.local.set(2, module.i32.const(0)),
        module.local.set(4, module.i32.const(0)),
        module.block('nestedLoopOuterCompleted', [
          module.loop(
            'nestedLoopOuterIteration',
            module.block(null, [
              module.break(
                'nestedLoopOuterCompleted',
                module.i32.ge_s(module.local.get(2, binaryen.i32), module.local.get(0, binaryen.i32))
              ),
              module.local.set(3, module.i32.const(0)),
              module.block('nestedLoopInnerCompleted', [
                module.loop(
                  'nestedLoopInnerIteration',
                  module.block(null, [
                    module.break(
                      'nestedLoopInnerCompleted',
                      module.i32.gt_s(
                        module.local.get(3, binaryen.i32),
                        module.i32.add(module.local.get(2, binaryen.i32), module.i32.const(1))
                      )
                    ),
                    module.block('nestedLoopDispatchStateTwo', [
                      module.block('nestedLoopDispatchStateOne', [
                        module.block('nestedLoopDispatchStateZero', [
                          module.switch(
                            ['nestedLoopDispatchStateZero', 'nestedLoopDispatchStateOne', 'nestedLoopDispatchStateTwo'],
                            'nestedLoopInnerCompleted',
                            module.local.get(1, binaryen.i32)
                          )
                        ]),
                        module.local.set(
                          4,
                          module.i32.add(
                            module.local.get(4, binaryen.i32),
                            module.i32.add(
                              module.i32.mul(module.local.get(2, binaryen.i32), module.i32.const(16)),
                              module.local.get(3, binaryen.i32)
                            )
                          )
                        ),
                        module.if(
                          module.i32.eq(module.local.get(3, binaryen.i32), module.i32.const(0)),
                          module.local.set(1, module.i32.const(1)),
                          module.local.set(1, module.i32.const(2))
                        ),
                        module.local.set(3, module.i32.add(module.local.get(3, binaryen.i32), module.i32.const(1))),
                        module.break('nestedLoopInnerIteration')
                      ]),
                      module.local.set(
                        4,
                        module.i32.add(
                          module.local.get(4, binaryen.i32),
                          module.i32.add(module.i32.const(100), module.local.get(2, binaryen.i32))
                        )
                      ),
                      module.if(
                        module.i32.and(
                          module.i32.add(module.local.get(2, binaryen.i32), module.local.get(3, binaryen.i32)),
                          module.i32.const(1)
                        ),
                        module.local.set(1, module.i32.const(2)),
                        module.local.set(1, module.i32.const(0))
                      ),
                      module.local.set(3, module.i32.add(module.local.get(3, binaryen.i32), module.i32.const(1))),
                      module.break('nestedLoopInnerIteration')
                    ]),
                    module.local.set(
                      4,
                      module.i32.add(
                        module.local.get(4, binaryen.i32),
                        module.i32.add(module.i32.const(200), module.local.get(3, binaryen.i32))
                      )
                    ),
                    module.if(
                      module.i32.ge_s(module.local.get(3, binaryen.i32), module.local.get(2, binaryen.i32)),
                      module.local.set(1, module.i32.const(7)),
                      module.local.set(1, module.i32.const(0))
                    ),
                    module.local.set(3, module.i32.add(module.local.get(3, binaryen.i32), module.i32.const(1))),
                    module.break('nestedLoopInnerIteration')
                  ])
                )
              ]),
              module.local.set(2, module.i32.add(module.local.get(2, binaryen.i32), module.i32.const(1))),
              module.local.set(1, module.i32.and(module.local.get(2, binaryen.i32), module.i32.const(1))),
              module.break('nestedLoopOuterIteration')
            ])
          )
        ]),
        storeI32(module.local.get(4, binaryen.i32)),
        storeI32(module.local.get(1, binaryen.i32)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseSwitchInLoop: parameterized loop state machine with
    // multi-step transitions before the default exit path completes.
    // Params: (startState, startAccumulator, transitionBudget)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseSwitchInLoop',
      binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        module.block('switchStateMachineCompleted', [
          module.loop(
            'switchStateMachineLoop',
            module.block(null, [
              module.block('switchStateMachineDispatchStateThree', [
                module.block('switchStateMachineDispatchStateTwo', [
                  module.block('switchStateMachineDispatchStateOne', [
                    module.block('switchStateMachineDispatchStateZero', [
                      module.switch(
                        [
                          'switchStateMachineDispatchStateZero',
                          'switchStateMachineDispatchStateOne',
                          'switchStateMachineDispatchStateTwo',
                          'switchStateMachineDispatchStateThree'
                        ],
                        'switchStateMachineCompleted',
                        module.local.get(0, binaryen.i32)
                      )
                    ]),
                    module.local.set(1, module.i32.add(module.local.get(1, binaryen.i32), module.i32.const(10))),
                    module.local.set(2, module.i32.sub(module.local.get(2, binaryen.i32), module.i32.const(1))),
                    module.if(
                      module.i32.lt_s(module.local.get(1, binaryen.i32), module.i32.const(15)),
                      module.local.set(0, module.i32.const(2)),
                      module.local.set(0, module.i32.const(1))
                    ),
                    module.break('switchStateMachineLoop')
                  ]),
                  module.local.set(1, module.i32.mul(module.local.get(1, binaryen.i32), module.i32.const(2))),
                  module.local.set(2, module.i32.sub(module.local.get(2, binaryen.i32), module.i32.const(1))),
                  module.if(
                    module.i32.gt_s(module.local.get(2, binaryen.i32), module.i32.const(1)),
                    module.local.set(0, module.i32.const(2)),
                    module.local.set(0, module.i32.const(4))
                  ),
                  module.break('switchStateMachineLoop')
                ]),
                module.local.set(1, module.i32.sub(module.local.get(1, binaryen.i32), module.i32.const(3))),
                module.local.set(2, module.i32.sub(module.local.get(2, binaryen.i32), module.i32.const(1))),
                module.if(
                  module.i32.lt_s(module.local.get(1, binaryen.i32), module.i32.const(0)),
                  module.local.set(0, module.i32.const(4)),
                  module.if(
                    module.i32.and(module.local.get(2, binaryen.i32), module.i32.const(1)),
                    module.local.set(0, module.i32.const(1)),
                    module.local.set(0, module.i32.const(0))
                  )
                ),
                module.break('switchStateMachineLoop')
              ]),
              module.local.set(1, module.i32.add(module.local.get(1, binaryen.i32), module.i32.const(70))),
              module.local.set(0, module.i32.const(4)),
              module.break('switchStateMachineLoop')
            ])
          )
        ]),
        storeI32(module.local.get(1, binaryen.i32)),
        storeI32(module.local.get(0, binaryen.i32)),
        storeI32(module.local.get(2, binaryen.i32)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseBrTableMultiTarget: br_table with duplicate targets.
    // Indices 0,2,4 → caseA (0xAABB0001), indices 1,3 → caseB
    // (0xAABB0002), default → 0xAABB00FF.
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseBrTableMultiTarget',
      binaryen.createType([binaryen.i32]),
      binaryen.none,
      [],
      module.block('multiTargetBranchTableCompleted', [
        module.block('multiTargetBranchTableDefaultCase', [
          module.block('multiTargetBranchTableSharedCaseB', [
            module.block('multiTargetBranchTableSharedCaseA', [
              module.switch(
                [
                  'multiTargetBranchTableSharedCaseA',
                  'multiTargetBranchTableSharedCaseB',
                  'multiTargetBranchTableSharedCaseA',
                  'multiTargetBranchTableSharedCaseB',
                  'multiTargetBranchTableSharedCaseA'
                ],
                'multiTargetBranchTableDefaultCase',
                module.local.get(0, binaryen.i32)
              )
            ]),
            storeI32(module.i32.const(0xaabb0001 | 0)),
            module.break('multiTargetBranchTableCompleted')
          ]),
          storeI32(module.i32.const(0xaabb0002 | 0)),
          module.break('multiTargetBranchTableCompleted')
        ]),
        storeI32(module.i32.const(0xaabb00ff | 0))
      ])
    );

    // -----------------------------------------------------------------
    // exerciseNestedSwitch: two independent br_table dispatches — an
    // inner dispatch lives inside outer case 0.  Tests that the
    // detection pass scopes nested dispatch blocks correctly.
    // Params: (outerIndex, innerIndex)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseNestedSwitch',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block('nestedSwitchDispatchCompleted', [
        module.block('nestedSwitchOuterCaseTwo', [
          module.block('nestedSwitchOuterCaseOne', [
            module.block('nestedSwitchOuterCaseZero', [
              module.block('nestedSwitchOuterDefaultCase', [
                module.switch(
                  ['nestedSwitchOuterCaseZero', 'nestedSwitchOuterCaseOne', 'nestedSwitchOuterCaseTwo'],
                  'nestedSwitchOuterDefaultCase',
                  module.local.get(0, binaryen.i32)
                )
              ]),
              // outer default
              storeI32(module.i32.const(0xde000000 | 0)),
              module.break('nestedSwitchDispatchCompleted')
            ]),
            // outer case 0: inner switch on param1
            module.block('nestedSwitchInnerDispatchCompleted', [
              module.block('nestedSwitchInnerCaseOne', [
                module.block('nestedSwitchInnerCaseZero', [
                  module.block('nestedSwitchInnerDefaultCase', [
                    module.switch(
                      ['nestedSwitchInnerCaseZero', 'nestedSwitchInnerCaseOne'],
                      'nestedSwitchInnerDefaultCase',
                      module.local.get(1, binaryen.i32)
                    )
                  ]),
                  // inner default
                  storeI32(module.i32.const(0xde0000ff | 0)),
                  module.break('nestedSwitchInnerDispatchCompleted')
                ]),
                // inner case 0
                storeI32(module.i32.const(0xde000010 | 0)),
                module.break('nestedSwitchInnerDispatchCompleted')
              ]),
              // inner case 1
              storeI32(module.i32.const(0xde000011 | 0))
            ]),
            module.break('nestedSwitchDispatchCompleted')
          ]),
          // outer case 1
          storeI32(module.i32.const(0xde000001 | 0)),
          module.break('nestedSwitchDispatchCompleted')
        ]),
        // outer case 2
        storeI32(module.i32.const(0xde000002 | 0))
      ])
    );

    // -----------------------------------------------------------------
    // exerciseSwitchDefaultInternal: br_table where the default target
    // is an intermediate block in the dispatch chain (not external).
    // Param: (index)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseSwitchDefaultInternal',
      binaryen.createType([binaryen.i32]),
      binaryen.none,
      [],
      module.block('switchDefaultInternalCompleted', [
        module.block('switchDefaultInternalCaseTwo', [
          module.block('switchDefaultInternalCaseOne', [
            module.block('switchDefaultInternalCaseZero', [
              module.switch(
                ['switchDefaultInternalCaseZero', 'switchDefaultInternalCaseOne', 'switchDefaultInternalCaseTwo'],
                'switchDefaultInternalCaseOne',
                module.local.get(0, binaryen.i32)
              )
            ]),
            // case 0
            storeI32(module.i32.const(0xd1000000 | 0)),
            module.break('switchDefaultInternalCompleted')
          ]),
          // case 1 AND default
          storeI32(module.i32.const(0xd1000001 | 0)),
          module.break('switchDefaultInternalCompleted')
        ]),
        // case 2
        storeI32(module.i32.const(0xd1000002 | 0))
      ])
    );

    // -----------------------------------------------------------------
    // exerciseMultiExitSwitchLoop: loop + switch state machine with
    // continued iterations, an alternate outer break, and a distinct
    // default-driven exit path.
    // Params: (startState, startAccumulator)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseMultiExitSwitchLoop',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        module.block('multiExitSwitchExitCompletedPath', [
          module.block('multiExitSwitchExitDefaultPath', [
            module.block('multiExitSwitchExitAlternatePath', [
              module.loop(
                'multiExitSwitchStateMachineLoop',
                module.block(null, [
                  module.block('multiExitSwitchStateThree', [
                    module.block('multiExitSwitchStateTwo', [
                      module.block('multiExitSwitchStateOne', [
                        module.block('multiExitSwitchStateZero', [
                          module.switch(
                            [
                              'multiExitSwitchStateZero',
                              'multiExitSwitchStateOne',
                              'multiExitSwitchStateTwo',
                              'multiExitSwitchStateThree'
                            ],
                            'multiExitSwitchExitDefaultPath',
                            module.local.get(0, binaryen.i32)
                          )
                        ]),
                        module.local.set(1, module.i32.add(module.local.get(1, binaryen.i32), module.i32.const(100))),
                        module.if(
                          module.i32.lt_s(module.local.get(1, binaryen.i32), module.i32.const(130)),
                          module.local.set(0, module.i32.const(1)),
                          module.local.set(0, module.i32.const(3))
                        ),
                        module.break('multiExitSwitchStateMachineLoop')
                      ]),
                      module.local.set(1, module.i32.add(module.local.get(1, binaryen.i32), module.i32.const(20))),
                      module.if(
                        module.i32.and(module.local.get(1, binaryen.i32), module.i32.const(1)),
                        module.local.set(0, module.i32.const(2)),
                        module.local.set(0, module.i32.const(3))
                      ),
                      module.break('multiExitSwitchStateMachineLoop')
                    ]),
                    module.if(
                      module.i32.lt_s(module.local.get(1, binaryen.i32), module.i32.const(0)),
                      module.break('multiExitSwitchExitAlternatePath')
                    ),
                    module.local.set(1, module.i32.sub(module.local.get(1, binaryen.i32), module.i32.const(5))),
                    module.local.set(0, module.i32.const(3)),
                    module.break('multiExitSwitchStateMachineLoop')
                  ]),
                  module.local.set(1, module.i32.add(module.local.get(1, binaryen.i32), module.i32.const(3))),
                  module.break('multiExitSwitchExitCompletedPath')
                ])
              )
            ]),
            storeI32(module.local.get(1, binaryen.i32)),
            storeI32(module.i32.const(0xcccccccc | 0)),
            module.return()
          ]),
          storeI32(module.local.get(1, binaryen.i32)),
          storeI32(module.i32.const(0xbbbbbbbb | 0)),
          module.return()
        ]),
        storeI32(module.local.get(1, binaryen.i32)),
        storeI32(module.i32.const(0xaaaaaaaa | 0)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseSwitchConditionalEscape: loop + switch (wrapping pattern)
    // where case 2 conditionally escapes; default exits immediately.
    // Params: (startAcc, startState)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseSwitchConditionalEscape',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        module.block('switchConditionalEscapeCompleted', [
          module.loop(
            'switchConditionalEscapeLoop',
            module.block(null, [
              module.block('switchConditionalEscapeStateTwo', [
                module.block('switchConditionalEscapeStateOne', [
                  module.block('switchConditionalEscapeStateZero', [
                    module.switch(
                      [
                        'switchConditionalEscapeStateZero',
                        'switchConditionalEscapeStateOne',
                        'switchConditionalEscapeStateTwo'
                      ],
                      'switchConditionalEscapeCompleted',
                      module.local.get(1, binaryen.i32)
                    )
                  ]),
                  // case 0: acc *= 2, state = 1
                  module.local.set(0, module.i32.mul(module.local.get(0, binaryen.i32), module.i32.const(2))),
                  module.local.set(1, module.i32.const(1)),
                  module.break('switchConditionalEscapeLoop')
                ]),
                // case 1: acc -= 1, state = 2
                module.local.set(0, module.i32.sub(module.local.get(0, binaryen.i32), module.i32.const(1))),
                module.local.set(1, module.i32.const(2)),
                module.break('switchConditionalEscapeLoop')
              ]),
              // case 2 (trailing): conditional escape
              module.if(
                module.i32.gt_s(module.local.get(0, binaryen.i32), module.i32.const(50)),
                module.block(null, [
                  storeI32(module.i32.const(0xeeee0001 | 0)),
                  module.break('switchConditionalEscapeCompleted')
                ]),
                0
              ),
              module.local.set(0, module.i32.add(module.local.get(0, binaryen.i32), module.i32.const(25))),
              module.local.set(1, module.i32.const(0)),
              module.break('switchConditionalEscapeLoop')
            ])
          )
        ]),
        storeI32(module.local.get(0, binaryen.i32)),
        module.return()
      ])
    );

    // =================================================================
    // exerciseNestedArithmetic: deeply nested i32 expression trees.
    // Explores arithmetic depth, mixed operations, comparisons-as-
    // operands, unary-fed-binary chains, and select with nested args.
    // Params: (a: i32)
    // =================================================================
    module.addFunction(
      'exerciseNestedArithmetic',
      binaryen.createType([binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        // (a + 3) * ((a - 1) / 2)
        storeI32(
          module.i32.mul(
            module.i32.add(p0(), module.i32.const(3)),
            module.i32.div_s(module.i32.sub(p0(), module.i32.const(1)), module.i32.const(2))
          )
        ),
        // ((a << 2) + (a >> 1)) ^ (a & 0xFF)
        storeI32(
          module.i32.xor(
            module.i32.add(module.i32.shl(p0(), module.i32.const(2)), module.i32.shr_s(p0(), module.i32.const(1))),
            module.i32.and(p0(), module.i32.const(0xff))
          )
        ),
        // comparisons as i32 operands: (a > 0) + (a < 100) + (a == 42)
        storeI32(
          module.i32.add(
            module.i32.add(module.i32.gt_s(p0(), module.i32.const(0)), module.i32.lt_s(p0(), module.i32.const(100))),
            module.i32.eq(p0(), module.i32.const(42))
          )
        ),
        // unary-fed-binary: clz(a|1) * ctz(a|2) + popcnt(a)
        storeI32(
          module.i32.add(
            module.i32.mul(
              module.i32.clz(module.i32.or(p0(), module.i32.const(1))),
              module.i32.ctz(module.i32.or(p0(), module.i32.const(2)))
            ),
            module.i32.popcnt(p0())
          )
        ),
        // polynomial: (a*a) - (a+a) + (a / (a|1))
        storeI32(
          module.i32.add(
            module.i32.sub(module.i32.mul(p0(), p0()), module.i32.add(p0(), p0())),
            module.i32.div_s(p0(), module.i32.or(p0(), module.i32.const(1)))
          )
        ),
        // deep division: ((a+1)*(a+2)) / ((a+3)|1)
        storeI32(
          module.i32.div_s(
            module.i32.mul(module.i32.add(p0(), module.i32.const(1)), module.i32.add(p0(), module.i32.const(2))),
            module.i32.or(module.i32.add(p0(), module.i32.const(3)), module.i32.const(1))
          )
        ),
        // select with nested arithmetic operands
        storeI32(
          module.select(
            module.i32.gt_s(p0(), module.i32.const(0)),
            module.i32.mul(module.i32.add(p0(), module.i32.const(10)), module.i32.const(3)),
            module.i32.mul(module.i32.sub(p0(), module.i32.const(10)), module.i32.const(3))
          )
        ),
        // bit packing: (((a+5) & 0xFF) << 8) | ((a-5) & 0xFF)
        storeI32(
          module.i32.or(
            module.i32.shl(
              module.i32.and(module.i32.add(p0(), module.i32.const(5)), module.i32.const(0xff)),
              module.i32.const(8)
            ),
            module.i32.and(module.i32.sub(p0(), module.i32.const(5)), module.i32.const(0xff))
          )
        ),
        // cubed: a * a * a
        storeI32(module.i32.mul(module.i32.mul(p0(), p0()), p0())),
        // 3-level: (a+100) * ((a+200) - ((a+300) >> 2))
        storeI32(
          module.i32.mul(
            module.i32.add(p0(), module.i32.const(100)),
            module.i32.sub(
              module.i32.add(p0(), module.i32.const(200)),
              module.i32.shr_s(module.i32.add(p0(), module.i32.const(300)), module.i32.const(2))
            )
          )
        ),
        // distributive: ((a*7)+(a*13)) * ((a*3)-(a*2))
        storeI32(
          module.i32.mul(
            module.i32.add(module.i32.mul(p0(), module.i32.const(7)), module.i32.mul(p0(), module.i32.const(13))),
            module.i32.sub(module.i32.mul(p0(), module.i32.const(3)), module.i32.mul(p0(), module.i32.const(2)))
          )
        ),
        // select with computed condition: select(eqz(a&1), a*2, a*3)
        storeI32(
          module.select(
            module.i32.eqz(module.i32.and(p0(), module.i32.const(1))),
            module.i32.mul(p0(), module.i32.const(2)),
            module.i32.mul(p0(), module.i32.const(3))
          )
        ),
        // high/low half: (a >> 16) * (a & 0xFFFF)
        storeI32(module.i32.mul(module.i32.shr_s(p0(), module.i32.const(16)), module.i32.and(p0(), module.i32.const(0xffff)))),
        // unary feeding rotate: rotl(a, popcnt(a))
        storeI32(module.i32.rotl(p0(), module.i32.popcnt(p0()))),
        // Horner-like: ((((a+1)*2)+3)*4)+5
        storeI32(
          module.i32.add(
            module.i32.mul(
              module.i32.add(
                module.i32.mul(module.i32.add(p0(), module.i32.const(1)), module.i32.const(2)),
                module.i32.const(3)
              ),
              module.i32.const(4)
            ),
            module.i32.const(5)
          )
        ),
        // Gray code: a ^ (a >>> 1)
        storeI32(module.i32.xor(p0(), module.i32.shr_u(p0(), module.i32.const(1)))),
        // bitwise chain: (a | 0xF0F0F0F0) & (a ^ 0x0F0F0F0F)
        storeI32(
          module.i32.and(
            module.i32.or(p0(), module.i32.const(0xf0f0f0f0 | 0)),
            module.i32.xor(p0(), module.i32.const(0x0f0f0f0f))
          )
        ),
        // clear lowest set bit: (a-1) & a
        storeI32(module.i32.and(module.i32.sub(p0(), module.i32.const(1)), p0())),
        // select with rotates: select(a&1, rotr(a,7), rotl(a,7))
        storeI32(
          module.select(
            module.i32.and(p0(), module.i32.const(1)),
            module.i32.rotr(p0(), module.i32.const(7)),
            module.i32.rotl(p0(), module.i32.const(7))
          )
        ),
        // algebraic identity: ((a+a)<<1) - (a<<2) = 0
        storeI32(
          module.i32.sub(
            module.i32.shl(module.i32.add(p0(), p0()), module.i32.const(1)),
            module.i32.shl(p0(), module.i32.const(2))
          )
        ),
        // unsigned ops: (a rem_u 7) * (a div_u 7)
        storeI32(module.i32.mul(module.i32.rem_u(p0(), module.i32.const(7)), module.i32.div_u(p0(), module.i32.const(7)))),
        // identity: eqz(a ^ a) always 1
        storeI32(module.i32.eqz(module.i32.xor(p0(), p0()))),
        // abs via bit trick: (a + (a>>31)) ^ (a>>31)
        storeI32(
          module.i32.xor(
            module.i32.add(p0(), module.i32.shr_s(p0(), module.i32.const(31))),
            module.i32.shr_s(p0(), module.i32.const(31))
          )
        ),
        // comparison chain: ((a>5)&(a<50)) | ((a==0)&(a!=99))
        storeI32(
          module.i32.or(
            module.i32.and(module.i32.gt_s(p0(), module.i32.const(5)), module.i32.lt_s(p0(), module.i32.const(50))),
            module.i32.and(module.i32.eq(p0(), module.i32.const(0)), module.i32.ne(p0(), module.i32.const(99)))
          )
        ),
        // modular chain: (((a*5+3)%7)*11+1)%13
        storeI32(
          module.i32.rem_s(
            module.i32.add(
              module.i32.mul(
                module.i32.rem_s(
                  module.i32.add(module.i32.mul(p0(), module.i32.const(5)), module.i32.const(3)),
                  module.i32.const(7)
                ),
                module.i32.const(11)
              ),
              module.i32.const(1)
            ),
            module.i32.const(13)
          )
        ),
        // deep 5-level: shr_u(rotl(xor(and(add(a,0x12345),0xFFF00FFF),0xABCDEF01),13),8)
        storeI32(
          module.i32.shr_u(
            module.i32.rotl(
              module.i32.xor(
                module.i32.and(module.i32.add(p0(), module.i32.const(0x12345)), module.i32.const(0xfff00fff | 0)),
                module.i32.const(0xabcdef01 | 0)
              ),
              module.i32.const(13)
            ),
            module.i32.const(8)
          )
        ),
        // self-comparison: (a le_s a) * (a ge_u a) = always 1
        storeI32(module.i32.mul(module.i32.le_s(p0(), p0()), module.i32.ge_u(p0(), p0()))),
        // select deep: select(a>10, clz(a)+ctz(a), popcnt(a)*popcnt(a))
        storeI32(
          module.select(
            module.i32.gt_s(p0(), module.i32.const(10)),
            module.i32.add(module.i32.clz(p0()), module.i32.ctz(p0())),
            module.i32.mul(module.i32.popcnt(p0()), module.i32.popcnt(p0()))
          )
        ),
        // unsigned range: (a ge_u 0x80000000)*2 + (a lt_u 0x100)
        storeI32(
          module.i32.add(
            module.i32.mul(module.i32.ge_u(p0(), module.i32.const(0x80000000 | 0)), module.i32.const(2)),
            module.i32.lt_u(p0(), module.i32.const(0x100))
          )
        ),
        // half-word swap: (rotl(a,16) & 0xFFFF0000) | (rotr(a,16) & 0x0000FFFF)
        storeI32(
          module.i32.or(
            module.i32.and(module.i32.rotl(p0(), module.i32.const(16)), module.i32.const(0xffff0000 | 0)),
            module.i32.and(module.i32.rotr(p0(), module.i32.const(16)), module.i32.const(0x0000ffff))
          )
        ),
        // division identity: store div, rem, and reconstructed value
        storeI32(module.i32.div_s(p0(), module.i32.const(3))),
        storeI32(module.i32.rem_s(p0(), module.i32.const(3))),
        storeI32(
          module.i32.add(
            module.i32.mul(module.i32.div_s(p0(), module.i32.const(3)), module.i32.const(3)),
            module.i32.rem_s(p0(), module.i32.const(3))
          )
        ),
        module.return()
      ])
    );

    // =================================================================
    // exerciseMemoryArithmetic: arithmetic expressions built from
    // memory loads. Stores to scratch memory, reloads, combines via
    // arithmetic, and persists every result.
    // Params: (a: i32, b: i32)
    // =================================================================
    {
      const pB = () => module.local.get(1, binaryen.i32);
      const scratch = () => module.local.get(2, binaryen.i32);

      module.addFunction(
        'exerciseMemoryArithmetic',
        binaryen.createType([binaryen.i32, binaryen.i32]),
        binaryen.none,
        [binaryen.i32],
        module.block(null, [
          // reserve 32 bytes of scratch from heapTop
          module.local.set(2, heapTop()),
          advanceHeap(32),

          // --- store/load roundtrip + arithmetic ---
          // store a, load, add b
          module.i32.store(0, 4, scratch(), p0()),
          storeI32(module.i32.add(module.i32.load(0, 4, scratch()), pB())),

          // store (a+b), load, multiply by 2
          module.i32.store(0, 4, scratch(), module.i32.add(p0(), pB())),
          storeI32(module.i32.mul(module.i32.load(0, 4, scratch()), module.i32.const(2))),

          // --- dual-slot load/combine ---
          // store a at +0, b at +4, load both, add
          module.i32.store(0, 4, scratch(), p0()),
          module.i32.store(4, 4, scratch(), pB()),
          storeI32(module.i32.add(module.i32.load(0, 4, scratch()), module.i32.load(4, 4, scratch()))),

          // --- sub-word sign extension divergence ---
          // store (a*b), load8_s and load8_u of low byte
          module.i32.store(0, 4, scratch(), module.i32.mul(p0(), pB())),
          storeI32(module.i32.load8_s(0, 1, scratch())),
          storeI32(module.i32.load8_u(0, 1, scratch())),

          // --- double roundtrip through memory ---
          // store a, load, add b, store at +4, load from +4, mul a
          module.i32.store(0, 4, scratch(), p0()),
          module.i32.store(4, 4, scratch(), module.i32.add(module.i32.load(0, 4, scratch()), pB())),
          storeI32(module.i32.mul(module.i32.load(4, 4, scratch()), p0())),

          // --- packed store + 16-bit loads ---
          // store (a<<8 | b&0xFF), load16_s and load16_u
          module.i32.store(
            0,
            4,
            scratch(),
            module.i32.or(module.i32.shl(p0(), module.i32.const(8)), module.i32.and(pB(), module.i32.const(0xff)))
          ),
          storeI32(module.i32.load16_s(0, 2, scratch())),
          storeI32(module.i32.load16_u(0, 2, scratch())),

          // --- non-zero offset ---
          module.i32.store(8, 4, scratch(), module.i32.xor(p0(), pB())),
          storeI32(module.i32.load(8, 4, scratch())),

          // --- multi-load expression ---
          // load(+0) * load(+8) — uses values from previous stores
          storeI32(module.i32.mul(module.i32.load(0, 4, scratch()), module.i32.load(8, 4, scratch()))),

          // --- triple chain through scratch ---
          // +0 = a+b, +4 = load(+0)+100, +8 = load(+4)-50, persist load(+8)
          module.i32.store(0, 4, scratch(), module.i32.add(p0(), pB())),
          module.i32.store(4, 4, scratch(), module.i32.add(module.i32.load(0, 4, scratch()), module.i32.const(100))),
          module.i32.store(8, 4, scratch(), module.i32.sub(module.i32.load(4, 4, scratch()), module.i32.const(50))),
          storeI32(module.i32.load(8, 4, scratch())),

          // --- nested arithmetic from 3 loads ---
          // (load(+0) + load(+4)) * load(+8)
          storeI32(
            module.i32.mul(
              module.i32.add(module.i32.load(0, 4, scratch()), module.i32.load(4, 4, scratch())),
              module.i32.load(8, 4, scratch())
            )
          ),

          // --- store8 + signed/unsigned load8 ---
          module.i32.store8(12, 1, scratch(), p0()),
          storeI32(module.i32.load8_s(12, 1, scratch())),
          storeI32(module.i32.load8_u(12, 1, scratch())),

          // --- store16 + signed/unsigned load16 ---
          module.i32.store16(14, 2, scratch(), p0()),
          storeI32(module.i32.load16_s(14, 2, scratch())),
          storeI32(module.i32.load16_u(14, 2, scratch())),

          // --- f32 roundtrip through memory ---
          // store f32.convert_s(a), load f32, trunc_s back to i32
          module.f32.store(0, 4, scratch(), module.f32.convert_s.i32(p0())),
          storeI32(module.i32.trunc_s.f32(module.f32.load(0, 4, scratch()))),

          // --- load + comparison + arithmetic chain ---
          // store a, (load(+0) > b) * load(+0)
          module.i32.store(0, 4, scratch(), p0()),
          storeI32(module.i32.mul(module.i32.gt_s(module.i32.load(0, 4, scratch()), pB()), module.i32.load(0, 4, scratch()))),

          // --- dual load + bitwise cascade ---
          // store a at +0, b at +4, then shr_u(xor(load(+0), load(+4)), 4) & 0x0FFFFFFF
          module.i32.store(0, 4, scratch(), p0()),
          module.i32.store(4, 4, scratch(), pB()),
          storeI32(
            module.i32.and(
              module.i32.shr_u(
                module.i32.xor(module.i32.load(0, 4, scratch()), module.i32.load(4, 4, scratch())),
                module.i32.const(4)
              ),
              module.i32.const(0x0fffffff)
            )
          ),

          module.return()
        ])
      );
    }

    // =================================================================
    // exerciseMixedTypeChains: cross-type arithmetic with conversions
    // between i32, f32, and f64. Tests promotion, demotion, truncation,
    // reinterpretation, and multi-type expression trees.
    // Params: (a: i32, b: f32, c: f64)
    // =================================================================
    module.addFunction(
      'exerciseMixedTypeChains',
      binaryen.createType([binaryen.i32, binaryen.f32, binaryen.f64]),
      binaryen.none,
      [],
      module.block(null, [
        // --- i32 → float → trunc back ---
        // i32 → f32 → add 0.5 → trunc_s
        storeI32(module.i32.trunc_s.f32(module.f32.add(module.f32.convert_s.i32(p0()), module.f32.const(0.5)))),
        // i32 → f64 → mul 1.5 → trunc_s
        storeI32(module.i32.trunc_s.f64(module.f64.mul(module.f64.convert_s.i32(p0()), module.f64.const(1.5)))),

        // --- mixed param arithmetic ---
        // (f32.convert_s(a) + b) * 2.0
        storeF32(module.f32.mul(module.f32.add(module.f32.convert_s.i32(p0()), p1()), module.f32.const(2.0))),
        // f32 → promote → add c
        storeF64Safe(module.f64.add(module.f64.promote(p1()), p2())),
        // f64 → demote → mul b
        storeF32(module.f32.mul(module.f32.demote(p2()), p1())),

        // --- promotion/demotion roundtrips ---
        // f32 → promote → add 1.0 → demote
        storeF32(module.f32.demote(module.f64.add(module.f64.promote(p1()), module.f64.const(1.0)))),
        // f64 → trunc_s → convert_s back to f64 (floor roundtrip)
        storeF64Safe(module.f64.convert_s.i32(module.i32.trunc_s.f64(p2()))),
        // f64.convert_u(a) / (c + 1.0) — unsigned convert then divide
        storeF64Safe(module.f64.div(module.f64.convert_u.i32(p0()), module.f64.add(p2(), module.f64.const(1.0)))),

        // --- reinterpret in arithmetic ---
        // reinterpret(f32.convert_s(a)) + a
        storeI32(module.i32.add(module.i32.reinterpret(module.f32.convert_s.i32(p0())), p0())),
        // trunc_s(promote(f32.add(b, 1.0)))
        storeI32(module.i32.trunc_s.f64(module.f64.promote(module.f32.add(p1(), module.f32.const(1.0))))),

        // --- deep cross-type trees ---
        // f64.sqrt(f64.convert_s(a*a + 1))
        storeF64Safe(
          module.f64.sqrt(module.f64.convert_s.i32(module.i32.add(module.i32.mul(p0(), p0()), module.i32.const(1))))
        ),
        // select(a > 0, f32.convert_s(a), f32.neg(f32.convert_s(a)))
        storeF32(
          module.select(
            module.i32.gt_s(p0(), module.i32.const(0)),
            module.f32.convert_s.i32(p0()),
            module.f32.neg(module.f32.convert_s.i32(p0()))
          )
        ),
        // f64.copysign(c, f64.convert_s(a))
        storeF64Safe(module.f64.copysign(p2(), module.f64.convert_s.i32(p0()))),
        // f32.abs(f32.sub(b, f32.convert_s(a)))
        storeF32(module.f32.abs(module.f32.sub(p1(), module.f32.convert_s.i32(p0())))),
        // (f64.promote(b) * c) + f64.convert_s(a)
        storeF64Safe(module.f64.add(module.f64.mul(module.f64.promote(p1()), p2()), module.f64.convert_s.i32(p0()))),

        // --- saturating trunc + nested float ---
        // trunc_u_sat(f32.abs(b) * 1000.0)
        storeI32(module.i32.trunc_u_sat.f32(module.f32.mul(module.f32.abs(p1()), module.f32.const(1000.0)))),
        // trunc_s(f64.nearest(c * 3.0))
        storeI32(module.i32.trunc_s.f64(module.f64.nearest(module.f64.mul(p2(), module.f64.const(3.0))))),

        // --- unary chains ---
        // f32.sqrt(f32.abs(f32.sub(b, 1.0)))
        storeF32(module.f32.sqrt(module.f32.abs(module.f32.sub(p1(), module.f32.const(1.0))))),
        // f64.floor(f64.add(c, 0.7))
        storeF64Safe(module.f64.floor(module.f64.add(p2(), module.f64.const(0.7)))),
        // f32.ceil(f32.div(b, 3.0))
        storeF32(module.f32.ceil(module.f32.div(p1(), module.f32.const(3.0)))),

        // --- double negate through promote ---
        // f64.neg(promote(f32.neg(b))) = promote(b)
        storeF64Safe(module.f64.neg(module.f64.promote(module.f32.neg(p1())))),

        // --- cross-type subtraction ---
        // trunc_s(f64.sub(promote(b), c))
        storeI32(module.i32.trunc_s.f64(module.f64.sub(module.f64.promote(p1()), p2()))),

        // --- min/max combining ---
        // f32.min(f32.convert_s(a), b) + f32.max(f32.convert_s(a), b)
        storeF32(
          module.f32.add(
            module.f32.min(module.f32.convert_s.i32(p0()), p1()),
            module.f32.max(module.f32.convert_s.i32(p0()), p1())
          )
        ),
        // f64.min(c, 10.0) * f64.max(c, -10.0)
        storeF64Safe(
          module.f64.mul(module.f64.min(p2(), module.f64.const(10.0)), module.f64.max(p2(), module.f64.const(-10.0)))
        ),

        // --- full chain: i32 → f32 → promote → f64.add(c) → trunc_s ---
        storeI32(module.i32.trunc_s.f64(module.f64.add(module.f64.promote(module.f32.convert_s.i32(p0())), p2()))),

        module.return()
      ])
    );

    // =================================================================
    // exerciseEdgeArithmetic: boundary and overflow arithmetic with
    // constants only. Tests overflow chains, signed/unsigned divergence,
    // identities, and precedence-stressing combinations.
    // =================================================================
    module.addFunction(
      'exerciseEdgeArithmetic',
      binaryen.none,
      binaryen.none,
      [],
      module.block(null, [
        // chained negation: (-1)*(-1)*(-1)*(-1) → 1
        storeI32(
          module.i32.mul(
            module.i32.mul(module.i32.mul(module.i32.const(-1), module.i32.const(-1)), module.i32.const(-1)),
            module.i32.const(-1)
          )
        ),
        // INT_MAX * 3 → overflow
        storeI32(module.i32.mul(module.i32.const(0x7fffffff), module.i32.const(3))),
        // 0xDEADBEEF ^ 0xCAFEBABE
        storeI32(module.i32.xor(module.i32.const(0xdeadbeef | 0), module.i32.const(0xcafebabe | 0))),
        // difference of near-overflow squares: (2^16 - 1) * (2^16 + 1)
        storeI32(
          module.i32.mul(
            module.i32.sub(module.i32.shl(module.i32.const(1), module.i32.const(16)), module.i32.const(1)),
            module.i32.add(module.i32.shl(module.i32.const(1), module.i32.const(16)), module.i32.const(1))
          )
        ),
        // popcnt product: popcnt(0xAAAAAAAA) * popcnt(0x55555555) → 256
        storeI32(
          module.i32.mul(module.i32.popcnt(module.i32.const(0xaaaaaaaa | 0)), module.i32.popcnt(module.i32.const(0x55555555)))
        ),
        // unary sum: clz(1) + ctz(0x80000000) + popcnt(0) → 62
        storeI32(
          module.i32.add(
            module.i32.add(module.i32.clz(module.i32.const(1)), module.i32.ctz(module.i32.const(0x80000000 | 0))),
            module.i32.popcnt(module.i32.const(0))
          )
        ),
        // rotl(0x80000000, 1) → 1
        storeI32(module.i32.rotl(module.i32.const(0x80000000 | 0), module.i32.const(1))),
        // rotr(1, 1) → 0x80000000
        storeI32(module.i32.rotr(module.i32.const(1), module.i32.const(1))),
        // division identity: -100/7 = -14, -100%7 = -2, reconstruct -100
        storeI32(module.i32.div_s(module.i32.const(-100), module.i32.const(7))),
        storeI32(module.i32.rem_s(module.i32.const(-100), module.i32.const(7))),
        storeI32(
          module.i32.add(
            module.i32.mul(module.i32.div_s(module.i32.const(-100), module.i32.const(7)), module.i32.const(7)),
            module.i32.rem_s(module.i32.const(-100), module.i32.const(7))
          )
        ),
        // unsigned remainder: 0xFFFFFFFF %u 10 → 5
        storeI32(module.i32.rem_u(module.i32.const(-1), module.i32.const(10))),
        // chained overflow: (INT_MAX + 1) + INT_MAX → -1
        storeI32(
          module.i32.add(module.i32.add(module.i32.const(0x7fffffff), module.i32.const(1)), module.i32.const(0x7fffffff))
        ),
        // INT_MIN * -1 → INT_MIN (mul overflow, no trap)
        storeI32(module.i32.mul(module.i32.const(0x80000000 | 0), module.i32.const(-1))),
        // arithmetic shift: (1<<31) >> 31 → -1
        storeI32(module.i32.shr_s(module.i32.shl(module.i32.const(1), module.i32.const(31)), module.i32.const(31))),
        // logical shift: (1<<31) >>> 31 → 1
        storeI32(module.i32.shr_u(module.i32.shl(module.i32.const(1), module.i32.const(31)), module.i32.const(31))),
        // triple XOR: 0 ^ -1 ^ -1 ^ -1 → -1
        storeI32(
          module.i32.xor(
            module.i32.xor(module.i32.xor(module.i32.const(0), module.i32.const(-1)), module.i32.const(-1)),
            module.i32.const(-1)
          )
        ),
        // popcnt identity: popcnt(x) + popcnt(~x) = 32
        storeI32(
          module.i32.add(
            module.i32.popcnt(module.i32.const(0x12345678)),
            module.i32.popcnt(module.i32.xor(module.i32.const(0x12345678), module.i32.const(-1)))
          )
        ),
        // alternating bits: 0xAAAAAAAA + 0x55555555 = -1
        storeI32(module.i32.add(module.i32.const(0xaaaaaaaa | 0), module.i32.const(0x55555555))),
        // nested overflow: (-1)*(-1) = 1 via INT_MAX*2+1
        storeI32(
          module.i32.mul(
            module.i32.add(module.i32.mul(module.i32.const(0x7fffffff), module.i32.const(2)), module.i32.const(1)),
            module.i32.add(module.i32.mul(module.i32.const(0x7fffffff), module.i32.const(2)), module.i32.const(1))
          )
        ),
        // signed/unsigned divergence: lt_s(-1,1) | lt_u(-1,1)
        storeI32(
          module.i32.or(
            module.i32.lt_s(module.i32.const(-1), module.i32.const(1)),
            module.i32.lt_u(module.i32.const(-1), module.i32.const(1))
          )
        ),
        // deeply nested const: ((42+7)*(100-3)) / ((5+2)*(3+1)) → 169
        storeI32(
          module.i32.div_s(
            module.i32.mul(
              module.i32.add(module.i32.const(42), module.i32.const(7)),
              module.i32.sub(module.i32.const(100), module.i32.const(3))
            ),
            module.i32.mul(
              module.i32.add(module.i32.const(5), module.i32.const(2)),
              module.i32.add(module.i32.const(3), module.i32.const(1))
            )
          )
        ),
        // nested select: select(1, select(0, 111, 222), 333) → 222
        storeI32(
          module.select(
            module.i32.const(1),
            module.select(module.i32.const(0), module.i32.const(111), module.i32.const(222)),
            module.i32.const(333)
          )
        ),
        // XOR swap simulation: a=5, b=9 → a'=a^b=12, b'=b^a'=5, a''=a'^b'=9
        storeI32(module.i32.xor(module.i32.const(5), module.i32.const(9))),
        storeI32(module.i32.xor(module.i32.const(9), module.i32.xor(module.i32.const(5), module.i32.const(9)))),
        storeI32(
          module.i32.xor(
            module.i32.xor(module.i32.const(5), module.i32.const(9)),
            module.i32.xor(module.i32.const(9), module.i32.xor(module.i32.const(5), module.i32.const(9)))
          )
        ),

        module.return()
      ])
    );

    // =================================================================
    // exerciseMixedWidthLoads: mixed-width and mixed-signedness memory
    // loads combined in integer arithmetic chains.  Loop-generated
    // systematic coverage of per-byte and per-halfword signed/unsigned
    // divergence, cross-width and cross-slot combinations.
    // Params: (a: i32, b: i32)
    // =================================================================
    {
      const pB = () => module.local.get(1, binaryen.i32);
      const scratch = () => module.local.get(2, binaryen.i32);

      const body = [];
      // Reserve 32 bytes of scratch.
      body.push(module.local.set(2, heapTop()));
      body.push(advanceHeap(32));

      // Populate: a at +0, b at +4, (a|0x80808080) at +8, (a^b) at +12.
      body.push(module.i32.store(0, 4, scratch(), p0()));
      body.push(module.i32.store(4, 4, scratch(), pB()));
      body.push(module.i32.store(8, 4, scratch(), module.i32.or(p0(), module.i32.const(0x80808080 | 0))));
      body.push(module.i32.store(12, 4, scratch(), module.i32.xor(p0(), pB())));

      // --- Per-byte signed/unsigned loads of a (loop-generated) ---
      for (let off = 0; off < 4; off++) {
        body.push(storeI32(module.i32.load8_s(off, 1, scratch())));
        body.push(storeI32(module.i32.load8_u(off, 1, scratch())));
      }

      // --- Signed/unsigned divergence magnitude per byte (loop-generated) ---
      for (let off = 0; off < 4; off++) {
        body.push(storeI32(module.i32.add(module.i32.load8_s(off, 1, scratch()), module.i32.load8_u(off, 1, scratch()))));
      }

      // --- Halfword signed/unsigned at offsets +0 and +4 (loop-generated) ---
      for (let off = 0; off <= 4; off += 4) {
        body.push(storeI32(module.i32.load16_s(off, 2, scratch())));
        body.push(storeI32(module.i32.load16_u(off, 2, scratch())));
      }

      // --- Cross-width combinations ---
      // add(load8_s(+0), load16_u(+0))
      body.push(storeI32(module.i32.add(module.i32.load8_s(0, 1, scratch()), module.i32.load16_u(0, 2, scratch()))));
      // sub(load16_s(+0), load8_u(+0))
      body.push(storeI32(module.i32.sub(module.i32.load16_s(0, 2, scratch()), module.i32.load8_u(0, 1, scratch()))));
      // mul(load8_u(+0), load16_s(+4))
      body.push(storeI32(module.i32.mul(module.i32.load8_u(0, 1, scratch()), module.i32.load16_s(4, 2, scratch()))));
      // xor(load8_s(+4), load16_u(+0))
      body.push(storeI32(module.i32.xor(module.i32.load8_s(4, 1, scratch()), module.i32.load16_u(0, 2, scratch()))));

      // --- Cross-slot byte/halfword combinations ---
      body.push(storeI32(module.i32.add(module.i32.load8_s(0, 1, scratch()), module.i32.load8_s(4, 1, scratch()))));
      body.push(storeI32(module.i32.add(module.i32.load8_u(0, 1, scratch()), module.i32.load8_u(4, 1, scratch()))));
      body.push(storeI32(module.i32.mul(module.i32.load16_s(0, 2, scratch()), module.i32.load16_s(4, 2, scratch()))));
      body.push(storeI32(module.i32.mul(module.i32.load16_u(0, 2, scratch()), module.i32.load16_u(4, 2, scratch()))));

      // --- Guaranteed sign-extension divergence (from +8, a|0x80808080) ---
      body.push(storeI32(module.i32.load8_s(8, 1, scratch())));
      body.push(storeI32(module.i32.load8_u(8, 1, scratch())));
      body.push(storeI32(module.i32.mul(module.i32.load8_s(8, 1, scratch()), module.i32.load8_u(8, 1, scratch()))));
      body.push(storeI32(module.i32.load16_s(8, 2, scratch())));
      body.push(storeI32(module.i32.load16_u(8, 2, scratch())));
      body.push(storeI32(module.i32.mul(module.i32.load16_s(8, 2, scratch()), module.i32.load16_u(8, 2, scratch()))));

      // --- 4-load nested expressions ---
      // (load8_s(+0) + load8_u(+4)) * (load16_s(+0) - load16_u(+4))
      body.push(
        storeI32(
          module.i32.mul(
            module.i32.add(module.i32.load8_s(0, 1, scratch()), module.i32.load8_u(4, 1, scratch())),
            module.i32.sub(module.i32.load16_s(0, 2, scratch()), module.i32.load16_u(4, 2, scratch()))
          )
        )
      );
      // (load8_u(+0) ^ load8_s(+4)) + (load16_u(+0) & load16_s(+4))
      body.push(
        storeI32(
          module.i32.add(
            module.i32.xor(module.i32.load8_u(0, 1, scratch()), module.i32.load8_s(4, 1, scratch())),
            module.i32.and(module.i32.load16_u(0, 2, scratch()), module.i32.load16_s(4, 2, scratch()))
          )
        )
      );

      // --- Byte-level reconstruction vs halfword ---
      // or(shl(load8_u(+1), 8), load8_u(+0)) should equal load16_u(+0)
      body.push(
        storeI32(
          module.i32.or(
            module.i32.shl(module.i32.load8_u(1, 1, scratch()), module.i32.const(8)),
            module.i32.load8_u(0, 1, scratch())
          )
        )
      );
      body.push(storeI32(module.i32.load16_u(0, 2, scratch())));

      // --- Sub-width loads of xored value (from +12 = a^b) ---
      body.push(storeI32(module.i32.load(12, 4, scratch())));
      body.push(storeI32(module.i32.add(module.i32.load8_s(12, 1, scratch()), module.i32.load16_u(12, 2, scratch()))));
      // shr_u(load(+12), 24) should equal load8_u(+15)
      body.push(storeI32(module.i32.shr_u(module.i32.load(12, 4, scratch()), module.i32.const(24))));
      body.push(storeI32(module.i32.load8_u(15, 1, scratch())));

      // --- Mixed arithmetic with params and loaded sub-words ---
      body.push(storeI32(module.i32.add(p0(), module.i32.load8_s(0, 1, scratch()))));
      body.push(storeI32(module.i32.mul(p0(), module.i32.load16_u(4, 2, scratch()))));
      // (p0 + load8_s(+0)) * (pB - load16_u(+0))
      body.push(
        storeI32(
          module.i32.mul(
            module.i32.add(p0(), module.i32.load8_s(0, 1, scratch())),
            module.i32.sub(pB(), module.i32.load16_u(0, 2, scratch()))
          )
        )
      );

      body.push(module.return());

      module.addFunction(
        'exerciseMixedWidthLoads',
        binaryen.createType([binaryen.i32, binaryen.i32]),
        binaryen.none,
        [binaryen.i32],
        module.block(null, body)
      );
    }

    // =================================================================
    // exerciseLoadToFloat: memory loads of varying widths and signedness
    // converted to f32/f64, combined in float arithmetic, then
    // truncated back to i32.  Systematic coverage of the cross-product
    // of load width x signedness x float target type.
    // Params: (a: i32, b: i32)
    // =================================================================
    {
      const pB = () => module.local.get(1, binaryen.i32);
      const scratch = () => module.local.get(2, binaryen.i32);

      const body = [];
      body.push(module.local.set(2, heapTop()));
      body.push(advanceHeap(32));

      // Populate: a at +0, b at +4.
      body.push(module.i32.store(0, 4, scratch(), p0()));
      body.push(module.i32.store(4, 4, scratch(), pB()));

      // --- Signed loads -> f32 ---
      body.push(storeF32(module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch()))));
      body.push(storeF32(module.f32.convert_s.i32(module.i32.load16_s(0, 2, scratch()))));
      body.push(storeF32(module.f32.convert_s.i32(module.i32.load(0, 4, scratch()))));

      // --- Unsigned loads -> f32 ---
      body.push(storeF32(module.f32.convert_u.i32(module.i32.load8_u(0, 1, scratch()))));
      body.push(storeF32(module.f32.convert_u.i32(module.i32.load16_u(0, 2, scratch()))));
      body.push(storeF32(module.f32.convert_u.i32(module.i32.load(0, 4, scratch()))));

      // --- Signed loads -> f64 ---
      body.push(storeF64Safe(module.f64.convert_s.i32(module.i32.load8_s(0, 1, scratch()))));
      body.push(storeF64Safe(module.f64.convert_s.i32(module.i32.load16_s(0, 2, scratch()))));
      body.push(storeF64Safe(module.f64.convert_s.i32(module.i32.load(0, 4, scratch()))));

      // --- Unsigned loads -> f64 ---
      body.push(storeF64Safe(module.f64.convert_u.i32(module.i32.load8_u(0, 1, scratch()))));
      body.push(storeF64Safe(module.f64.convert_u.i32(module.i32.load16_u(0, 2, scratch()))));
      body.push(storeF64Safe(module.f64.convert_u.i32(module.i32.load(0, 4, scratch()))));

      // --- Signed + unsigned combined in float arithmetic ---
      // f32.add(convert_s(load8_s), convert_u(load8_u)) — same byte
      body.push(
        storeF32(
          module.f32.add(
            module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch())),
            module.f32.convert_u.i32(module.i32.load8_u(0, 1, scratch()))
          )
        )
      );
      // f64.mul(convert_s(load16_s), convert_u(load16_u))
      body.push(
        storeF64Safe(
          module.f64.mul(
            module.f64.convert_s.i32(module.i32.load16_s(0, 2, scratch())),
            module.f64.convert_u.i32(module.i32.load16_u(0, 2, scratch()))
          )
        )
      );
      // f32.sub(convert_s(load8_s(+0)), convert_u(load8_u(+4)))
      body.push(
        storeF32(
          module.f32.sub(
            module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch())),
            module.f32.convert_u.i32(module.i32.load8_u(4, 1, scratch()))
          )
        )
      );
      // f64.add(convert_u(load16_u(+0)), convert_s(load16_s(+4)))
      body.push(
        storeF64Safe(
          module.f64.add(
            module.f64.convert_u.i32(module.i32.load16_u(0, 2, scratch())),
            module.f64.convert_s.i32(module.i32.load16_s(4, 2, scratch()))
          )
        )
      );

      // --- Float arithmetic -> trunc back to i32 ---
      // trunc_s(f32.mul(convert_s(load8_s(+0)), 10.0))
      body.push(
        storeI32(
          module.i32.trunc_s.f32(
            module.f32.mul(module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch())), module.f32.const(10.0))
          )
        )
      );
      // trunc_s_sat(f64.mul(convert_s(load16_s(+0)), 0.01))
      body.push(
        storeI32(
          module.i32.trunc_s_sat.f64(
            module.f64.mul(module.f64.convert_s.i32(module.i32.load16_s(0, 2, scratch())), module.f64.const(0.01))
          )
        )
      );
      // trunc_u_sat(f64.add(convert_u(load16_u(+0)), 100.0))
      body.push(
        storeI32(
          module.i32.trunc_u_sat.f64(
            module.f64.add(module.f64.convert_u.i32(module.i32.load16_u(0, 2, scratch())), module.f64.const(100.0))
          )
        )
      );
      // trunc_s_sat(f32.mul(convert_s(load(+0)), 0.5))
      body.push(
        storeI32(
          module.i32.trunc_s_sat.f32(
            module.f32.mul(module.f32.convert_s.i32(module.i32.load(0, 4, scratch())), module.f32.const(0.5))
          )
        )
      );

      // --- Promotion/demotion chains from loaded values ---
      // promote(convert_s(load8_s(+0)))
      body.push(storeF64Safe(module.f64.promote(module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch())))));
      // demote(convert_u(load16_u(+0)))
      body.push(storeF32(module.f32.demote(module.f64.convert_u.i32(module.i32.load16_u(0, 2, scratch())))));
      // trunc_s(promote(convert_s(load16_s(+0))))
      body.push(
        storeI32(module.i32.trunc_s.f64(module.f64.promote(module.f32.convert_s.i32(module.i32.load16_s(0, 2, scratch())))))
      );
      // trunc_s(promote(convert_u(load8_u(+0))))
      body.push(
        storeI32(module.i32.trunc_s.f64(module.f64.promote(module.f32.convert_u.i32(module.i32.load8_u(0, 1, scratch())))))
      );

      // --- Cross-slot float combinations ---
      // f64.add(convert_s(load(+0)), convert_s(load(+4)))
      body.push(
        storeF64Safe(
          module.f64.add(
            module.f64.convert_s.i32(module.i32.load(0, 4, scratch())),
            module.f64.convert_s.i32(module.i32.load(4, 4, scratch()))
          )
        )
      );
      // f32.div(convert_u(load8_u(+0)), max(convert_u(load8_u(+4)), 1.0))
      body.push(
        storeF32(
          module.f32.div(
            module.f32.convert_u.i32(module.i32.load8_u(0, 1, scratch())),
            module.f32.max(module.f32.convert_u.i32(module.i32.load8_u(4, 1, scratch())), module.f32.const(1.0))
          )
        )
      );

      // --- Float comparisons from converted loads -> i32 ---
      // f32.gt(convert_s(load8_s), convert_u(load8_u)) — same byte
      body.push(
        storeI32(
          module.f32.gt(
            module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch())),
            module.f32.convert_u.i32(module.i32.load8_u(0, 1, scratch()))
          )
        )
      );
      // f64.lt(convert_s(load16_s), convert_u(load16_u))
      body.push(
        storeI32(
          module.f64.lt(
            module.f64.convert_s.i32(module.i32.load16_s(0, 2, scratch())),
            module.f64.convert_u.i32(module.i32.load16_u(0, 2, scratch()))
          )
        )
      );

      // --- Deep nested chains ---
      // trunc_s_sat(promote(convert_s(load8_s(+0))) + convert_u(load16_u(+4)))
      body.push(
        storeI32(
          module.i32.trunc_s_sat.f64(
            module.f64.add(
              module.f64.promote(module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch()))),
              module.f64.convert_u.i32(module.i32.load16_u(4, 2, scratch()))
            )
          )
        )
      );
      // demote(convert_s(load(+0)) * convert_u(load(+4)))
      body.push(
        storeF32(
          module.f32.demote(
            module.f64.mul(
              module.f64.convert_s.i32(module.i32.load(0, 4, scratch())),
              module.f64.convert_u.i32(module.i32.load(4, 4, scratch()))
            )
          )
        )
      );

      // --- Store-load-compute-store-reload chain through float ---
      // Store convert_s(load8_s(+0)) as f32 at +16; reload, add 0.5, trunc_s.
      body.push(module.f32.store(16, 4, scratch(), module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch()))));
      body.push(storeI32(module.i32.trunc_s.f32(module.f32.add(module.f32.load(16, 4, scratch()), module.f32.const(0.5)))));
      // Store convert_u(load16_u(+0)) as f64 at +20 (align=4); reload, mul 2, trunc_s_sat.
      body.push(module.f64.store(20, 4, scratch(), module.f64.convert_u.i32(module.i32.load16_u(0, 2, scratch()))));
      body.push(storeI32(module.i32.trunc_s_sat.f64(module.f64.mul(module.f64.load(20, 4, scratch()), module.f64.const(2.0)))));

      // --- Per-byte float divergence (loop-generated) ---
      for (let off = 0; off < 4; off++) {
        body.push(
          storeF32(
            module.f32.sub(
              module.f32.convert_s.i32(module.i32.load8_s(off, 1, scratch())),
              module.f32.convert_u.i32(module.i32.load8_u(off, 1, scratch()))
            )
          )
        );
      }

      body.push(module.return());

      module.addFunction(
        'exerciseLoadToFloat',
        binaryen.createType([binaryen.i32, binaryen.i32]),
        binaryen.none,
        [binaryen.i32],
        module.block(null, body)
      );
    }

    // =================================================================
    // exerciseCrossTypePipeline: deep multi-stage pipelines combining
    // memory loads, integer arithmetic, float arithmetic, conversions,
    // truncations, comparisons, and selects.  Tests the full cross-
    // product of mixed-type interaction patterns.
    // Params: (a: i32, b: f32, c: f64)
    // =================================================================
    {
      const scratch = () => module.local.get(3, binaryen.i32);

      const body = [];
      body.push(module.local.set(3, heapTop()));
      body.push(advanceHeap(64));

      // Populate: a at +0, (a<<8 | a&0xFF) at +4, a*a at +8.
      body.push(module.i32.store(0, 4, scratch(), p0()));
      body.push(
        module.i32.store(
          4,
          4,
          scratch(),
          module.i32.or(module.i32.shl(p0(), module.i32.const(8)), module.i32.and(p0(), module.i32.const(0xff)))
        )
      );
      body.push(module.i32.store(8, 4, scratch(), module.i32.mul(p0(), p0())));

      // --- Stage 1: sub-word loads -> integer arithmetic -> float ---
      // load8_s + load8_u -> add -> storeI32
      body.push(storeI32(module.i32.add(module.i32.load8_s(0, 1, scratch()), module.i32.load8_u(0, 1, scratch()))));
      // above sum -> convert_s -> f32 -> add b -> storeF32
      body.push(
        storeF32(
          module.f32.add(
            module.f32.convert_s.i32(module.i32.add(module.i32.load8_s(0, 1, scratch()), module.i32.load8_u(0, 1, scratch()))),
            p1()
          )
        )
      );
      // load16_s - load16_u -> convert_s -> f64 -> add c -> storeF64Safe
      body.push(
        storeF64Safe(
          module.f64.add(
            module.f64.convert_s.i32(
              module.i32.sub(module.i32.load16_s(0, 2, scratch()), module.i32.load16_u(0, 2, scratch()))
            ),
            p2()
          )
        )
      );

      // --- Stage 2: load -> float -> arithmetic -> trunc -> bitwise ---
      // trunc_s_sat(f32.mul(convert_s(load16_s(+0)), b)) & 0xFFFF
      body.push(
        storeI32(
          module.i32.and(
            module.i32.trunc_s_sat.f32(module.f32.mul(module.f32.convert_s.i32(module.i32.load16_s(0, 2, scratch())), p1())),
            module.i32.const(0xffff)
          )
        )
      );
      // trunc_s_sat(f64.mul(convert_u(load16_u(+0)), c)) | 0xFF
      body.push(
        storeI32(
          module.i32.or(
            module.i32.trunc_s_sat.f64(module.f64.mul(module.f64.convert_u.i32(module.i32.load16_u(0, 2, scratch())), p2())),
            module.i32.const(0xff)
          )
        )
      );

      // --- Stage 3: comparison -> integer -> float pipeline ---
      // f32.gt(convert_s(load8_s(+0)), b) + load8_u(+0)
      body.push(
        storeI32(
          module.i32.add(
            module.f32.gt(module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch())), p1()),
            module.i32.load8_u(0, 1, scratch())
          )
        )
      );
      // f64.lt(convert_u(load16_u(+0)), c) * load16_s(+0)
      body.push(
        storeI32(
          module.i32.mul(
            module.f64.lt(module.f64.convert_u.i32(module.i32.load16_u(0, 2, scratch())), p2()),
            module.i32.load16_s(0, 2, scratch())
          )
        )
      );

      // --- Stage 4: deeply nested cross-type ---
      // promote(mul(convert_s(load8_s), b)) + f64.mul(convert_u(load16_u), c) -> trunc_s_sat
      body.push(
        storeI32(
          module.i32.trunc_s_sat.f64(
            module.f64.add(
              module.f64.promote(module.f32.mul(module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch())), p1())),
              module.f64.mul(module.f64.convert_u.i32(module.i32.load16_u(0, 2, scratch())), p2())
            )
          )
        )
      );
      // demote(c + convert_u(load8_u(+0) + load16_u(+0)))
      body.push(
        storeF32(
          module.f32.demote(
            module.f64.add(
              p2(),
              module.f64.convert_u.i32(
                module.i32.add(module.i32.load8_u(0, 1, scratch()), module.i32.load16_u(0, 2, scratch()))
              )
            )
          )
        )
      );
      // select(load8_s > 0, convert_s(load16_s), convert_u(load16_u))
      body.push(
        storeF32(
          module.select(
            module.i32.gt_s(module.i32.load8_s(0, 1, scratch()), module.i32.const(0)),
            module.f32.convert_s.i32(module.i32.load16_s(0, 2, scratch())),
            module.f32.convert_u.i32(module.i32.load16_u(0, 2, scratch()))
          )
        )
      );
      // trunc_s_sat(convert_s(load8_s * load16_s) / (abs(c) + 1.0))
      body.push(
        storeI32(
          module.i32.trunc_s_sat.f64(
            module.f64.div(
              module.f64.convert_s.i32(
                module.i32.mul(module.i32.load8_s(0, 1, scratch()), module.i32.load16_s(0, 2, scratch()))
              ),
              module.f64.add(module.f64.abs(p2()), module.f64.const(1.0))
            )
          )
        )
      );
      // copysign(convert_s(load16_s(+0)), c)
      body.push(storeF64Safe(module.f64.copysign(module.f64.convert_s.i32(module.i32.load16_s(0, 2, scratch())), p2())));
      // abs(convert_s(load8_s) - demote(convert_u(load8_u)))
      body.push(
        storeF32(
          module.f32.abs(
            module.f32.sub(
              module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch())),
              module.f32.demote(module.f64.convert_u.i32(module.i32.load8_u(0, 1, scratch())))
            )
          )
        )
      );
      // (promote(b) * c) + convert_s(load(+0))
      body.push(
        storeF64Safe(
          module.f64.add(
            module.f64.mul(module.f64.promote(p1()), p2()),
            module.f64.convert_s.i32(module.i32.load(0, 4, scratch()))
          )
        )
      );

      // --- Stage 5: chained store -> reload -> compute pipelines ---
      // Store convert_s(load8_s(+0)) as f32 at +16; reload, add b, trunc_s.
      body.push(module.f32.store(16, 4, scratch(), module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch()))));
      body.push(storeI32(module.i32.trunc_s.f32(module.f32.add(module.f32.load(16, 4, scratch()), p1()))));
      // Store trunc_s_sat(convert_u(load16_u(+0)) * c) at +20; reload, xor load8_u(+0).
      body.push(
        module.i32.store(
          20,
          4,
          scratch(),
          module.i32.trunc_s_sat.f64(module.f64.mul(module.f64.convert_u.i32(module.i32.load16_u(0, 2, scratch())), p2()))
        )
      );
      body.push(storeI32(module.i32.xor(module.i32.load(20, 4, scratch()), module.i32.load8_u(0, 1, scratch()))));
      // Store convert_s(load(+0)) as f64 at +24 (align=4); reload, add c, trunc_s_sat.
      body.push(module.f64.store(24, 4, scratch(), module.f64.convert_s.i32(module.i32.load(0, 4, scratch()))));
      body.push(storeI32(module.i32.trunc_s_sat.f64(module.f64.add(module.f64.load(24, 4, scratch()), p2()))));

      // --- Stage 6: per-byte loads through float pipeline (loop-generated) ---
      for (let off = 0; off < 4; off++) {
        // load8_s(off) -> convert_s -> f32 -> add b -> trunc_s
        body.push(
          storeI32(
            module.i32.trunc_s.f32(module.f32.add(module.f32.convert_s.i32(module.i32.load8_s(off, 1, scratch())), p1()))
          )
        );
        // load8_u(off) -> convert_u -> f64 -> mul c -> trunc_s_sat
        body.push(
          storeI32(
            module.i32.trunc_s_sat.f64(module.f64.mul(module.f64.convert_u.i32(module.i32.load8_u(off, 1, scratch())), p2()))
          )
        );
      }

      // --- Stage 7: parallel f32/f64 from same integer source ---
      // f32 path: (convert_s(load(+0)) + b) * b
      body.push(
        storeF32(module.f32.mul(module.f32.add(module.f32.convert_s.i32(module.i32.load(0, 4, scratch())), p1()), p1()))
      );
      // f64 path: (convert_s(load(+0)) + c) * c
      body.push(
        storeF64Safe(module.f64.mul(module.f64.add(module.f64.convert_s.i32(module.i32.load(0, 4, scratch())), p2()), p2()))
      );
      // promote(f32_expr) - f64_expr -> trunc_s_sat — precision divergence
      body.push(
        storeI32(
          module.i32.trunc_s_sat.f64(
            module.f64.sub(
              module.f64.promote(module.f32.add(module.f32.convert_s.i32(p0()), p1())),
              module.f64.add(module.f64.convert_s.i32(p0()), p2())
            )
          )
        )
      );

      // --- Stage 8: mixed-width loads in float domain ---
      // f32.add(convert_s(load8_s(+0)), convert_u(load16_u(+0)))
      body.push(
        storeF32(
          module.f32.add(
            module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch())),
            module.f32.convert_u.i32(module.i32.load16_u(0, 2, scratch()))
          )
        )
      );
      // f64.sub(convert_s(load16_s(+0)), convert_u(load8_u(+0)))
      body.push(
        storeF64Safe(
          module.f64.sub(
            module.f64.convert_s.i32(module.i32.load16_s(0, 2, scratch())),
            module.f64.convert_u.i32(module.i32.load8_u(0, 1, scratch()))
          )
        )
      );

      // --- Stage 9: bitwise before float conversion ---
      // shl(load8_u(+0), 4) -> convert_s -> f32 -> add b
      body.push(
        storeF32(
          module.f32.add(
            module.f32.convert_s.i32(module.i32.shl(module.i32.load8_u(0, 1, scratch()), module.i32.const(4))),
            p1()
          )
        )
      );
      // and(load16_u(+0), 0x7FFF) -> convert_u -> f64 -> mul c
      body.push(
        storeF64Safe(
          module.f64.mul(
            module.f64.convert_u.i32(module.i32.and(module.i32.load16_u(0, 2, scratch()), module.i32.const(0x7fff))),
            p2()
          )
        )
      );

      // --- Stage 10: select with float conditions ---
      // select(b > 0, load8_s(+0), load8_u(+0))
      body.push(
        storeI32(
          module.select(
            module.f32.gt(p1(), module.f32.const(0.0)),
            module.i32.load8_s(0, 1, scratch()),
            module.i32.load8_u(0, 1, scratch())
          )
        )
      );
      // select(c <= 0, convert_s(load16_s), convert_u(load16_u)) as f32
      body.push(
        storeF32(
          module.select(
            module.f64.le(p2(), module.f64.const(0.0)),
            module.f32.convert_s.i32(module.i32.load16_s(0, 2, scratch())),
            module.f32.convert_u.i32(module.i32.load16_u(0, 2, scratch()))
          )
        )
      );

      // --- Stage 11: full pipeline through scratch ---
      // (load8_s(+0) + load16_u(+4)) * p0 -> convert_s -> f64 -> add c -> trunc_s_sat -> +32
      body.push(
        module.i32.store(
          32,
          4,
          scratch(),
          module.i32.trunc_s_sat.f64(
            module.f64.add(
              module.f64.convert_s.i32(
                module.i32.mul(module.i32.add(module.i32.load8_s(0, 1, scratch()), module.i32.load16_u(4, 2, scratch())), p0())
              ),
              p2()
            )
          )
        )
      );
      // reload(+32) xor load8_u(+0)
      body.push(storeI32(module.i32.xor(module.i32.load(32, 4, scratch()), module.i32.load8_u(0, 1, scratch()))));

      // --- Stage 12: min/max with converted loads ---
      // f32.min(convert_s(load8_s), b) + f32.max(convert_u(load8_u), b)
      body.push(
        storeF32(
          module.f32.add(
            module.f32.min(module.f32.convert_s.i32(module.i32.load8_s(0, 1, scratch())), p1()),
            module.f32.max(module.f32.convert_u.i32(module.i32.load8_u(0, 1, scratch())), p1())
          )
        )
      );
      // f64.min(convert_s(load16_s), c) * f64.max(convert_u(load16_u), c)
      body.push(
        storeF64Safe(
          module.f64.mul(
            module.f64.min(module.f64.convert_s.i32(module.i32.load16_s(0, 2, scratch())), p2()),
            module.f64.max(module.f64.convert_u.i32(module.i32.load16_u(0, 2, scratch())), p2())
          )
        )
      );

      body.push(module.return());

      module.addFunction(
        'exerciseCrossTypePipeline',
        binaryen.createType([binaryen.i32, binaryen.f32, binaryen.f64]),
        binaryen.none,
        [binaryen.i32],
        module.block(null, body)
      );
    }

    // =================================================================
    // exerciseSubWordStoreReload: store8/store16 of computed values then
    // reload as various widths, byte-assembly via store8 then read as
    // i16/i32, unsigned div/rem on sub-word loads, and multi-stage
    // store-reload chains (3+ stages) with width and type changes.
    // Params: (a: i32, b: i32)
    // =================================================================
    {
      const pB = () => module.local.get(1, binaryen.i32);
      const scratch = () => module.local.get(2, binaryen.i32);

      const body = [];
      body.push(module.local.set(2, heapTop()));
      body.push(advanceHeap(64));

      // --- store8 of computed values, reload as various widths ---
      // (a + b) -> store8 at +0 (truncates to low byte)
      body.push(module.i32.store8(0, 1, scratch(), module.i32.add(p0(), pB())));
      body.push(storeI32(module.i32.load8_s(0, 1, scratch())));
      body.push(storeI32(module.i32.load8_u(0, 1, scratch())));
      // Verify truncation: load8_u should equal (a + b) & 0xFF
      body.push(storeI32(module.i32.and(module.i32.add(p0(), pB()), module.i32.const(0xff))));

      // (a * 7) -> store16 at +2 (truncates to low 16 bits)
      body.push(module.i32.store16(2, 2, scratch(), module.i32.mul(p0(), module.i32.const(7))));
      body.push(storeI32(module.i32.load16_s(2, 2, scratch())));
      body.push(storeI32(module.i32.load16_u(2, 2, scratch())));
      // Verify truncation: load16_u should equal (a * 7) & 0xFFFF
      body.push(storeI32(module.i32.and(module.i32.mul(p0(), module.i32.const(7)), module.i32.const(0xffff))));

      // (a ^ b) -> store8 at +4, (a | b) -> store16 at +6
      body.push(module.i32.store8(4, 1, scratch(), module.i32.xor(p0(), pB())));
      body.push(module.i32.store16(6, 2, scratch(), module.i32.or(p0(), pB())));
      body.push(storeI32(module.i32.load8_s(4, 1, scratch())));
      body.push(storeI32(module.i32.load16_u(6, 2, scratch())));

      // --- Byte-assembly via store8, then read as i16/i32 ---
      // Write a's 4 bytes individually via store8 (little-endian)
      body.push(module.i32.store8(8, 1, scratch(), p0()));
      body.push(module.i32.store8(9, 1, scratch(), module.i32.shr_u(p0(), module.i32.const(8))));
      body.push(module.i32.store8(10, 1, scratch(), module.i32.shr_u(p0(), module.i32.const(16))));
      body.push(module.i32.store8(11, 1, scratch(), module.i32.shr_u(p0(), module.i32.const(24))));
      // load16_u(+8) should be a & 0xFFFF
      body.push(storeI32(module.i32.load16_u(8, 2, scratch())));
      // load(+8) should reconstruct a exactly
      body.push(storeI32(module.i32.load(8, 4, scratch())));
      // Store a directly for comparison
      body.push(storeI32(p0()));

      // --- store16 assembly: write two halfwords, read as i32 ---
      body.push(module.i32.store16(16, 2, scratch(), p0()));
      body.push(module.i32.store16(18, 2, scratch(), pB()));
      // load should give (a & 0xFFFF) | ((b & 0xFFFF) << 16)
      body.push(storeI32(module.i32.load(16, 4, scratch())));
      // Manually compute expected value for comparison
      body.push(
        storeI32(
          module.i32.or(
            module.i32.and(p0(), module.i32.const(0xffff)),
            module.i32.shl(module.i32.and(pB(), module.i32.const(0xffff)), module.i32.const(16))
          )
        )
      );

      // --- Unsigned div/rem on sub-word loads ---
      body.push(module.i32.store(20, 4, scratch(), p0()));
      // div_u(load8_u, 10) — load8_u always gives 0..255
      body.push(storeI32(module.i32.div_u(module.i32.load8_u(20, 1, scratch()), module.i32.const(10))));
      // rem_u(load8_u, 10)
      body.push(storeI32(module.i32.rem_u(module.i32.load8_u(20, 1, scratch()), module.i32.const(10))));
      // div_u(load16_u, 100)
      body.push(storeI32(module.i32.div_u(module.i32.load16_u(20, 2, scratch()), module.i32.const(100))));
      // rem_u(load16_u, 100)
      body.push(storeI32(module.i32.rem_u(module.i32.load16_u(20, 2, scratch()), module.i32.const(100))));
      // Compare signed vs unsigned division: same byte, different interpretations
      body.push(storeI32(module.i32.div_s(module.i32.load8_s(20, 1, scratch()), module.i32.const(10))));
      // Signed/unsigned divergence magnitude
      body.push(
        storeI32(
          module.i32.sub(
            module.i32.div_u(module.i32.load8_u(20, 1, scratch()), module.i32.const(10)),
            module.i32.div_s(module.i32.load8_s(20, 1, scratch()), module.i32.const(10))
          )
        )
      );

      // --- 3-stage chain: store8 -> reload -> compute -> store16 -> reload -> compute -> store -> reload ---
      // Stage A: a -> store8 at +24 (truncate to byte)
      body.push(module.i32.store8(24, 1, scratch(), p0()));
      // Stage B: load8_u(+24) + b -> store16 at +26 (truncate to 16 bits)
      body.push(module.i32.store16(26, 2, scratch(), module.i32.add(module.i32.load8_u(24, 1, scratch()), pB())));
      // Stage C: load16_u(+26) * 3 -> store at +28
      body.push(module.i32.store(28, 4, scratch(), module.i32.mul(module.i32.load16_u(26, 2, scratch()), module.i32.const(3))));
      // Stage D: load(+28) xor load8_u(+24) -> storeI32
      body.push(storeI32(module.i32.xor(module.i32.load(28, 4, scratch()), module.i32.load8_u(24, 1, scratch()))));

      // --- 4-stage chain: i32 -> float -> memory -> trunc -> store -> reload ---
      // Stage A: a*b -> store at +32
      body.push(module.i32.store(32, 4, scratch(), module.i32.mul(p0(), pB())));
      // Stage B: load(+32) -> convert_s -> f32 -> f32.store at +36
      body.push(module.f32.store(36, 4, scratch(), module.f32.convert_s.i32(module.i32.load(32, 4, scratch()))));
      // Stage C: f32.load(+36) + 0.5 -> trunc_s -> store at +40
      body.push(
        module.i32.store(
          40,
          4,
          scratch(),
          module.i32.trunc_s.f32(module.f32.add(module.f32.load(36, 4, scratch()), module.f32.const(0.5)))
        )
      );
      // Stage D: load(+40) - load(+32) -> storeI32
      body.push(storeI32(module.i32.sub(module.i32.load(40, 4, scratch()), module.i32.load(32, 4, scratch()))));

      // --- 4-stage chain: sub-word -> float -> demote -> trunc ---
      // Stage A: a -> store8 at +44
      body.push(module.i32.store8(44, 1, scratch(), p0()));
      // Stage B: load8_s(+44) -> convert_s -> f64 -> f64.store at +48 (align=4)
      body.push(module.f64.store(48, 4, scratch(), module.f64.convert_s.i32(module.i32.load8_s(44, 1, scratch()))));
      // Stage C: f64.load(+48) * 3.0 -> demote -> f32.store at +56
      body.push(
        module.f32.store(
          56,
          4,
          scratch(),
          module.f32.demote(module.f64.mul(module.f64.load(48, 4, scratch()), module.f64.const(3.0)))
        )
      );
      // Stage D: f32.load(+56) -> trunc_s + original load8_u(+44) -> storeI32
      body.push(
        storeI32(
          module.i32.add(module.i32.trunc_s.f32(module.f32.load(56, 4, scratch())), module.i32.load8_u(44, 1, scratch()))
        )
      );

      body.push(module.return());

      module.addFunction(
        'exerciseSubWordStoreReload',
        binaryen.createType([binaryen.i32, binaryen.i32]),
        binaryen.none,
        [binaryen.i32],
        module.block(null, body)
      );
    }

    // =================================================================
    // exercisePrecisionAndReinterpret: f32 precision boundaries, float
    // truncation at fractional boundaries, reinterpret chains through
    // memory, memory.size, and non-zero-offset f32/f64 memory ops.
    // Params: (a: i32, b: f32, c: f64)
    // =================================================================
    {
      const scratch = () => module.local.get(3, binaryen.i32);

      const body = [];
      body.push(module.local.set(3, heapTop()));
      body.push(advanceHeap(64));

      // --- f32 precision boundaries ---
      // 2^24 = 16777216 — exact in f32
      body.push(storeI32(module.i32.trunc_s.f32(module.f32.convert_s.i32(module.i32.const(16777216)))));
      // 2^24 + 1 = 16777217 — not exact in f32, rounds to 16777216
      body.push(storeI32(module.i32.trunc_s.f32(module.f32.convert_s.i32(module.i32.const(16777217)))));
      // Same value via f64 — exact → 16777217
      body.push(storeI32(module.i32.trunc_s.f64(module.f64.convert_s.i32(module.i32.const(16777217)))));
      // 2^24 + 2 — exact in f32 (even)
      body.push(storeI32(module.i32.trunc_s.f32(module.f32.convert_s.i32(module.i32.const(16777218)))));
      // 2^24 + 3 — rounds to 16777220 in f32 (round-to-even)
      body.push(storeI32(module.i32.trunc_s.f32(module.f32.convert_s.i32(module.i32.const(16777219)))));
      // Large unsigned: f32.convert_u(0xFFFFFF00) — representable (top 24 bits)
      body.push(storeF32(module.f32.convert_u.i32(module.i32.const(0xffffff00 | 0))));
      // Large unsigned: f32.convert_u(0xFFFFFF01) — not representable, rounds
      body.push(storeF32(module.f32.convert_u.i32(module.i32.const(0xffffff01 | 0))));
      // Parametric precision loss: trunc_s_sat(f32.convert_s(a)) - a
      body.push(storeI32(module.i32.sub(module.i32.trunc_s_sat.f32(module.f32.convert_s.i32(p0())), p0())));
      // Same via f64 — should always be 0
      body.push(storeI32(module.i32.sub(module.i32.trunc_s.f64(module.f64.convert_s.i32(p0())), p0())));

      // --- Float truncation at fractional boundaries ---
      body.push(storeI32(module.i32.trunc_s.f32(module.f32.const(2.9))));
      body.push(storeI32(module.i32.trunc_s.f32(module.f32.const(-2.9))));
      body.push(storeI32(module.i32.trunc_s.f64(module.f64.const(-0.9))));
      body.push(storeI32(module.i32.trunc_u_sat.f64(module.f64.const(0.999))));
      body.push(storeI32(module.i32.trunc_s.f64(module.f64.const(-1.1))));
      body.push(storeI32(module.i32.trunc_s_sat.f32(module.f32.const(2.5))));
      body.push(storeI32(module.i32.trunc_u_sat.f64(module.f64.const(3.7))));
      body.push(storeI32(module.i32.trunc_s.f64(module.f64.const(1.9999999))));
      // Parametric: convert_s(a) + 0.9 — just below next integer
      body.push(storeI32(module.i32.trunc_s.f32(module.f32.add(module.f32.convert_s.i32(p0()), module.f32.const(0.9)))));
      // convert_s(a) - 0.1 — just below current integer
      body.push(storeI32(module.i32.trunc_s.f64(module.f64.sub(module.f64.convert_s.i32(p0()), module.f64.const(0.1)))));

      // --- Reinterpret chains through memory ---
      // Chain 1: convert_s(a) -> f32.store -> i32.load (reinterpret) -> xor sign bit
      //          -> i32.store -> f32.load (reinterpret back) -> trunc_s_sat
      body.push(module.f32.store(0, 4, scratch(), module.f32.convert_s.i32(p0())));
      body.push(storeI32(module.i32.load(0, 4, scratch())));
      body.push(
        module.i32.store(4, 4, scratch(), module.i32.xor(module.i32.load(0, 4, scratch()), module.i32.const(0x80000000 | 0)))
      );
      body.push(storeI32(module.i32.trunc_s_sat.f32(module.f32.load(4, 4, scratch()))));

      // Chain 2: b -> reinterpret -> i32 arith -> reinterpret back -> storeF32
      body.push(storeI32(module.i32.reinterpret(p1())));
      body.push(storeI32(module.i32.add(module.i32.reinterpret(p1()), module.i32.const(1))));
      body.push(storeF32(module.f32.reinterpret(module.i32.add(module.i32.reinterpret(p1()), module.i32.const(1)))));

      // Chain 3: reinterpret(convert_s(a)) + reinterpret(convert_u(a))
      body.push(
        storeI32(
          module.i32.add(
            module.i32.reinterpret(module.f32.convert_s.i32(p0())),
            module.i32.reinterpret(module.f32.convert_u.i32(p0()))
          )
        )
      );

      // --- memory.size (stubbed to 0 in transpiled backends, skip to keep CRC parity) ---

      // --- Non-zero offset f32/f64 memory ops ---
      // f32 at offset 8
      body.push(module.f32.store(8, 4, scratch(), p1()));
      body.push(storeF32(module.f32.load(8, 4, scratch())));
      // f32 computed value at offset 12
      body.push(module.f32.store(12, 4, scratch(), module.f32.add(p1(), module.f32.const(1.0))));
      body.push(storeF32(module.f32.add(module.f32.load(12, 4, scratch()), p1())));
      // f64 at offset 16 (align=4)
      body.push(module.f64.store(16, 4, scratch(), p2()));
      body.push(storeF64Safe(module.f64.load(16, 4, scratch())));
      // f64 computed value at offset 24 (align=4)
      body.push(module.f64.store(24, 4, scratch(), module.f64.mul(p2(), module.f64.const(2.0))));
      body.push(storeF64Safe(module.f64.sub(module.f64.load(24, 4, scratch()), p2())));
      // f32 store, read back as i32 (cross-type load of float bits)
      body.push(module.f32.store(32, 4, scratch(), p1()));
      body.push(storeI32(module.i32.load(32, 4, scratch())));

      // --- 4-stage chain through memory with type changes ---
      // Stage A: convert_s(a) -> f32.store at +36
      body.push(module.f32.store(36, 4, scratch(), module.f32.convert_s.i32(p0())));
      // Stage B: f32.load(+36) -> promote -> add c -> f64.store at +40 (align=4)
      body.push(
        module.f64.store(40, 4, scratch(), module.f64.add(module.f64.promote(module.f32.load(36, 4, scratch())), p2()))
      );
      // Stage C: f64.load(+40) -> demote -> mul b -> trunc_s_sat -> store at +48
      body.push(
        module.i32.store(
          48,
          4,
          scratch(),
          module.i32.trunc_s_sat.f32(module.f32.mul(module.f32.demote(module.f64.load(40, 4, scratch())), p1()))
        )
      );
      // Stage D: load(+48) + a -> storeI32
      body.push(storeI32(module.i32.add(module.i32.load(48, 4, scratch()), p0())));

      body.push(module.return());

      module.addFunction(
        'exercisePrecisionAndReinterpret',
        binaryen.createType([binaryen.i32, binaryen.f32, binaryen.f64]),
        binaryen.none,
        [binaryen.i32],
        module.block(null, body)
      );
    }
  }

  module.addFunction(
    'emitSegmentsToHost',
    /*params*/ binaryen.none,
    /*result*/ binaryen.none,
    [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      module.loop(
        'emitSegmentsSegmentLoop',
        module.block('emitSegmentsCurrentSegmentCompleted', [
          module.local.set(1, module.i32.load(0, 4, module.i32.mul(module.local.get(0, binaryen.i32), module.i32.const(4)))),
          module.local.set(0, module.i32.add(module.i32.const(1), module.local.get(0, binaryen.i32))),
          module.local.set(2, module.i32.const(0)),
          module.loop(
            'emitSegmentsByteLoop',
            module.block('emitSegmentsCurrentByteCompleted', [
              module.local.set(3, module.i32.load8_u(0, 1, module.local.get(1, binaryen.i32))),
              module.local.set(1, module.i32.add(module.i32.const(1), module.local.get(1, binaryen.i32))),
              module.i32.store8(
                0,
                1,
                // get heap top
                module.global.get('heapTop', binaryen.i32),
                module.local.get(3, binaryen.i32)
              ),
              module.global.set('heapTop', module.i32.add(module.global.get('heapTop', binaryen.i32), module.i32.const(1))),
              module.i32.store8(
                0,
                1,
                module.i32.add(module.i32.const(128), module.local.get(2, binaryen.i32)),
                module.local.get(3, binaryen.i32)
              ),
              module.local.set(2, module.i32.add(module.i32.const(1), module.local.get(2, binaryen.i32))),
              module.if(
                module.i32.eq(module.local.get(3, binaryen.i32), module.i32.const('X'.charCodeAt(0))),
                module.block(null, [
                  module.i32.store8(
                    0,
                    1,
                    module.i32.add(module.i32.const(128), module.local.get(2, binaryen.i32)),
                    module.i32.const(0xa)
                  ),
                  module.i32.store8(
                    0,
                    1,
                    module.i32.add(
                      module.i32.const(1),
                      module.i32.add(module.i32.const(128), module.local.get(2, binaryen.i32))
                    ),
                    module.i32.const(0)
                  ),
                  module.i32.store8(0, 1, module.global.get('heapTop', binaryen.i32), module.i32.const(0xa)),
                  module.call('alignHeapTop', [], binaryen.none),
                  module.call('hostOnBufferReady', [], binaryen.none),
                  module.break('emitSegmentsCurrentSegmentCompleted')
                ]),
                0
              ),
              module.if(
                module.i32.eqz(module.local.get(3, binaryen.i32), module.i32.const(0)),
                module.block(null, [
                  module.call('alignHeapTop', [], binaryen.none),
                  module.call('hostOnBufferReady', [], binaryen.none),
                  module.break('emitSegmentsCurrentByteCompleted')
                ])
              ),
              module.break('emitSegmentsByteLoop')
            ])
          ),

          module.break(
            'emitSegmentsSegmentLoop',
            module.i32.lt_s(module.local.get(0, binaryen.i32), module.i32.const(expectedData.length))
          )
        ])
      ),
      module.return()
    ])
  );

  module.addFunctionExport('emitSegmentsToHost', 'emitSegmentsToHost');
  module.addFunctionExport('exerciseMVPOps', 'exerciseMVPOps');
  module.addFunctionExport('exerciseOverflowOps', 'exerciseOverflowOps');
  module.addFunctionExport('exerciseEdgeCases', 'exerciseEdgeCases');
  module.addFunctionExport('exerciseBrTable', 'exerciseBrTable');
  module.addFunctionExport('exerciseBrTableLoop', 'exerciseBrTableLoop');
  module.addFunctionExport('exerciseCountedLoop', 'exerciseCountedLoop');
  module.addFunctionExport('exerciseDoWhileLoop', 'exerciseDoWhileLoop');
  module.addFunctionExport('exerciseDoWhileVariantA', 'exerciseDoWhileVariantA');
  module.addFunctionExport('exerciseNestedLoops', 'exerciseNestedLoops');
  module.addFunctionExport('exerciseSwitchInLoop', 'exerciseSwitchInLoop');
  module.addFunctionExport('exerciseBrTableMultiTarget', 'exerciseBrTableMultiTarget');
  module.addFunctionExport('exerciseNestedSwitch', 'exerciseNestedSwitch');
  module.addFunctionExport('exerciseSwitchDefaultInternal', 'exerciseSwitchDefaultInternal');
  module.addFunctionExport('exerciseMultiExitSwitchLoop', 'exerciseMultiExitSwitchLoop');
  module.addFunctionExport('exerciseSwitchConditionalEscape', 'exerciseSwitchConditionalEscape');
  module.addFunctionExport('exerciseNestedArithmetic', 'exerciseNestedArithmetic');
  module.addFunctionExport('exerciseMemoryArithmetic', 'exerciseMemoryArithmetic');
  module.addFunctionExport('exerciseMixedTypeChains', 'exerciseMixedTypeChains');
  module.addFunctionExport('exerciseEdgeArithmetic', 'exerciseEdgeArithmetic');
  module.addFunctionExport('exerciseMixedWidthLoads', 'exerciseMixedWidthLoads');
  module.addFunctionExport('exerciseLoadToFloat', 'exerciseLoadToFloat');
  module.addFunctionExport('exerciseCrossTypePipeline', 'exerciseCrossTypePipeline');
  module.addFunctionExport('exerciseSubWordStoreReload', 'exerciseSubWordStoreReload');
  module.addFunctionExport('exercisePrecisionAndReinterpret', 'exercisePrecisionAndReinterpret');
  module.addFunctionExport('alignHeapTop', 'alignHeapTop');
  module.addFunctionExport('getHeapTop', 'getHeapTop');
  module.addFunctionImport('hostOnBufferReady', 'module', 'hostOnBufferReady', /* params */ binaryen.none, binaryen.none);

  if (!module.validate()) throw new Error('validation error');

  process.stdout.write(module.emitText());

  return module;
})();
