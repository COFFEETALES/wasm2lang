'use strict';

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const rand = common.rand;
  const {module, heapTop, advanceHeap, storeI32, storeF32, storeF64, storeF64Safe} = common.createTestModule(binaryen, {
    memoryPages: 8,
    heapBase: 1024
  });

  const p0 = () => module.local.get(0, binaryen.i32);
  const p1 = () => module.local.get(1, binaryen.f32);
  const p2 = () => module.local.get(2, binaryen.f64);

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
            module.i32.add(module.i32.mul(module.i32.add(p0(), module.i32.const(1)), module.i32.const(2)), module.i32.const(3)),
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
      storeF64Safe(module.f64.sqrt(module.f64.convert_s.i32(module.i32.add(module.i32.mul(p0(), p0()), module.i32.const(1))))),
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

      // --- unsigned trunc ---
      // trunc_u(f32.abs(b))
      storeI32(module.i32.trunc_u.f32(module.f32.abs(p1()))),
      // trunc_u(f64.abs(c))
      storeI32(module.i32.trunc_u.f64(module.f64.abs(p2()))),
      // trunc_u(f32.mul(f32.abs(b), 10.0))
      storeI32(module.i32.trunc_u.f32(module.f32.mul(module.f32.abs(p1()), module.f32.const(10.0)))),
      // trunc_u(f64.mul(f64.abs(c), 10.0))
      storeI32(module.i32.trunc_u.f64(module.f64.mul(module.f64.abs(p2()), module.f64.const(10.0)))),

      // --- saturating trunc (all variants) ---
      // trunc_u_sat(f32.abs(b) * 1000.0)
      storeI32(module.i32.trunc_u_sat.f32(module.f32.mul(module.f32.abs(p1()), module.f32.const(1000.0)))),
      // trunc_s_sat(f32.mul(b, 100.0))
      storeI32(module.i32.trunc_s_sat.f32(module.f32.mul(p1(), module.f32.const(100.0)))),
      // trunc_s_sat(f64.mul(c, 100.0))
      storeI32(module.i32.trunc_s_sat.f64(module.f64.mul(p2(), module.f64.const(100.0)))),
      // trunc_u_sat(f64.abs(c) * 1000.0)
      storeI32(module.i32.trunc_u_sat.f64(module.f64.mul(module.f64.abs(p2()), module.f64.const(1000.0)))),
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
      storeF64Safe(module.f64.mul(module.f64.min(p2(), module.f64.const(10.0)), module.f64.max(p2(), module.f64.const(-10.0)))),

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
      storeI32(module.i32.add(module.i32.add(module.i32.const(0x7fffffff), module.i32.const(1)), module.i32.const(0x7fffffff))),
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

  module.addFunctionExport('exerciseNestedArithmetic', 'exerciseNestedArithmetic');
  module.addFunctionExport('exerciseMemoryArithmetic', 'exerciseMemoryArithmetic');
  module.addFunctionExport('exerciseMixedTypeChains', 'exerciseMixedTypeChains');
  module.addFunctionExport('exerciseEdgeArithmetic', 'exerciseEdgeArithmetic');

  common.finalizeAndOutput(module);

  // Shared data
  const staticData = {
    i32_values: [42, 0, -1, 2147483647, 1, 255, -100, -2147483648, 65535],
    i32_pairs: [
      [42, 7],
      [0, 0],
      [-1, 1],
      [305419896, -100],
      [255, 256],
      [-2147483648, 2147483647]
    ],
    mixed_type_cases: [
      [42, 3.5, 2.75],
      [0, 0.0, 0.0],
      [-1, -1.5, -1.5],
      [100, 0.125, 100.375],
      [255, 10.25, -50.75]
    ]
  };
  const data = {};
  data.i32_values = staticData.i32_values.concat(Array.from({length: 7}, rand.i32));
  data.i32_pairs = staticData.i32_pairs.concat(Array.from({length: 6}, () => [rand.i32(), rand.i32()]));
  data.mixed_type_cases = staticData.mixed_type_cases.concat(
    Array.from({length: 10}, () => [rand.smallI32(), rand.f32(), rand.f64()])
  );
  common.emitSharedData(data);
})();
