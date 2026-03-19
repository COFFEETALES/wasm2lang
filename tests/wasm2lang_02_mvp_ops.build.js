'use strict';

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const {module, heapTop, advanceHeap, storeI32, storeF32, storeF64, storeF64Safe} =
    common.createTestModule(binaryen, {memoryPages: 8, heapBase: 1024});

  const p0 = () => module.local.get(0, binaryen.i32);
  const p1 = () => module.local.get(1, binaryen.f32);
  const p2 = () => module.local.get(2, binaryen.f64);

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

  module.addFunctionExport('exerciseMVPOps', 'exerciseMVPOps');
  module.addFunctionExport('exerciseOverflowOps', 'exerciseOverflowOps');
  module.addFunctionExport('exerciseEdgeCases', 'exerciseEdgeCases');

  common.finalizeAndOutput(module);

  // Shared data generation
  const staticData = {
    i32_f32_f64_triples: [
      [42, 3.5, 2.75], [0, 0.0, 0.0], [-1, 0.5, 0.5],
      [2147483647, 100.0, 100.0], [1, 1.0, 1.0],
      [-2147483648, 3.0, 3.0], [255, 0.125, 0.125], [16, 4.0, 4.0]
    ]
  };
  const data = {};
  data.i32_f32_f64_triples = staticData.i32_f32_f64_triples.concat(
    Array.from({length: 3}, () => [common.rand.i32(), common.rand.uF32(), common.rand.uF64()])
  );
  common.emitSharedData(data);
})();
