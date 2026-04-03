'use strict';

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const rand = common.rand;
  const {module, heapTop, advanceHeap, storeI32} = common.createTestModule(binaryen, {
    memoryPages: 8,
    heapBase: 1024
  });

  module.setFeatures(binaryen.Features.MVP | binaryen.Features.SIMD128);

  /** Encode four i32 lanes as a 16-byte little-endian v128 constant. */
  function i32x4Bytes(a, b, c, d) {
    const buf = new ArrayBuffer(16);
    const view = new DataView(buf);
    view.setInt32(0, a, true);
    view.setInt32(4, b, true);
    view.setInt32(8, c, true);
    view.setInt32(12, d, true);
    return Array.from(new Uint8Array(buf));
  }

  // =================================================================
  // exerciseSIMDLanes: splat, replace_lane, extract_lane, v128.const.
  // Params: (a: i32, b: i32, c: i32, d: i32)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.i32);
    const p2 = () => module.local.get(2, binaryen.i32);
    const p3 = () => module.local.get(3, binaryen.i32);

    const buildVec = () =>
      module.i32x4.replace_lane(
        module.i32x4.replace_lane(module.i32x4.replace_lane(module.i32x4.splat(p0()), 1, p1()), 2, p2()),
        3,
        p3()
      );

    module.addFunction(
      'exerciseSIMDLanes',
      binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        // Extract all 4 lanes from constructed vector.
        storeI32(module.i32x4.extract_lane(buildVec(), 0)),
        storeI32(module.i32x4.extract_lane(buildVec(), 1)),
        storeI32(module.i32x4.extract_lane(buildVec(), 2)),
        storeI32(module.i32x4.extract_lane(buildVec(), 3)),

        // Splat lane 0, extract all (should all equal a).
        storeI32(module.i32x4.extract_lane(module.i32x4.splat(p0()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.splat(p0()), 3)),

        // v128.const + extract.
        storeI32(module.i32x4.extract_lane(module.v128.const(i32x4Bytes(10, 20, 30, 40)), 0)),
        storeI32(module.i32x4.extract_lane(module.v128.const(i32x4Bytes(10, 20, 30, 40)), 2)),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseSIMDArithmetic: add, sub, mul, neg, abs, min_s, max_s.
  // Params: (a: i32, b: i32)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.i32);
    const sA = () => module.i32x4.splat(p0());
    const sB = () => module.i32x4.splat(p1());

    module.addFunction(
      'exerciseSIMDArithmetic',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        storeI32(module.i32x4.extract_lane(module.i32x4.add(sA(), sB()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.sub(sA(), sB()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.mul(sA(), sB()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.neg(sA()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.abs(sA()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.min_s(sA(), sB()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.max_s(sA(), sB()), 0)),

        // Chained: (a + b) * (a - b) via SIMD.
        storeI32(module.i32x4.extract_lane(module.i32x4.mul(module.i32x4.add(sA(), sB()), module.i32x4.sub(sA(), sB())), 0)),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseSIMDBitwise: and, or, xor, not, andnot.
  // Params: (a: i32, b: i32)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.i32);
    const sA = () => module.i32x4.splat(p0());
    const sB = () => module.i32x4.splat(p1());

    module.addFunction(
      'exerciseSIMDBitwise',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        storeI32(module.i32x4.extract_lane(module.v128.and(sA(), sB()), 0)),
        storeI32(module.i32x4.extract_lane(module.v128.or(sA(), sB()), 0)),
        storeI32(module.i32x4.extract_lane(module.v128.xor(sA(), sB()), 0)),
        storeI32(module.i32x4.extract_lane(module.v128.not(sA()), 0)),
        storeI32(module.i32x4.extract_lane(module.v128.andnot(sA(), sB()), 0)),

        // Identity: (a ^ b) ^ b = a.
        storeI32(module.i32x4.extract_lane(module.v128.xor(module.v128.xor(sA(), sB()), sB()), 0)),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseSIMDShift: shl, shr_s, shr_u.
  // Params: (a: i32, shift: i32)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const shift = () => module.i32.and(module.local.get(1, binaryen.i32), module.i32.const(31));
    const sA = () => module.i32x4.splat(p0());

    module.addFunction(
      'exerciseSIMDShift',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        storeI32(module.i32x4.extract_lane(module.i32x4.shl(sA(), shift()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.shr_s(sA(), shift()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.shr_u(sA(), shift()), 0)),

        // Chain: (a << s) >> s  (signed — sign extension roundtrip).
        storeI32(module.i32x4.extract_lane(module.i32x4.shr_s(module.i32x4.shl(sA(), shift()), shift()), 0)),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseSIMDCompare: eq, ne, lt_s, gt_s, le_s, ge_s, scalar ops.
  // Params: (a: i32, b: i32)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.i32);
    const sA = () => module.i32x4.splat(p0());
    const sB = () => module.i32x4.splat(p1());

    module.addFunction(
      'exerciseSIMDCompare',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        // Comparisons return -1 (all bits set) or 0 per lane.
        storeI32(module.i32x4.extract_lane(module.i32x4.eq(sA(), sB()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.ne(sA(), sB()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.lt_s(sA(), sB()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.gt_s(sA(), sB()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.le_s(sA(), sB()), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.ge_s(sA(), sB()), 0)),

        // Scalar results: any_true, all_true, bitmask.
        storeI32(module.v128.any_true(sA())),
        storeI32(module.i32x4.all_true(sA())),
        storeI32(module.i32x4.bitmask(module.i32x4.lt_s(sA(), sB()))),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseSIMDShuffle: i8x16.shuffle, v128.bitselect.
  // Params: (a: i32, b: i32, c: i32, d: i32)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.i32);
    const p2 = () => module.local.get(2, binaryen.i32);
    const p3 = () => module.local.get(3, binaryen.i32);

    const vecAB = () => module.i32x4.replace_lane(module.i32x4.replace_lane(module.i32x4.splat(p0()), 1, p1()), 2, p2());
    const vecCD = () => module.i32x4.replace_lane(module.i32x4.splat(p2()), 1, p3());

    module.addFunction(
      'exerciseSIMDShuffle',
      binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        // Shuffle: reverse i32 lanes (each lane is 4 bytes).
        // Mask selects bytes: lane3 of left, lane2 of left, lane1 of left, lane0 of left.
        // Byte indices for reverse i32x4: [12,13,14,15, 8,9,10,11, 4,5,6,7, 0,1,2,3].
        storeI32(
          module.i32x4.extract_lane(
            module.i8x16.shuffle(vecAB(), vecCD(), [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3]),
            0
          )
        ),
        storeI32(
          module.i32x4.extract_lane(
            module.i8x16.shuffle(vecAB(), vecCD(), [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3]),
            3
          )
        ),

        // Shuffle: interleave from two vectors.
        // Take lane0 from left, lane0 from right, lane1 from left, lane1 from right.
        // Left lanes at byte offset 0..15, right lanes at offset 16..31.
        storeI32(
          module.i32x4.extract_lane(
            module.i8x16.shuffle(vecAB(), vecCD(), [0, 1, 2, 3, 16, 17, 18, 19, 4, 5, 6, 7, 20, 21, 22, 23]),
            0
          )
        ),
        storeI32(
          module.i32x4.extract_lane(
            module.i8x16.shuffle(vecAB(), vecCD(), [0, 1, 2, 3, 16, 17, 18, 19, 4, 5, 6, 7, 20, 21, 22, 23]),
            1
          )
        ),

        // Bitselect: select a where mask=-1, b where mask=0.
        // mask = splat(-1) → selects all from a.
        storeI32(
          module.i32x4.extract_lane(
            module.v128.bitselect(module.i32x4.splat(p0()), module.i32x4.splat(p1()), module.i32x4.splat(module.i32.const(-1))),
            0
          )
        ),
        // mask = splat(0) → selects all from b.
        storeI32(
          module.i32x4.extract_lane(
            module.v128.bitselect(module.i32x4.splat(p0()), module.i32x4.splat(p1()), module.i32x4.splat(module.i32.const(0))),
            0
          )
        ),
        // mask = splat(0xFFFF0000) → upper 16 bits from a, lower 16 from b.
        storeI32(
          module.i32x4.extract_lane(
            module.v128.bitselect(
              module.i32x4.splat(p0()),
              module.i32x4.splat(p1()),
              module.i32x4.splat(module.i32.const(0xffff0000 | 0))
            ),
            0
          )
        ),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseSIMDMemory: v128 store + load roundtrip.
  // Params: (a: i32, b: i32, c: i32, d: i32)
  // =================================================================
  {
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.i32);
    const p2 = () => module.local.get(2, binaryen.i32);
    const p3 = () => module.local.get(3, binaryen.i32);
    const scratch = () => module.local.get(4, binaryen.i32);

    const buildVec = () =>
      module.i32x4.replace_lane(
        module.i32x4.replace_lane(module.i32x4.replace_lane(module.i32x4.splat(p0()), 1, p1()), 2, p2()),
        3,
        p3()
      );

    module.addFunction(
      'exerciseSIMDMemory',
      binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32]),
      binaryen.none,
      [binaryen.i32],
      module.block(null, [
        // Allocate scratch space.
        module.local.set(4, heapTop()),
        advanceHeap(32),

        // Store vector to scratch.
        module.v128.store(0, 4, scratch(), buildVec()),

        // Load back and extract all lanes.
        storeI32(module.i32x4.extract_lane(module.v128.load(0, 4, scratch()), 0)),
        storeI32(module.i32x4.extract_lane(module.v128.load(0, 4, scratch()), 1)),
        storeI32(module.i32x4.extract_lane(module.v128.load(0, 4, scratch()), 2)),
        storeI32(module.i32x4.extract_lane(module.v128.load(0, 4, scratch()), 3)),

        // Store, add, store again — verify load + arithmetic + store roundtrip.
        module.v128.store(
          0,
          4,
          scratch(),
          module.i32x4.add(module.v128.load(0, 4, scratch()), module.i32x4.splat(module.i32.const(1)))
        ),
        storeI32(module.i32x4.extract_lane(module.v128.load(0, 4, scratch()), 0)),
        storeI32(module.i32x4.extract_lane(module.v128.load(0, 4, scratch()), 3)),

        module.return()
      ])
    );
  }

  // =================================================================
  // exerciseSIMDEdgeCases: constant-driven edge cases.
  // =================================================================
  {
    module.addFunction(
      'exerciseSIMDEdgeCases',
      binaryen.none,
      binaryen.none,
      [],
      module.block(null, [
        // --- zero vector ---
        storeI32(module.i32x4.extract_lane(module.v128.const(i32x4Bytes(0, 0, 0, 0)), 0)),
        storeI32(module.v128.any_true(module.v128.const(i32x4Bytes(0, 0, 0, 0)))),
        storeI32(module.i32x4.all_true(module.v128.const(i32x4Bytes(0, 0, 0, 0)))),

        // --- all-ones vector ---
        storeI32(module.i32x4.extract_lane(module.v128.const(i32x4Bytes(-1, -1, -1, -1)), 0)),
        storeI32(module.v128.any_true(module.v128.const(i32x4Bytes(-1, -1, -1, -1)))),
        storeI32(module.i32x4.all_true(module.v128.const(i32x4Bytes(-1, -1, -1, -1)))),

        // --- not(zero) = all-ones ---
        storeI32(module.i32x4.extract_lane(module.v128.not(module.v128.const(i32x4Bytes(0, 0, 0, 0))), 0)),

        // --- add overflow: MAX + 1 per lane ---
        storeI32(
          module.i32x4.extract_lane(
            module.i32x4.add(
              module.v128.const(i32x4Bytes(0x7fffffff, 0x7fffffff, 0x7fffffff, 0x7fffffff)),
              module.v128.const(i32x4Bytes(1, 1, 1, 1))
            ),
            0
          )
        ),

        // --- mul: 0 * anything = 0 ---
        storeI32(
          module.i32x4.extract_lane(
            module.i32x4.mul(module.v128.const(i32x4Bytes(0, 0, 0, 0)), module.v128.const(i32x4Bytes(42, 100, -1, 0x7fffffff))),
            0
          )
        ),
        storeI32(
          module.i32x4.extract_lane(
            module.i32x4.mul(module.v128.const(i32x4Bytes(0, 0, 0, 0)), module.v128.const(i32x4Bytes(42, 100, -1, 0x7fffffff))),
            2
          )
        ),

        // --- neg(0) = 0, neg(1) = -1, neg(MIN) = MIN ---
        storeI32(module.i32x4.extract_lane(module.i32x4.neg(module.v128.const(i32x4Bytes(0, 1, -1, 0x80000000 | 0))), 0)),
        storeI32(module.i32x4.extract_lane(module.i32x4.neg(module.v128.const(i32x4Bytes(0, 1, -1, 0x80000000 | 0))), 1)),
        storeI32(module.i32x4.extract_lane(module.i32x4.neg(module.v128.const(i32x4Bytes(0, 1, -1, 0x80000000 | 0))), 2)),
        storeI32(module.i32x4.extract_lane(module.i32x4.neg(module.v128.const(i32x4Bytes(0, 1, -1, 0x80000000 | 0))), 3)),

        // --- shift edge: shl by 0 = identity ---
        storeI32(
          module.i32x4.extract_lane(module.i32x4.shl(module.v128.const(i32x4Bytes(42, 0, 0, 0)), module.i32.const(0)), 0)
        ),

        // --- shift edge: shl by 31 ---
        storeI32(
          module.i32x4.extract_lane(module.i32x4.shl(module.v128.const(i32x4Bytes(1, 0, 0, 0)), module.i32.const(31)), 0)
        ),

        // --- comparison: equal values ---
        storeI32(
          module.i32x4.extract_lane(
            module.i32x4.eq(module.i32x4.splat(module.i32.const(42)), module.i32x4.splat(module.i32.const(42))),
            0
          )
        ),

        // --- bitmask: all negative ---
        storeI32(module.i32x4.bitmask(module.v128.const(i32x4Bytes(-1, -2, -3, -4)))),

        // --- bitmask: mixed ---
        storeI32(module.i32x4.bitmask(module.v128.const(i32x4Bytes(1, -1, 2, -2)))),

        // --- min/max edge ---
        storeI32(
          module.i32x4.extract_lane(
            module.i32x4.min_s(
              module.v128.const(i32x4Bytes(0x7fffffff, 0, 0, 0)),
              module.v128.const(i32x4Bytes(0x80000000 | 0, 0, 0, 0))
            ),
            0
          )
        ),
        storeI32(
          module.i32x4.extract_lane(
            module.i32x4.max_s(
              module.v128.const(i32x4Bytes(0x7fffffff, 0, 0, 0)),
              module.v128.const(i32x4Bytes(0x80000000 | 0, 0, 0, 0))
            ),
            0
          )
        ),

        module.return()
      ])
    );
  }

  // --- exports ---
  module.addFunctionExport('exerciseSIMDLanes', 'exerciseSIMDLanes');
  module.addFunctionExport('exerciseSIMDArithmetic', 'exerciseSIMDArithmetic');
  module.addFunctionExport('exerciseSIMDBitwise', 'exerciseSIMDBitwise');
  module.addFunctionExport('exerciseSIMDShift', 'exerciseSIMDShift');
  module.addFunctionExport('exerciseSIMDCompare', 'exerciseSIMDCompare');
  module.addFunctionExport('exerciseSIMDShuffle', 'exerciseSIMDShuffle');
  module.addFunctionExport('exerciseSIMDMemory', 'exerciseSIMDMemory');
  module.addFunctionExport('exerciseSIMDEdgeCases', 'exerciseSIMDEdgeCases');

  common.finalizeAndOutput(module);

  // --- shared test data ---
  const staticData = {
    quads: [
      [1, 2, 3, 4],
      [0, 0, 0, 0],
      [-1, -2, -3, -4],
      [0x7fffffff, 0x80000000 | 0, 0, -1],
      [42, 100, 255, 1000],
      [0xff00ff00 | 0, 0x00ff00ff, 0xaaaaaaaa | 0, 0x55555555]
    ],
    pairs: [
      [42, 7],
      [0, 0],
      [-1, 1],
      [0x7fffffff, 0x7fffffff],
      [0x80000000 | 0, 1],
      [255, 256],
      [0x12345678, 0x9abcdef0 | 0],
      [-100, 100],
      [1, -1],
      [0xffffffff | 0, 0]
    ],
    shift_pairs: [
      [42, 0],
      [42, 1],
      [-1, 1],
      [0x80000000 | 0, 31],
      [0x7fffffff, 16],
      [1, 31],
      [0xff00ff00 | 0, 8],
      [-100, 4]
    ]
  };
  const data = {};
  data.quads = staticData.quads.concat(Array.from({length: 8}, () => [rand.i32(), rand.i32(), rand.i32(), rand.i32()]));
  data.pairs = staticData.pairs.concat(Array.from({length: 8}, () => [rand.i32(), rand.i32()]));
  data.shift_pairs = staticData.shift_pairs.concat(Array.from({length: 6}, () => [rand.i32(), (Math.random() * 32) | 0]));
  common.emitSharedData(data);
})();
