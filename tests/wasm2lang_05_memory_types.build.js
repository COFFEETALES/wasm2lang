'use strict';

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const {module, heapTop, advanceHeap, storeI32, storeF32, storeF64, storeF64Safe} = common.createTestModule(binaryen, {});

  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.f32);
    const p2 = () => module.local.get(2, binaryen.f64);

    // =================================================================
    // exerciseMixedWidthLoads: mixed-width and mixed-signedness memory
    // loads: per-byte signed/unsigned, halfword, cross-width arithmetic,
    // sign-extension divergence, 4-load nested expressions, byte-level
    // reconstruction, sub-width loads of xored value, and mixed param
    // arithmetic with loaded sub-words.
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

  module.addFunctionExport('exerciseMixedWidthLoads', 'exerciseMixedWidthLoads');
  module.addFunctionExport('exerciseLoadToFloat', 'exerciseLoadToFloat');
  module.addFunctionExport('exerciseCrossTypePipeline', 'exerciseCrossTypePipeline');
  module.addFunctionExport('exerciseSubWordStoreReload', 'exerciseSubWordStoreReload');
  module.addFunctionExport('exercisePrecisionAndReinterpret', 'exercisePrecisionAndReinterpret');

  common.finalizeAndOutput(module);

  // Shared data
  {
    const staticData = {
      subword_cases: [
        [42, 7],
        [0, 0],
        [-1, 1],
        [305419896, -100],
        [255, 128],
        [-128, -1]
      ],
      mixed_type_cases: [
        [42, 3.5, 2.75],
        [0, 0.0, 0.0],
        [-1, -1.5, -1.5],
        [100, 0.125, 100.0],
        [255, 10.0, -50.0]
      ]
    };
    const data = {};
    data.subword_cases = staticData.subword_cases.concat(
      Array.from({length: 6}, () => [common.rand.smallI32(), common.rand.smallI32()])
    );
    data.mixed_type_cases = staticData.mixed_type_cases.concat(
      Array.from({length: 6}, () => [common.rand.smallI32(), common.rand.f32(), common.rand.f64()])
    );
    common.emitSharedData(data);
  }
})();
