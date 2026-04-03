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

  // -----------------------------------------------------------------
  // Import direct-cast functions from "cast" module.
  // Signed and unsigned i64 variants.
  // -----------------------------------------------------------------
  module.addFunctionImport('$cast_i64_to_f32', 'cast', 'i64_to_f32', binaryen.createType([binaryen.i64]), binaryen.f32);
  module.addFunctionImport('$cast_i64_to_f64', 'cast', 'i64_to_f64', binaryen.createType([binaryen.i64]), binaryen.f64);
  module.addFunctionImport('$cast_f32_to_i64', 'cast', 'f32_to_i64', binaryen.createType([binaryen.f32]), binaryen.i64);
  module.addFunctionImport('$cast_f64_to_i64', 'cast', 'f64_to_i64', binaryen.createType([binaryen.f64]), binaryen.i64);
  module.addFunctionImport('$cast_f32_to_u64', 'cast', 'f32_to_u64', binaryen.createType([binaryen.f32]), binaryen.i64);
  module.addFunctionImport('$cast_f64_to_u64', 'cast', 'f64_to_u64', binaryen.createType([binaryen.f64]), binaryen.i64);
  module.addFunctionImport('$cast_u64_to_f32', 'cast', 'u64_to_f32', binaryen.createType([binaryen.i64]), binaryen.f32);
  module.addFunctionImport('$cast_u64_to_f64', 'cast', 'u64_to_f64', binaryen.createType([binaryen.i64]), binaryen.f64);

  // =================================================================
  // exerciseI64Casts: signed casts between i64 and f32/f64.
  // Params: (a: i32, b: f32, c: f64)  — a is sign-extended to i64.
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.f32);
    const p2 = () => module.local.get(2, binaryen.f64);
    const a64 = () => module.i64.extend_s(p0());

    module.addFunction(
      'exerciseI64Casts',
      binaryen.createType([binaryen.i32, binaryen.f32, binaryen.f64]),
      binaryen.none,
      [],
      module.block(null, [
        // Basic casts — all 4 directions
        storeF32(module.call('$cast_i64_to_f32', [a64()], binaryen.f32)),
        storeF64Safe(module.call('$cast_i64_to_f64', [a64()], binaryen.f64)),
        storeI64(module.call('$cast_f32_to_i64', [p1()], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_i64', [p2()], binaryen.i64)),

        // Round-trip chains: i64→f32→i64, i64→f64→i64
        storeI64(module.call('$cast_f32_to_i64', [module.call('$cast_i64_to_f32', [a64()], binaryen.f32)], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_i64', [module.call('$cast_i64_to_f64', [a64()], binaryen.f64)], binaryen.i64)),

        // Round-trip chains: f32→i64→f32, f64→i64→f64
        storeF32(module.call('$cast_i64_to_f32', [module.call('$cast_f32_to_i64', [p1()], binaryen.i64)], binaryen.f32)),
        storeF64Safe(module.call('$cast_i64_to_f64', [module.call('$cast_f64_to_i64', [p2()], binaryen.i64)], binaryen.f64)),

        // Cross-type chains: f32→i64→f64, f64→i64→f32
        storeF64Safe(module.call('$cast_i64_to_f64', [module.call('$cast_f32_to_i64', [p1()], binaryen.i64)], binaryen.f64)),
        storeF32(module.call('$cast_i64_to_f32', [module.call('$cast_f64_to_i64', [p2()], binaryen.i64)], binaryen.f32)),

        // Wrap cast result to i32
        storeI32(module.i32.wrap(module.call('$cast_f64_to_i64', [p2()], binaryen.i64))),
        storeI32(module.i32.wrap(module.call('$cast_f32_to_i64', [p1()], binaryen.i64))),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseU64Casts: unsigned casts between i64 and f32/f64.
  // Params: (a: i32, b: f32, c: f64)  — a is sign-extended to i64.
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.f32);
    const p2 = () => module.local.get(2, binaryen.f64);
    const a64 = () => module.i64.extend_s(p0());

    module.addFunction(
      'exerciseU64Casts',
      binaryen.createType([binaryen.i32, binaryen.f32, binaryen.f64]),
      binaryen.none,
      [],
      module.block(null, [
        // Basic casts — all 4 directions
        storeF32(module.call('$cast_u64_to_f32', [a64()], binaryen.f32)),
        storeF64Safe(module.call('$cast_u64_to_f64', [a64()], binaryen.f64)),
        storeI64(module.call('$cast_f32_to_u64', [p1()], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_u64', [p2()], binaryen.i64)),

        // Round-trip chains: u64→f32→u64, u64→f64→u64
        storeI64(module.call('$cast_f32_to_u64', [module.call('$cast_u64_to_f32', [a64()], binaryen.f32)], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_u64', [module.call('$cast_u64_to_f64', [a64()], binaryen.f64)], binaryen.i64)),

        // Round-trip chains: f32→u64→f32, f64→u64→f64
        storeF32(module.call('$cast_u64_to_f32', [module.call('$cast_f32_to_u64', [p1()], binaryen.i64)], binaryen.f32)),
        storeF64Safe(module.call('$cast_u64_to_f64', [module.call('$cast_f64_to_u64', [p2()], binaryen.i64)], binaryen.f64)),

        // Cross-type chains: f32→u64→f64, f64→u64→f32
        storeF64Safe(module.call('$cast_u64_to_f64', [module.call('$cast_f32_to_u64', [p1()], binaryen.i64)], binaryen.f64)),
        storeF32(module.call('$cast_u64_to_f32', [module.call('$cast_f64_to_u64', [p2()], binaryen.i64)], binaryen.f32)),

        // Wrap cast result to i32
        storeI32(module.i32.wrap(module.call('$cast_f64_to_u64', [p2()], binaryen.i64))),
        storeI32(module.i32.wrap(module.call('$cast_f32_to_u64', [p1()], binaryen.i64))),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseI64CastEdgeCases: constant-driven edge cases for signed
  // and unsigned i64 casts.
  // =================================================================
  {
    module.addFunction(
      'exerciseI64CastEdgeCases',
      binaryen.none,
      binaryen.none,
      [],
      module.block(null, [
        // --- Signed i64 → f32 edge cases ---
        storeF32(module.call('$cast_i64_to_f32', [module.i64.const(i64c(0, 0))], binaryen.f32)),
        storeF32(module.call('$cast_i64_to_f32', [module.i64.const(i64c(1, 0))], binaryen.f32)),
        storeF32(module.call('$cast_i64_to_f32', [module.i64.const(i64c(-1, -1))], binaryen.f32)),
        storeF32(module.call('$cast_i64_to_f32', [module.i64.const(i64c(0, 1))], binaryen.f32)),

        // --- Signed i64 → f64 edge cases ---
        storeF64Safe(module.call('$cast_i64_to_f64', [module.i64.const(i64c(0, 0))], binaryen.f64)),
        storeF64Safe(module.call('$cast_i64_to_f64', [module.i64.const(i64c(1, 0))], binaryen.f64)),
        storeF64Safe(module.call('$cast_i64_to_f64', [module.i64.const(i64c(-1, -1))], binaryen.f64)),
        storeF64Safe(module.call('$cast_i64_to_f64', [module.i64.const(i64c(0x7fffffff, 0))], binaryen.f64)),

        // --- Signed f64 → i64 edge cases ---
        storeI64(module.call('$cast_f64_to_i64', [module.f64.const(0.0)], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_i64', [module.f64.const(0.5)], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_i64', [module.f64.const(-0.5)], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_i64', [module.f64.const(1e15)], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_i64', [module.f64.const(-1e15)], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_i64', [module.f64.const(4294967296.0)], binaryen.i64)),

        // --- Signed f32 → i64 edge cases ---
        storeI64(module.call('$cast_f32_to_i64', [module.f32.const(0.0)], binaryen.i64)),
        storeI64(module.call('$cast_f32_to_i64', [module.f32.const(42.5)], binaryen.i64)),
        storeI64(module.call('$cast_f32_to_i64', [module.f32.const(-42.5)], binaryen.i64)),
        storeI64(module.call('$cast_f32_to_i64', [module.f32.const(1e8)], binaryen.i64)),

        // --- Signed round-trip: i64→f64→i64 preserves for values within f64 precision ---
        storeI64(
          module.call(
            '$cast_f64_to_i64',
            [module.call('$cast_i64_to_f64', [module.i64.const(i64c(1000000, 0))], binaryen.f64)],
            binaryen.i64
          )
        ),
        storeI64(
          module.call(
            '$cast_f64_to_i64',
            [module.call('$cast_i64_to_f64', [module.i64.const(i64c(-1000000, -1))], binaryen.f64)],
            binaryen.i64
          )
        ),

        // --- Unsigned u64 → f32 edge cases ---
        storeF32(module.call('$cast_u64_to_f32', [module.i64.const(i64c(0, 0))], binaryen.f32)),
        storeF32(module.call('$cast_u64_to_f32', [module.i64.const(i64c(1, 0))], binaryen.f32)),
        storeF32(module.call('$cast_u64_to_f32', [module.i64.const(i64c(0, 1))], binaryen.f32)),
        storeF32(module.call('$cast_u64_to_f32', [module.i64.const(i64c(1000000, 0))], binaryen.f32)),

        // --- Unsigned u64 → f64 edge cases ---
        storeF64Safe(module.call('$cast_u64_to_f64', [module.i64.const(i64c(0, 0))], binaryen.f64)),
        storeF64Safe(module.call('$cast_u64_to_f64', [module.i64.const(i64c(1, 0))], binaryen.f64)),
        storeF64Safe(module.call('$cast_u64_to_f64', [module.i64.const(i64c(0, 1))], binaryen.f64)),
        storeF64Safe(module.call('$cast_u64_to_f64', [module.i64.const(i64c(0x7fffffff, 0))], binaryen.f64)),

        // --- Unsigned f64 → u64 edge cases ---
        storeI64(module.call('$cast_f64_to_u64', [module.f64.const(0.0)], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_u64', [module.f64.const(0.5)], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_u64', [module.f64.const(42.99)], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_u64', [module.f64.const(1e15)], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_u64', [module.f64.const(4294967296.0)], binaryen.i64)),
        storeI64(module.call('$cast_f64_to_u64', [module.f64.const(1e18)], binaryen.i64)),

        // --- Unsigned f32 → u64 edge cases ---
        storeI64(module.call('$cast_f32_to_u64', [module.f32.const(0.0)], binaryen.i64)),
        storeI64(module.call('$cast_f32_to_u64', [module.f32.const(42.5)], binaryen.i64)),
        storeI64(module.call('$cast_f32_to_u64', [module.f32.const(1e8)], binaryen.i64)),
        storeI64(module.call('$cast_f32_to_u64', [module.f32.const(1e15)], binaryen.i64)),

        // --- Unsigned round-trip: u64→f64→u64 preserves for values within f64 precision ---
        storeI64(
          module.call(
            '$cast_f64_to_u64',
            [module.call('$cast_u64_to_f64', [module.i64.const(i64c(1000000, 0))], binaryen.f64)],
            binaryen.i64
          )
        ),
        storeI64(
          module.call(
            '$cast_f64_to_u64',
            [module.call('$cast_u64_to_f64', [module.i64.const(i64c(0, 1))], binaryen.f64)],
            binaryen.i64
          )
        ),

        module.return()
      ])
    );
  }

  // --- exports ---
  module.addFunctionExport('exerciseI64Casts', 'exerciseI64Casts');
  module.addFunctionExport('exerciseU64Casts', 'exerciseU64Casts');
  module.addFunctionExport('exerciseI64CastEdgeCases', 'exerciseI64CastEdgeCases');

  common.finalizeAndOutput(module);

  // --- shared test data ---
  // Keep float→i64 values in safe range for cross-platform consistency.
  const staticData = {
    cast_triples: [
      [0, 0.0, 0.0],
      [1, 1.5, 1.5],
      [-1, -1.5, -1.5],
      [42, 42.75, 42.75],
      [100, -100.25, -100.25],
      [1000000, 1e6, 1e6],
      [-1000000, -1e6, -1e6],
      [0x7fffffff, 1e10, 1e10],
      [0x80000000 | 0, -1e10, -1e10],
      [0x7fffffff, 1e14, 1e14],
      [-1, 100.25, 1e8]
    ]
  };
  const data = {};
  data.cast_triples = staticData.cast_triples.concat(
    Array.from({length: 10}, () => {
      var i = ((Math.random() * 2e8) | 0) - 1e8;
      var f = Math.fround((Math.random() - 0.5) * 2e8);
      var d = (Math.random() - 0.5) * 2e14;
      return [i, f, d];
    })
  );
  common.emitSharedData(data);
})();
