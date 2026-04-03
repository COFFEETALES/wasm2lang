'use strict';

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const rand = common.rand;
  const {module, heapTop, advanceHeap, storeI32, storeF32, storeF64Safe} = common.createTestModule(binaryen, {
    memoryPages: 8,
    heapBase: 1024
  });

  // -----------------------------------------------------------------
  // Import direct-cast functions from "cast" module.
  // These are simple language-level casts (no trunc/sat overhead).
  // -----------------------------------------------------------------
  module.addFunctionImport('$cast_i32_to_f32', 'cast', 'i32_to_f32', binaryen.createType([binaryen.i32]), binaryen.f32);
  module.addFunctionImport('$cast_i32_to_f64', 'cast', 'i32_to_f64', binaryen.createType([binaryen.i32]), binaryen.f64);
  module.addFunctionImport('$cast_f32_to_i32', 'cast', 'f32_to_i32', binaryen.createType([binaryen.f32]), binaryen.i32);
  module.addFunctionImport('$cast_f64_to_i32', 'cast', 'f64_to_i32', binaryen.createType([binaryen.f64]), binaryen.i32);

  // =================================================================
  // exerciseI32Casts: direct casts between i32 and f32/f64 using
  // imported cast functions.
  // Params: (a: i32, b: f32, c: f64)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.f32);
    const p2 = () => module.local.get(2, binaryen.f64);

    module.addFunction(
      'exerciseI32Casts',
      binaryen.createType([binaryen.i32, binaryen.f32, binaryen.f64]),
      binaryen.none,
      [],
      module.block(null, [
        // Basic casts — all 4 directions
        storeF32(module.call('$cast_i32_to_f32', [p0()], binaryen.f32)),
        storeF64Safe(module.call('$cast_i32_to_f64', [p0()], binaryen.f64)),
        storeI32(module.call('$cast_f32_to_i32', [p1()], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [p2()], binaryen.i32)),

        // Round-trip chains: i32→f32→i32, i32→f64→i32
        storeI32(module.call('$cast_f32_to_i32', [module.call('$cast_i32_to_f32', [p0()], binaryen.f32)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [module.call('$cast_i32_to_f64', [p0()], binaryen.f64)], binaryen.i32)),

        // Round-trip chains: f32→i32→f32, f64→i32→f64
        storeF32(module.call('$cast_i32_to_f32', [module.call('$cast_f32_to_i32', [p1()], binaryen.i32)], binaryen.f32)),
        storeF64Safe(module.call('$cast_i32_to_f64', [module.call('$cast_f64_to_i32', [p2()], binaryen.i32)], binaryen.f64)),

        // Cross-type chains: f32→i32→f64, f64→i32→f32
        storeF64Safe(module.call('$cast_i32_to_f64', [module.call('$cast_f32_to_i32', [p1()], binaryen.i32)], binaryen.f64)),
        storeF32(module.call('$cast_i32_to_f32', [module.call('$cast_f64_to_i32', [p2()], binaryen.i32)], binaryen.f32)),

        // Arithmetic + cast: cast(a_as_f64 + c) → i32, cast(f32_to_i32(b) + a) → f32
        storeI32(
          module.call(
            '$cast_f64_to_i32',
            [module.f64.add(module.call('$cast_i32_to_f64', [p0()], binaryen.f64), p2())],
            binaryen.i32
          )
        ),
        storeF32(
          module.call(
            '$cast_i32_to_f32',
            [module.i32.add(module.call('$cast_f32_to_i32', [p1()], binaryen.i32), p0())],
            binaryen.f32
          )
        ),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseCastEdgeCases: constant-driven edge cases for i32 casts.
  // =================================================================
  {
    module.addFunction(
      'exerciseCastEdgeCases',
      binaryen.none,
      binaryen.none,
      [],
      module.block(null, [
        // i32 → f32 edge cases
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(0)], binaryen.f32)),
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(1)], binaryen.f32)),
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(-1)], binaryen.f32)),
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(2147483647)], binaryen.f32)),
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(-2147483648)], binaryen.f32)),
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(16777216)], binaryen.f32)),
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(16777217)], binaryen.f32)),

        // i32 → f64 edge cases
        storeF64Safe(module.call('$cast_i32_to_f64', [module.i32.const(0)], binaryen.f64)),
        storeF64Safe(module.call('$cast_i32_to_f64', [module.i32.const(2147483647)], binaryen.f64)),
        storeF64Safe(module.call('$cast_i32_to_f64', [module.i32.const(-2147483648)], binaryen.f64)),

        // f64 → i32 edge cases
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(0.0)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(0.5)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(-0.5)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(42.99)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(-42.99)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(1e8)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(-1e8)], binaryen.i32)),

        // f32 → i32 edge cases
        storeI32(module.call('$cast_f32_to_i32', [module.f32.const(0.0)], binaryen.i32)),
        storeI32(module.call('$cast_f32_to_i32', [module.f32.const(42.5)], binaryen.i32)),
        storeI32(module.call('$cast_f32_to_i32', [module.f32.const(-42.5)], binaryen.i32)),
        storeI32(module.call('$cast_f32_to_i32', [module.f32.const(1e8)], binaryen.i32)),

        // Round-trip: i32→f64→i32 preserves exactly for all i32
        storeI32(
          module.call(
            '$cast_f64_to_i32',
            [module.call('$cast_i32_to_f64', [module.i32.const(2147483647)], binaryen.f64)],
            binaryen.i32
          )
        ),
        storeI32(
          module.call(
            '$cast_f64_to_i32',
            [module.call('$cast_i32_to_f64', [module.i32.const(-2147483648)], binaryen.f64)],
            binaryen.i32
          )
        ),

        module.return()
      ])
    );
  }

  // --- exports ---
  module.addFunctionExport('exerciseI32Casts', 'exerciseI32Casts');
  module.addFunctionExport('exerciseCastEdgeCases', 'exerciseCastEdgeCases');

  common.finalizeAndOutput(module);

  // --- shared test data ---
  // Keep float→int values in safe i32 range for cross-platform consistency.
  const staticData = {
    cast_triples: [
      [0, 0.0, 0.0],
      [1, 1.5, 1.5],
      [-1, -1.5, -1.5],
      [42, 42.75, 42.75],
      [100, -100.25, -100.25],
      [255, 255.0, 255.0],
      [-128, -128.5, -128.5],
      [1000000, 1e6, 1e6],
      [-1000000, -1e6, -1e6],
      [16777216, 1.6777216e7, 1.6777216e7]
    ]
  };
  const data = {};
  // i32 values kept in safe range; f32/f64 values kept within i32 range
  data.cast_triples = staticData.cast_triples.concat(
    Array.from({length: 12}, () => {
      var i = ((Math.random() * 2e8) | 0) - 1e8;
      var f = Math.fround((Math.random() - 0.5) * 2e8);
      var d = (Math.random() - 0.5) * 2e8;
      return [i, f, d];
    })
  );
  common.emitSharedData(data);
})();
