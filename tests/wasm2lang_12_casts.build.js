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
  // Signed and unsigned i32 variants.
  // -----------------------------------------------------------------
  module.addFunctionImport('$cast_i32_to_f32', 'cast', 'i32_to_f32', binaryen.createType([binaryen.i32]), binaryen.f32);
  module.addFunctionImport('$cast_i32_to_f64', 'cast', 'i32_to_f64', binaryen.createType([binaryen.i32]), binaryen.f64);
  module.addFunctionImport('$cast_f32_to_i32', 'cast', 'f32_to_i32', binaryen.createType([binaryen.f32]), binaryen.i32);
  module.addFunctionImport('$cast_f64_to_i32', 'cast', 'f64_to_i32', binaryen.createType([binaryen.f64]), binaryen.i32);
  module.addFunctionImport('$cast_f32_to_u32', 'cast', 'f32_to_u32', binaryen.createType([binaryen.f32]), binaryen.i32);
  module.addFunctionImport('$cast_f64_to_u32', 'cast', 'f64_to_u32', binaryen.createType([binaryen.f64]), binaryen.i32);
  module.addFunctionImport('$cast_u32_to_f32', 'cast', 'u32_to_f32', binaryen.createType([binaryen.i32]), binaryen.f32);
  module.addFunctionImport('$cast_u32_to_f64', 'cast', 'u32_to_f64', binaryen.createType([binaryen.i32]), binaryen.f64);

  // =================================================================
  // exerciseI32Casts: signed casts between i32 and f32/f64.
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
  // exerciseU32Casts: unsigned casts between i32 and f32/f64.
  // Params: (a: i32, b: f32, c: f64)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.f32);
    const p2 = () => module.local.get(2, binaryen.f64);

    module.addFunction(
      'exerciseU32Casts',
      binaryen.createType([binaryen.i32, binaryen.f32, binaryen.f64]),
      binaryen.none,
      [],
      module.block(null, [
        // Basic casts — all 4 directions
        storeF32(module.call('$cast_u32_to_f32', [p0()], binaryen.f32)),
        storeF64Safe(module.call('$cast_u32_to_f64', [p0()], binaryen.f64)),
        storeI32(module.call('$cast_f32_to_u32', [p1()], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_u32', [p2()], binaryen.i32)),

        // Round-trip chains: u32→f32→u32, u32→f64→u32
        storeI32(module.call('$cast_f32_to_u32', [module.call('$cast_u32_to_f32', [p0()], binaryen.f32)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_u32', [module.call('$cast_u32_to_f64', [p0()], binaryen.f64)], binaryen.i32)),

        // Round-trip chains: f32→u32→f32, f64→u32→f64
        storeF32(module.call('$cast_u32_to_f32', [module.call('$cast_f32_to_u32', [p1()], binaryen.i32)], binaryen.f32)),
        storeF64Safe(module.call('$cast_u32_to_f64', [module.call('$cast_f64_to_u32', [p2()], binaryen.i32)], binaryen.f64)),

        // Cross-type chains: f32→u32→f64, f64→u32→f32
        storeF64Safe(module.call('$cast_u32_to_f64', [module.call('$cast_f32_to_u32', [p1()], binaryen.i32)], binaryen.f64)),
        storeF32(module.call('$cast_u32_to_f32', [module.call('$cast_f64_to_u32', [p2()], binaryen.i32)], binaryen.f32)),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseCastEdgeCases: constant-driven edge cases for signed and
  // unsigned i32 casts.
  // =================================================================
  {
    module.addFunction(
      'exerciseCastEdgeCases',
      binaryen.none,
      binaryen.none,
      [],
      module.block(null, [
        // --- Signed i32 → f32 edge cases ---
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(0)], binaryen.f32)),
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(1)], binaryen.f32)),
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(-1)], binaryen.f32)),
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(2147483647)], binaryen.f32)),
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(-2147483648)], binaryen.f32)),
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(16777216)], binaryen.f32)),
        storeF32(module.call('$cast_i32_to_f32', [module.i32.const(16777217)], binaryen.f32)),

        // --- Signed i32 → f64 edge cases ---
        storeF64Safe(module.call('$cast_i32_to_f64', [module.i32.const(0)], binaryen.f64)),
        storeF64Safe(module.call('$cast_i32_to_f64', [module.i32.const(2147483647)], binaryen.f64)),
        storeF64Safe(module.call('$cast_i32_to_f64', [module.i32.const(-2147483648)], binaryen.f64)),

        // --- Signed f64 → i32 edge cases ---
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(0.0)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(0.5)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(-0.5)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(42.99)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(-42.99)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(1e8)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_i32', [module.f64.const(-1e8)], binaryen.i32)),

        // --- Signed f32 → i32 edge cases ---
        storeI32(module.call('$cast_f32_to_i32', [module.f32.const(0.0)], binaryen.i32)),
        storeI32(module.call('$cast_f32_to_i32', [module.f32.const(42.5)], binaryen.i32)),
        storeI32(module.call('$cast_f32_to_i32', [module.f32.const(-42.5)], binaryen.i32)),
        storeI32(module.call('$cast_f32_to_i32', [module.f32.const(1e8)], binaryen.i32)),

        // --- Signed round-trip: i32→f64→i32 preserves exactly for all i32 ---
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

        // --- Unsigned u32 → f32 edge cases (unsigned interpretation of bit pattern) ---
        storeF32(module.call('$cast_u32_to_f32', [module.i32.const(0)], binaryen.f32)),
        storeF32(module.call('$cast_u32_to_f32', [module.i32.const(1)], binaryen.f32)),
        storeF32(module.call('$cast_u32_to_f32', [module.i32.const(-1)], binaryen.f32)),
        storeF32(module.call('$cast_u32_to_f32', [module.i32.const(0x7fffffff)], binaryen.f32)),
        storeF32(module.call('$cast_u32_to_f32', [module.i32.const(0x80000000 | 0)], binaryen.f32)),
        storeF32(module.call('$cast_u32_to_f32', [module.i32.const(0xfffffffe | 0)], binaryen.f32)),
        storeF32(module.call('$cast_u32_to_f32', [module.i32.const(1000000)], binaryen.f32)),

        // --- Unsigned u32 → f64 edge cases ---
        storeF64Safe(module.call('$cast_u32_to_f64', [module.i32.const(0)], binaryen.f64)),
        storeF64Safe(module.call('$cast_u32_to_f64', [module.i32.const(-1)], binaryen.f64)),
        storeF64Safe(module.call('$cast_u32_to_f64', [module.i32.const(0x80000000 | 0)], binaryen.f64)),
        storeF64Safe(module.call('$cast_u32_to_f64', [module.i32.const(0x7fffffff)], binaryen.f64)),

        // --- Unsigned f64 → u32 edge cases (values in unsigned i32 range) ---
        storeI32(module.call('$cast_f64_to_u32', [module.f64.const(0.0)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_u32', [module.f64.const(0.5)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_u32', [module.f64.const(42.99)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_u32', [module.f64.const(255.0)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_u32', [module.f64.const(1e8)], binaryen.i32)),
        storeI32(module.call('$cast_f64_to_u32', [module.f64.const(3e9)], binaryen.i32)),

        // --- Unsigned f32 → u32 edge cases ---
        storeI32(module.call('$cast_f32_to_u32', [module.f32.const(0.0)], binaryen.i32)),
        storeI32(module.call('$cast_f32_to_u32', [module.f32.const(42.5)], binaryen.i32)),
        storeI32(module.call('$cast_f32_to_u32', [module.f32.const(1e8)], binaryen.i32)),
        storeI32(module.call('$cast_f32_to_u32', [module.f32.const(3e9)], binaryen.i32)),

        // --- Unsigned round-trip: u32→f64→u32 preserves for all u32 ---
        storeI32(
          module.call('$cast_f64_to_u32', [module.call('$cast_u32_to_f64', [module.i32.const(-1)], binaryen.f64)], binaryen.i32)
        ),
        storeI32(
          module.call(
            '$cast_f64_to_u32',
            [module.call('$cast_u32_to_f64', [module.i32.const(0x80000000 | 0)], binaryen.f64)],
            binaryen.i32
          )
        ),

        module.return()
      ])
    );
  }

  // --- exports ---
  module.addFunctionExport('exerciseI32Casts', 'exerciseI32Casts');
  module.addFunctionExport('exerciseU32Casts', 'exerciseU32Casts');
  module.addFunctionExport('exerciseCastEdgeCases', 'exerciseCastEdgeCases');

  common.finalizeAndOutput(module);

  // --- shared test data ---
  // i32 values include both signed and unsigned ranges; floats stay in safe range.
  const staticData = {
    cast_triples: [
      [0, 0.0, 0.0],
      [1, 1.5, 1.5],
      [-1, 100.25, 100.25],
      [42, 42.75, 42.75],
      [255, 255.0, 255.0],
      [-128, 128.5, 128.5],
      [1000000, 1e6, 1e6],
      [-1000000, 5e5, 5e5],
      [16777216, 1.6777216e7, 1.6777216e7],
      [0x80000000 | 0, 2.5e9, 2.5e9],
      [0x7fffffff, 3e9, 3e9],
      [0xfffffffe | 0, 1e8, 1e8]
    ]
  };
  const data = {};
  // Float columns are non-negative so they work for both signed (f*_to_i32)
  // and unsigned (f*_to_u32) truncation.  Negative edge cases are covered
  // by exerciseCastEdgeCases.
  data.cast_triples = staticData.cast_triples.concat(
    Array.from({length: 12}, () => {
      var i = ((Math.random() * 2e8) | 0) - 1e8;
      var f = Math.fround(Math.random() * 2e8);
      var d = Math.random() * 2e8;
      return [i, f, d];
    })
  );
  common.emitSharedData(data);
})();
