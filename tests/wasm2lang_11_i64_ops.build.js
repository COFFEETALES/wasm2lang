'use strict';

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const rand = common.rand;
  const i64c = common.i64c;
  const {module, heapTop, advanceHeap, storeI32, storeI64, storeF32, storeF64Safe} = common.createTestModule(binaryen, {
    memoryPages: 8,
    heapBase: 1024
  });

  module.setFeatures(binaryen.Features.MVP | binaryen.Features.NontrappingFPToInt | binaryen.Features.SignExt);

  // =================================================================
  // exerciseI64Arithmetic: i64 add, sub, mul, div, rem with signed
  // and unsigned variants. Params are i32, extended internally.
  // Params: (a: i32, b: i32)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.i32);
    const a64 = () => module.i64.extend_s(p0());
    const b64 = () => module.i64.extend_s(p1());
    const b64nz = () => module.i64.extend_s(module.i32.or(p1(), module.i32.const(1)));
    const a64u = () => module.i64.extend_u(p0());
    const b64unz = () => module.i64.extend_u(module.i32.or(p1(), module.i32.const(1)));

    module.addFunction(
      'exerciseI64Arithmetic',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        // add
        storeI64(module.i64.add(a64(), b64())),
        // sub
        storeI64(module.i64.sub(a64(), b64())),
        // mul
        storeI64(module.i64.mul(a64(), b64())),
        // div_s (guard zero)
        storeI64(module.i64.div_s(a64(), b64nz())),
        // rem_s (guard zero)
        storeI64(module.i64.rem_s(a64(), b64nz())),
        // div_u (unsigned extend, guard zero)
        storeI64(module.i64.div_u(a64u(), b64unz())),
        // rem_u (unsigned extend, guard zero)
        storeI64(module.i64.rem_u(a64u(), b64unz())),
        // chained: (a + b) * (a - b)
        storeI64(module.i64.mul(module.i64.add(a64(), b64()), module.i64.sub(a64(), b64()))),
        // nested: ((a * b) + a) - b
        storeI64(module.i64.sub(module.i64.add(module.i64.mul(a64(), b64()), a64()), b64())),
        // wrap results to i32 for cross-check
        storeI32(module.i32.wrap(module.i64.add(a64(), b64()))),
        storeI32(module.i32.wrap(module.i64.mul(a64(), b64()))),
        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseI64Bitwise: and, or, xor, shl, shr_s, shr_u, rotl, rotr
  // Params: (a: i32, b: i32)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.i32);
    const a64 = () => module.i64.extend_s(p0());
    const b64 = () => module.i64.extend_s(p1());
    const shift = () => module.i64.extend_s(module.i32.and(p1(), module.i32.const(63)));

    module.addFunction(
      'exerciseI64Bitwise',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        storeI64(module.i64.and(a64(), b64())),
        storeI64(module.i64.or(a64(), b64())),
        storeI64(module.i64.xor(a64(), b64())),
        storeI64(module.i64.shl(a64(), shift())),
        storeI64(module.i64.shr_s(a64(), shift())),
        storeI64(module.i64.shr_u(a64(), shift())),
        storeI64(module.i64.rotl(a64(), shift())),
        storeI64(module.i64.rotr(a64(), shift())),
        // xor chain: (a ^ b) ^ a = b
        storeI64(module.i64.xor(module.i64.xor(a64(), b64()), a64())),
        // bit packing: (a64 << 32) | (b64 & 0xFFFFFFFF)
        storeI64(
          module.i64.or(
            module.i64.shl(a64(), module.i64.const(i64c(32, 0))),
            module.i64.and(b64(), module.i64.const(i64c(-1, 0)))
          )
        ),
        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseI64Unary: clz, ctz, popcnt, eqz, extend8/16/32_s
  // Params: (a: i32)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const a64 = () => module.i64.extend_s(p0());

    module.addFunction(
      'exerciseI64Unary',
      binaryen.createType([binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        storeI64(module.i64.clz(a64())),
        storeI64(module.i64.ctz(a64())),
        storeI64(module.i64.popcnt(a64())),
        storeI32(module.i64.eqz(a64())),
        storeI64(module.i64.extend8_s(a64())),
        storeI64(module.i64.extend16_s(a64())),
        storeI64(module.i64.extend32_s(a64())),
        // chained: clz(a) + ctz(a) + popcnt(a)
        storeI64(module.i64.add(module.i64.add(module.i64.clz(a64()), module.i64.ctz(a64())), module.i64.popcnt(a64()))),
        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseI64Comparison: eq, ne, lt_s/u, le_s/u, gt_s/u, ge_s/u
  // Params: (a: i32, b: i32)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.i32);
    const a64 = () => module.i64.extend_s(p0());
    const b64 = () => module.i64.extend_s(p1());
    const a64u = () => module.i64.extend_u(p0());
    const b64u = () => module.i64.extend_u(p1());

    module.addFunction(
      'exerciseI64Comparison',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        storeI32(module.i64.eq(a64(), b64())),
        storeI32(module.i64.ne(a64(), b64())),
        storeI32(module.i64.lt_s(a64(), b64())),
        storeI32(module.i64.le_s(a64(), b64())),
        storeI32(module.i64.gt_s(a64(), b64())),
        storeI32(module.i64.ge_s(a64(), b64())),
        storeI32(module.i64.lt_u(a64u(), b64u())),
        storeI32(module.i64.le_u(a64u(), b64u())),
        storeI32(module.i64.gt_u(a64u(), b64u())),
        storeI32(module.i64.ge_u(a64u(), b64u())),
        // comparison as operand: (a == b) + (a < b) + (a > b) = always 1
        storeI32(
          module.i32.add(
            module.i32.add(module.i64.eq(a64(), b64()), module.i64.lt_s(a64(), b64())),
            module.i64.gt_s(a64(), b64())
          )
        ),
        // signed vs unsigned divergence: lt_s(-1,1) vs lt_u(-1_as_u64,1_as_u64)
        storeI32(module.i32.or(module.i64.lt_s(a64(), b64()), module.i64.lt_u(a64u(), b64u()))),
        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseI64Memory: store/load i64, sub-word stores/loads
  // Params: (a: i32, b: i32)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.i32);
    const a64 = () => module.i64.extend_s(p0());
    const scratch = () => module.local.get(2, binaryen.i32);

    module.addFunction(
      'exerciseI64Memory',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [binaryen.i32],
      module.block(null, [
        module.local.set(2, heapTop()),
        advanceHeap(64),

        // --- full i64 store/load roundtrip ---
        module.i64.store(0, 4, scratch(), a64()),
        storeI64(module.i64.load(0, 4, scratch())),

        // --- store i64, load back, add another value ---
        module.i64.store(0, 4, scratch(), module.i64.extend_s(p1())),
        storeI64(module.i64.add(module.i64.load(0, 4, scratch()), a64())),

        // --- i64.store32 / i64.load32_s ---
        module.i64.store32(0, 4, scratch(), a64()),
        storeI64(module.i64.load32_s(0, 4, scratch())),

        // --- i64.store32 / i64.load32_u ---
        module.i64.store32(0, 4, scratch(), a64()),
        storeI64(module.i64.load32_u(0, 4, scratch())),

        // --- i64.store16 / i64.load16_s ---
        module.i64.store16(0, 2, scratch(), a64()),
        storeI64(module.i64.load16_s(0, 2, scratch())),

        // --- i64.store16 / i64.load16_u ---
        module.i64.store16(0, 2, scratch(), a64()),
        storeI64(module.i64.load16_u(0, 2, scratch())),

        // --- i64.store8 / i64.load8_s ---
        module.i64.store8(0, 1, scratch(), a64()),
        storeI64(module.i64.load8_s(0, 1, scratch())),

        // --- i64.store8 / i64.load8_u ---
        module.i64.store8(0, 1, scratch(), a64()),
        storeI64(module.i64.load8_u(0, 1, scratch())),

        // --- dual slot: store at +0 and +8, load both, add ---
        module.i64.store(0, 4, scratch(), a64()),
        module.i64.store(8, 4, scratch(), module.i64.extend_s(p1())),
        storeI64(module.i64.add(module.i64.load(0, 4, scratch()), module.i64.load(8, 4, scratch()))),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseI64Conversions: extend_s/u, wrap, float conversions
  // Params: (a: i32, b: f32, c: f64)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.f32);
    const p2 = () => module.local.get(2, binaryen.f64);
    const a64s = () => module.i64.extend_s(p0());
    const a64u = () => module.i64.extend_u(p0());

    module.addFunction(
      'exerciseI64Conversions',
      binaryen.createType([binaryen.i32, binaryen.f32, binaryen.f64]),
      binaryen.none,
      [],
      module.block(null, [
        // --- i32 → i64 extend ---
        storeI64(a64s()),
        storeI64(a64u()),

        // --- i64 → i32 wrap ---
        storeI32(module.i32.wrap(a64s())),

        // --- i64 → float conversions ---
        storeF32(module.f32.convert_s.i64(a64s())),
        storeF64Safe(module.f64.convert_s.i64(a64s())),
        storeF32(module.f32.convert_u.i64(a64u())),
        storeF64Safe(module.f64.convert_u.i64(a64u())),

        // --- float → i64 truncations ---
        storeI64(module.i64.trunc_s.f32(p1())),
        storeI64(module.i64.trunc_s.f64(p2())),

        // --- saturating truncations ---
        storeI64(module.i64.trunc_s_sat.f32(p1())),
        storeI64(module.i64.trunc_s_sat.f64(p2())),
        storeI64(module.i64.trunc_u_sat.f32(module.f32.abs(p1()))),
        storeI64(module.i64.trunc_u_sat.f64(module.f64.abs(p2()))),

        // --- reinterpret i64 ↔ f64 ---
        storeF64Safe(module.f64.reinterpret(a64s())),
        storeI64(module.i64.reinterpret(p2())),

        // --- chained: extend_s → add → wrap ---
        storeI32(module.i32.wrap(module.i64.add(a64s(), module.i64.const(i64c(100, 0))))),

        // --- extend_u → convert_u → trunc_sat ---
        storeI64(module.i64.trunc_s_sat.f64(module.f64.convert_u.i64(a64u()))),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseI64EdgeCases: overflow, boundary constants, unsigned
  // semantics. No parameters — all constant-driven.
  // =================================================================
  {
    module.addFunction(
      'exerciseI64EdgeCases',
      binaryen.none,
      binaryen.none,
      [],
      module.block(null, [
        // --- identity constants ---
        // 0
        storeI64(module.i64.const(i64c(0, 0))),
        // 1
        storeI64(module.i64.const(i64c(1, 0))),
        // -1 (all bits set)
        storeI64(module.i64.const(i64c(-1, -1))),
        // i64 MAX = 0x7FFFFFFFFFFFFFFF
        storeI64(module.i64.const(i64c(-1, 0x7fffffff))),
        // i64 MIN = 0x8000000000000000
        storeI64(module.i64.const(i64c(0, 0x80000000 | 0))),

        // --- overflow: MAX + 1 = MIN ---
        storeI64(module.i64.add(module.i64.const(i64c(-1, 0x7fffffff)), module.i64.const(i64c(1, 0)))),
        // --- overflow: MIN - 1 = MAX ---
        storeI64(module.i64.sub(module.i64.const(i64c(0, 0x80000000 | 0)), module.i64.const(i64c(1, 0)))),
        // --- overflow: MAX * 2 ---
        storeI64(module.i64.mul(module.i64.const(i64c(-1, 0x7fffffff)), module.i64.const(i64c(2, 0)))),
        // --- negation overflow: MIN * -1 = MIN ---
        storeI64(module.i64.mul(module.i64.const(i64c(0, 0x80000000 | 0)), module.i64.const(i64c(-1, -1)))),

        // --- values > 32 bits ---
        // 2^32 = 4294967296
        storeI64(module.i64.const(i64c(0, 1))),
        // 2^32 + 1
        storeI64(module.i64.add(module.i64.const(i64c(0, 1)), module.i64.const(i64c(1, 0)))),
        // 2^32 - 1 = 0xFFFFFFFF (fits in low word)
        storeI64(module.i64.const(i64c(-1, 0))),
        // (2^32 - 1) * (2^32 - 1) — large multiplication
        storeI64(module.i64.mul(module.i64.const(i64c(-1, 0)), module.i64.const(i64c(-1, 0)))),

        // --- unsigned division of large values ---
        // 0xFFFFFFFFFFFFFFFF /u 2 = 0x7FFFFFFFFFFFFFFF
        storeI64(module.i64.div_u(module.i64.const(i64c(-1, -1)), module.i64.const(i64c(2, 0)))),
        // 0xFFFFFFFFFFFFFFFF %u 10
        storeI64(module.i64.rem_u(module.i64.const(i64c(-1, -1)), module.i64.const(i64c(10, 0)))),

        // --- bitwise on 64-bit boundaries ---
        // rotl(1, 32) = 2^32
        storeI64(module.i64.rotl(module.i64.const(i64c(1, 0)), module.i64.const(i64c(32, 0)))),
        // rotr(1, 1) = 0x8000000000000000
        storeI64(module.i64.rotr(module.i64.const(i64c(1, 0)), module.i64.const(i64c(1, 0)))),
        // shl(1, 63) = MIN
        storeI64(module.i64.shl(module.i64.const(i64c(1, 0)), module.i64.const(i64c(63, 0)))),
        // shr_s(MIN, 63) = -1
        storeI64(module.i64.shr_s(module.i64.const(i64c(0, 0x80000000 | 0)), module.i64.const(i64c(63, 0)))),
        // shr_u(MIN, 63) = 1
        storeI64(module.i64.shr_u(module.i64.const(i64c(0, 0x80000000 | 0)), module.i64.const(i64c(63, 0)))),

        // --- unary on edge values ---
        // clz(1) = 63
        storeI64(module.i64.clz(module.i64.const(i64c(1, 0)))),
        // ctz(MIN) = 63
        storeI64(module.i64.ctz(module.i64.const(i64c(0, 0x80000000 | 0)))),
        // popcnt(-1) = 64
        storeI64(module.i64.popcnt(module.i64.const(i64c(-1, -1)))),
        // popcnt(0xAAAAAAAA55555555) = 32
        storeI64(module.i64.popcnt(module.i64.const(i64c(0x55555555, 0xaaaaaaaa | 0)))),
        // eqz(0) = 1
        storeI32(module.i64.eqz(module.i64.const(i64c(0, 0)))),
        // eqz(1) = 0
        storeI32(module.i64.eqz(module.i64.const(i64c(1, 0)))),

        // --- sign extension edge cases ---
        // extend8_s(0xFF) = -1
        storeI64(module.i64.extend8_s(module.i64.const(i64c(0xff, 0)))),
        // extend8_s(0x7F) = 127
        storeI64(module.i64.extend8_s(module.i64.const(i64c(0x7f, 0)))),
        // extend16_s(0xFFFF) = -1
        storeI64(module.i64.extend16_s(module.i64.const(i64c(0xffff, 0)))),
        // extend16_s(0x8000) = -32768
        storeI64(module.i64.extend16_s(module.i64.const(i64c(0x8000, 0)))),
        // extend32_s(0xFFFFFFFF) = -1
        storeI64(module.i64.extend32_s(module.i64.const(i64c(-1, 0)))),
        // extend32_s(0x80000000) = -2147483648 (as i64)
        storeI64(module.i64.extend32_s(module.i64.const(i64c(0x80000000 | 0, 0)))),

        // --- comparison edge cases ---
        // lt_s(MIN, MAX) = 1
        storeI32(module.i64.lt_s(module.i64.const(i64c(0, 0x80000000 | 0)), module.i64.const(i64c(-1, 0x7fffffff)))),
        // lt_u(MIN, MAX) = 0 (MIN as unsigned > MAX as unsigned)
        storeI32(module.i64.lt_u(module.i64.const(i64c(0, 0x80000000 | 0)), module.i64.const(i64c(-1, 0x7fffffff)))),
        // eq(0, 0) = 1
        storeI32(module.i64.eq(module.i64.const(i64c(0, 0)), module.i64.const(i64c(0, 0)))),

        // --- XOR swap simulation ---
        // a=0x12345678ABCDEF01, b=0xFEDCBA9876543210
        // a^b, b^(a^b)=a, (a^b)^a=b
        storeI64(
          module.i64.xor(module.i64.const(i64c(0xabcdef01 | 0, 0x12345678)), module.i64.const(i64c(0x76543210, 0xfedcba98 | 0)))
        ),
        storeI64(
          module.i64.xor(
            module.i64.const(i64c(0x76543210, 0xfedcba98 | 0)),
            module.i64.xor(
              module.i64.const(i64c(0xabcdef01 | 0, 0x12345678)),
              module.i64.const(i64c(0x76543210, 0xfedcba98 | 0))
            )
          )
        ),
        storeI64(
          module.i64.xor(
            module.i64.xor(
              module.i64.const(i64c(0xabcdef01 | 0, 0x12345678)),
              module.i64.const(i64c(0x76543210, 0xfedcba98 | 0))
            ),
            module.i64.xor(
              module.i64.const(i64c(0x76543210, 0xfedcba98 | 0)),
              module.i64.xor(
                module.i64.const(i64c(0xabcdef01 | 0, 0x12345678)),
                module.i64.const(i64c(0x76543210, 0xfedcba98 | 0))
              )
            )
          )
        ),

        // --- division identity: q*d + r = n ---
        // n = 0x123456789ABCDEF0, d = 7
        storeI64(module.i64.div_s(module.i64.const(i64c(0x9abcdef0 | 0, 0x12345678)), module.i64.const(i64c(7, 0)))),
        storeI64(module.i64.rem_s(module.i64.const(i64c(0x9abcdef0 | 0, 0x12345678)), module.i64.const(i64c(7, 0)))),
        storeI64(
          module.i64.add(
            module.i64.mul(
              module.i64.div_s(module.i64.const(i64c(0x9abcdef0 | 0, 0x12345678)), module.i64.const(i64c(7, 0))),
              module.i64.const(i64c(7, 0))
            ),
            module.i64.rem_s(module.i64.const(i64c(0x9abcdef0 | 0, 0x12345678)), module.i64.const(i64c(7, 0)))
          )
        ),

        // --- alternating bits ---
        // 0xAAAAAAAAAAAAAAAA + 0x5555555555555555 = -1
        storeI64(
          module.i64.add(module.i64.const(i64c(0xaaaaaaaa | 0, 0xaaaaaaaa | 0)), module.i64.const(i64c(0x55555555, 0x55555555)))
        ),

        // --- self operations ---
        // x ^ x = 0
        storeI64(
          module.i64.xor(
            module.i64.const(i64c(0xdeadbeef | 0, 0xcafebabe | 0)),
            module.i64.const(i64c(0xdeadbeef | 0, 0xcafebabe | 0))
          )
        ),
        // x & x = x
        storeI64(
          module.i64.and(module.i64.const(i64c(0x12345678, 0x9abcdef0 | 0)), module.i64.const(i64c(0x12345678, 0x9abcdef0 | 0)))
        ),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseI64TruncConvert: sat trunc/convert chains with wide-range
  // random float input.  Uses sat trunc exclusively so any value
  // (negative, huge, near boundary) is safe.
  // =================================================================
  {
    const tf0 = () => module.local.get(0, binaryen.f32);
    const tf1 = () => module.local.get(1, binaryen.f64);

    module.addFunction(
      'exerciseI64TruncConvert',
      binaryen.createType([binaryen.f32, binaryen.f64]),
      binaryen.none,
      [],
      module.block(null, [
        // Saturating truncation — all 4 variants
        storeI64(module.i64.trunc_s_sat.f32(tf0())),
        storeI64(module.i64.trunc_u_sat.f32(module.f32.abs(tf0()))),
        storeI64(module.i64.trunc_s_sat.f64(tf1())),
        storeI64(module.i64.trunc_u_sat.f64(module.f64.abs(tf1()))),

        // Sat trunc → convert roundtrip (i64→float after float→i64)
        storeF32(module.f32.convert_s.i64(module.i64.trunc_s_sat.f32(tf0()))),
        storeF64Safe(module.f64.convert_s.i64(module.i64.trunc_s_sat.f64(tf1()))),
        storeF32(module.f32.convert_u.i64(module.i64.trunc_u_sat.f32(module.f32.abs(tf0())))),
        storeF64Safe(module.f64.convert_u.i64(module.i64.trunc_u_sat.f64(module.f64.abs(tf1())))),

        // Promote → sat trunc, demote → sat trunc
        storeI64(module.i64.trunc_s_sat.f64(module.f64.promote(tf0()))),
        storeI64(module.i64.trunc_s_sat.f32(module.f32.demote(tf1()))),

        // Reinterpret roundtrip: f64 → i64 → f64
        storeI64(module.i64.reinterpret(tf1())),
        storeF64Safe(module.f64.reinterpret(module.i64.reinterpret(tf1()))),

        // Wrap sat trunc result to i32
        storeI32(module.i32.wrap(module.i64.trunc_s_sat.f64(tf1()))),
        storeI32(module.i32.wrap(module.i64.trunc_u_sat.f64(module.f64.abs(tf1())))),

        module.return()
      ])
    );
  }

  // --- exports ---
  module.addFunctionExport('exerciseI64Arithmetic', 'exerciseI64Arithmetic');
  module.addFunctionExport('exerciseI64Bitwise', 'exerciseI64Bitwise');
  module.addFunctionExport('exerciseI64Unary', 'exerciseI64Unary');
  module.addFunctionExport('exerciseI64Comparison', 'exerciseI64Comparison');
  module.addFunctionExport('exerciseI64Memory', 'exerciseI64Memory');
  module.addFunctionExport('exerciseI64Conversions', 'exerciseI64Conversions');
  module.addFunctionExport('exerciseI64EdgeCases', 'exerciseI64EdgeCases');
  module.addFunctionExport('exerciseI64TruncConvert', 'exerciseI64TruncConvert');

  common.finalizeAndOutput(module);

  // --- shared test data ---
  const staticData = {
    i32_values: [0, 1, -1, 42, 255, -128, 0x7fffffff, 0x80000000 | 0, 0x12345678, 0xdeadbeef | 0, -100, 65535],
    i32_pairs: [
      [42, 7],
      [0, 0],
      [-1, 1],
      [0x7fffffff, 0x7fffffff],
      [0x80000000 | 0, 1],
      [0x80000000 | 0, -1],
      [255, 256],
      [0x12345678, 0x9abcdef0 | 0],
      [-100, 100],
      [1, -1],
      [0x7fffffff, 0x80000000 | 0],
      [0xffffffff | 0, 0xffffffff | 0]
    ],
    conversion_cases: [
      [42, 3.5, 2.75],
      [0, 0.0, 0.0],
      [-1, -1.5, -1.5],
      [100, 50.25, 100.375],
      [255, 10.25, -50.75],
      [0x7fffffff, 1.125, 1.875],
      [-100, 99.9, -99.9]
    ]
  };
  const data = {};
  data.i32_values = staticData.i32_values.concat(Array.from({length: 10}, rand.i32));
  data.i32_pairs = staticData.i32_pairs.concat(Array.from({length: 8}, () => [rand.i32(), rand.i32()]));
  data.conversion_cases = staticData.conversion_cases.concat(
    Array.from({length: 10}, () => [rand.smallI32(), rand.f32(), rand.f64()])
  );
  data.trunc_convert_pairs = [
    [0.0, 0.0],
    [1.5, -1.5],
    [Math.fround(-1e10), 1e15],
    [Math.fround(4294967296.0), -9.223372036854776e18],
    [Math.fround(0.001953125), -0.00390625]
  ].concat(Array.from({length: 12}, () => [rand.wideF32(), rand.wideF64()]));
  common.emitSharedData(data);
})();
