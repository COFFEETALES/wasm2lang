'use strict';

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const {module, heapTop, advanceHeap, storeI32} = common.createTestModule(binaryen, {
    memoryPages: 8,
    heapBase: 1024
  });

  // ---------- Type signatures for call_indirect ----------
  var sig_ii_i = binaryen.createType([binaryen.i32, binaryen.i32]);
  var sig_i_i = binaryen.createType([binaryen.i32]);
  var sig_dd_i = binaryen.createType([binaryen.f64, binaryen.f64]);
  var sig_iii_i = binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]);

  // Helpers for readability.
  var L = function (i) {
    return module.local.get(i, binaryen.i32);
  };
  var Ld = function (i) {
    return module.local.get(i, binaryen.f64);
  };
  var C = function (v) {
    return module.i32.const(v);
  };
  var ci = function (indexExpr, args, sigType) {
    return module.call_indirect('functionTable', indexExpr, args, sigType, binaryen.i32);
  };

  // ======================================================================
  // Table functions: (i32, i32) -> i32
  // ======================================================================

  // Index 0, 13: add
  module.addFunction('addI32', sig_ii_i, binaryen.i32, [], module.i32.add(L(0), L(1)));

  // Index 1, 14: sub
  module.addFunction('subI32', sig_ii_i, binaryen.i32, [], module.i32.sub(L(0), L(1)));

  // Index 3: mul
  module.addFunction('mulI32', sig_ii_i, binaryen.i32, [], module.i32.mul(L(0), L(1)));

  // Index 4: xor
  module.addFunction('xorI32', sig_ii_i, binaryen.i32, [], module.i32.xor(L(0), L(1)));

  // Index 7: shl (shift amount masked to 0-31 by wasm spec)
  module.addFunction('shlI32', sig_ii_i, binaryen.i32, [], module.i32.shl(L(0), L(1)));

  // Index 8: unsigned right shift
  module.addFunction('shrUI32', sig_ii_i, binaryen.i32, [], module.i32.shr_u(L(0), L(1)));

  // Index 11: return first argument, ignore second
  module.addFunction('returnFirst', sig_ii_i, binaryen.i32, [], L(0));

  // Index 15: always return 0
  module.addFunction('returnConst0', sig_ii_i, binaryen.i32, [], C(0));

  // ======================================================================
  // Table functions: (i32) -> i32
  // ======================================================================

  // Index 2: identity
  module.addFunction('identityI32', sig_i_i, binaryen.i32, [], L(0));

  // Index 5: negate (0 - a)
  module.addFunction('negateI32', sig_i_i, binaryen.i32, [], module.i32.sub(C(0), L(0)));

  // Index 9: double (a + a)
  module.addFunction('doubleI32', sig_i_i, binaryen.i32, [], module.i32.add(L(0), L(0)));

  // Index 12: count leading zeros
  module.addFunction('clzI32', sig_i_i, binaryen.i32, [], module.i32.clz(L(0)));

  // ======================================================================
  // Table functions: (f64, f64) -> i32
  // ======================================================================

  // Index 6: trunc_s(a + b)
  module.addFunction('addF64ToI32', sig_dd_i, binaryen.i32, [], module.i32.trunc_s.f64(module.f64.add(Ld(0), Ld(1))));

  // Index 10: trunc_s(a * b)
  module.addFunction('mulF64ToI32', sig_dd_i, binaryen.i32, [], module.i32.trunc_s.f64(module.f64.mul(Ld(0), Ld(1))));

  // ======================================================================
  // Table functions: (i32, i32, i32) -> i32
  // ======================================================================

  // Index 16: wasm select — returns a if c!=0, b if c==0
  module.addFunction('selectAB', sig_iii_i, binaryen.i32, [], module.select(L(0), L(1), L(2)));

  // Index 17: pack three bytes into low 24 bits
  // (a & 0xFF) | ((b & 0xFF) << 8) | ((c & 0xFF) << 16)
  module.addFunction(
    'combineBits',
    sig_iii_i,
    binaryen.i32,
    [],
    module.i32.or(
      module.i32.or(module.i32.and(L(0), C(0xff)), module.i32.shl(module.i32.and(L(1), C(0xff)), C(8))),
      module.i32.shl(module.i32.and(L(2), C(0xff)), C(16))
    )
  );

  // ======================================================================
  // Function table — 18 entries (pads to 32, exercises padding logic)
  // ======================================================================
  // Indices by signature:
  //   ii_i : 0, 1, 3, 4, 7, 8, 11, 13, 14, 15
  //   i_i  : 2, 5, 9, 12
  //   dd_i : 6, 10
  //   iii_i: 16, 17

  var tableFunctionNames = [
    'addI32', //       0  ii_i
    'subI32', //       1  ii_i
    'identityI32', //  2  i_i
    'mulI32', //       3  ii_i
    'xorI32', //       4  ii_i
    'negateI32', //    5  i_i
    'addF64ToI32', //  6  dd_i
    'shlI32', //       7  ii_i
    'shrUI32', //      8  ii_i
    'doubleI32', //    9  i_i
    'mulF64ToI32', // 10  dd_i
    'returnFirst', // 11  ii_i
    'clzI32', //      12  i_i
    'addI32', //      13  ii_i  (alias of 0)
    'subI32', //      14  ii_i  (alias of 1)
    'returnConst0', //15  ii_i
    'selectAB', //    16  iii_i
    'combineBits' //  17  iii_i
  ];

  module.addTable('functionTable', tableFunctionNames.length, 0xffffffff);
  module.addActiveElementSegment('functionTable', 'functionTableInitSegment', tableFunctionNames, C(0));

  // Valid ii_i indices for dynamic dispatch.
  var validIiIIndices = [0, 1, 3, 4, 7, 8, 11, 13, 14, 15];

  // ======================================================================
  // Exercise 1: exerciseDispatchPair(a: i32, b: i32)
  //
  // Calls every ii_i entry with (a, b), every i_i entry with (a) and (b).
  // Stores: marker, then (index, result) pairs.
  // ======================================================================
  var dpBody = [storeI32(C(0xdd01))];

  // ii_i entries
  var iiIndices = validIiIIndices;
  for (var i = 0; i < iiIndices.length; ++i) {
    dpBody.push(storeI32(C(iiIndices[i])));
    dpBody.push(storeI32(ci(C(iiIndices[i]), [L(0), L(1)], sig_ii_i)));
  }

  // i_i entries with a
  var iIndices = [2, 5, 9, 12];
  for (var i = 0; i < iIndices.length; ++i) {
    dpBody.push(storeI32(C(iIndices[i])));
    dpBody.push(storeI32(ci(C(iIndices[i]), [L(0)], sig_i_i)));
  }

  // i_i entries with b — tests that all entries work with a different operand
  for (var i = 0; i < iIndices.length; ++i) {
    dpBody.push(storeI32(C(0x100 + iIndices[i])));
    dpBody.push(storeI32(ci(C(iIndices[i]), [L(1)], sig_i_i)));
  }

  module.addFunction('exerciseDispatchPair', sig_ii_i, binaryen.none, [], module.block(null, dpBody));
  module.addFunctionExport('exerciseDispatchPair', 'exerciseDispatchPair');

  // ======================================================================
  // Exercise 2: exerciseFloatPair(a: i32, b: i32)
  //
  // Converts i32 args to f64, calls dd_i entries.  Uses integer-valued
  // f64 to guarantee deterministic results across all runtimes.
  // ======================================================================
  var fpBody = [storeI32(C(0xdd02)), storeI32(L(0)), storeI32(L(1))];

  var ddIndices = [6, 10];
  for (var i = 0; i < ddIndices.length; ++i) {
    fpBody.push(storeI32(C(ddIndices[i])));
    fpBody.push(storeI32(ci(C(ddIndices[i]), [module.f64.convert_s.i32(L(0)), module.f64.convert_s.i32(L(1))], sig_dd_i)));
  }

  module.addFunction('exerciseFloatPair', sig_ii_i, binaryen.none, [], module.block(null, fpBody));
  module.addFunctionExport('exerciseFloatPair', 'exerciseFloatPair');

  // ======================================================================
  // Exercise 3: exerciseTriple(a: i32, b: i32, c: i32)
  //
  // Calls iii_i entries (select + combineBits).
  // ======================================================================
  var triBody = [storeI32(C(0xdd03)), storeI32(L(0)), storeI32(L(1)), storeI32(L(2))];

  var iiiIndices = [16, 17];
  for (var i = 0; i < iiiIndices.length; ++i) {
    triBody.push(storeI32(C(iiiIndices[i])));
    triBody.push(storeI32(ci(C(iiiIndices[i]), [L(0), L(1), L(2)], sig_iii_i)));
  }

  module.addFunction('exerciseTriple', sig_iii_i, binaryen.none, [], module.block(null, triBody));
  module.addFunctionExport('exerciseTriple', 'exerciseTriple');

  // ======================================================================
  // Exercise 4: exerciseChained(a: i32, b: i32)
  //
  // Multi-stage pipeline crossing signature boundaries.
  // Each result feeds into the next call.
  // params: a=0, b=1; locals: r1=2 .. r6=7
  // ======================================================================
  var chBody = [
    storeI32(C(0xdd04)),
    storeI32(L(0)),
    storeI32(L(1)),

    // r1 = addI32(a, b) via ii_i at index 0
    module.local.set(2, ci(C(0), [L(0), L(1)], sig_ii_i)),
    storeI32(L(2)),

    // r2 = identityI32(r1) via i_i at index 2 — crosses signature boundary
    module.local.set(3, ci(C(2), [L(2)], sig_i_i)),
    storeI32(L(3)),

    // r3 = mulI32(r2, a) via ii_i at index 3
    module.local.set(4, ci(C(3), [L(3), L(0)], sig_ii_i)),
    storeI32(L(4)),

    // r4 = negateI32(r3) via i_i at index 5 — crosses back
    module.local.set(5, ci(C(5), [L(4)], sig_i_i)),
    storeI32(L(5)),

    // r5 = xorI32(r4, b) via ii_i at index 4
    module.local.set(6, ci(C(4), [L(5), L(1)], sig_ii_i)),
    storeI32(L(6)),

    // r6 = doubleI32(r5) via i_i at index 9 — crosses once more
    module.local.set(7, ci(C(9), [L(6)], sig_i_i)),
    storeI32(L(7))
  ];

  module.addFunction(
    'exerciseChained',
    sig_ii_i,
    binaryen.none,
    [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, chBody)
  );
  module.addFunctionExport('exerciseChained', 'exerciseChained');

  // ======================================================================
  // Exercise 5: exerciseEdgeCases()
  //
  // No parameters — hardcoded edge values covering overflow, sign
  // boundaries, alias verification, and all four signatures.
  // ======================================================================
  var edBody = [storeI32(C(0xdd05))];

  // -- ii_i edge cases --
  edBody.push(storeI32(ci(C(0), [C(0x7fffffff), C(1)], sig_ii_i))); // add overflow → 0x80000000
  edBody.push(storeI32(ci(C(1), [C(-0x80000000), C(1)], sig_ii_i))); // sub underflow → 0x7FFFFFFF
  edBody.push(storeI32(ci(C(3), [C(0x10000), C(0x10000)], sig_ii_i))); // mul overflow → 0
  edBody.push(storeI32(ci(C(4), [C(-1), C(-1)], sig_ii_i))); // xor → 0
  edBody.push(storeI32(ci(C(4), [C(-1), C(0)], sig_ii_i))); // xor → -1
  edBody.push(storeI32(ci(C(7), [C(1), C(31)], sig_ii_i))); // shl → 0x80000000
  edBody.push(storeI32(ci(C(7), [C(-1), C(16)], sig_ii_i))); // shl → 0xFFFF0000
  edBody.push(storeI32(ci(C(8), [C(-1), C(1)], sig_ii_i))); // shrU → 0x7FFFFFFF
  edBody.push(storeI32(ci(C(8), [C(-8), C(2)], sig_ii_i))); // shrU → 0x3FFFFFFE
  edBody.push(storeI32(ci(C(11), [C(42), C(0)], sig_ii_i))); // returnFirst → 42
  edBody.push(storeI32(ci(C(15), [C(999), C(888)], sig_ii_i))); // returnConst0 → 0

  // -- alias verification: index 13/14 must match 0/1 --
  edBody.push(storeI32(ci(C(13), [C(123), C(456)], sig_ii_i))); // add alias → 579
  edBody.push(storeI32(ci(C(0), [C(123), C(456)], sig_ii_i))); // add original → 579
  edBody.push(storeI32(ci(C(14), [C(1000), C(300)], sig_ii_i))); // sub alias → 700
  edBody.push(storeI32(ci(C(1), [C(1000), C(300)], sig_ii_i))); // sub original → 700

  // -- i_i edge cases --
  edBody.push(storeI32(ci(C(2), [C(0)], sig_i_i))); // identity(0) → 0
  edBody.push(storeI32(ci(C(2), [C(-1)], sig_i_i))); // identity(-1) → -1
  edBody.push(storeI32(ci(C(2), [C(0x7fffffff)], sig_i_i))); // identity(max) → max
  edBody.push(storeI32(ci(C(5), [C(-0x80000000)], sig_i_i))); // negate(min) → min (wrap)
  edBody.push(storeI32(ci(C(5), [C(1)], sig_i_i))); // negate(1) → -1
  edBody.push(storeI32(ci(C(9), [C(0x40000000)], sig_i_i))); // double(0x40000000) → 0x80000000
  edBody.push(storeI32(ci(C(12), [C(0)], sig_i_i))); // clz(0) → 32
  edBody.push(storeI32(ci(C(12), [C(1)], sig_i_i))); // clz(1) → 31
  edBody.push(storeI32(ci(C(12), [C(-1)], sig_i_i))); // clz(0xFFFFFFFF) → 0
  edBody.push(storeI32(ci(C(12), [C(0x00010000)], sig_i_i))); // clz(0x10000) → 15

  // -- dd_i edge cases (f64 constants, integer-valued for determinism) --
  edBody.push(storeI32(ci(C(6), [module.f64.const(1e9), module.f64.const(1e9)], sig_dd_i))); // add → 2000000000
  edBody.push(storeI32(ci(C(10), [module.f64.const(100.0), module.f64.const(-3.0)], sig_dd_i))); // mul → -300
  edBody.push(storeI32(ci(C(6), [module.f64.const(-500.0), module.f64.const(500.0)], sig_dd_i))); // add → 0
  edBody.push(storeI32(ci(C(10), [module.f64.const(46340.0), module.f64.const(46340.0)], sig_dd_i))); // mul → 2147395600

  // -- iii_i edge cases --
  edBody.push(storeI32(ci(C(16), [C(42), C(99), C(1)], sig_iii_i))); // select c=1 → 42
  edBody.push(storeI32(ci(C(16), [C(42), C(99), C(0)], sig_iii_i))); // select c=0 → 99
  edBody.push(storeI32(ci(C(16), [C(-1), C(0x7fffffff), C(-1)], sig_iii_i))); // select c=-1 → -1
  edBody.push(storeI32(ci(C(17), [C(0xaa), C(0xbb), C(0xcc)], sig_iii_i))); // combine → 0x00CCBBAA
  edBody.push(storeI32(ci(C(17), [C(0x1ff), C(0x2ff), C(0x3ff)], sig_iii_i))); // combine masks → 0x003FFFFF? no
  // 0x1FF & 0xFF = 0xFF, 0x2FF & 0xFF = 0xFF, 0x3FF & 0xFF = 0xFF → 0x00FFFFFF
  edBody.push(storeI32(ci(C(17), [C(0), C(0), C(0)], sig_iii_i))); // combine zeros → 0

  module.addFunction('exerciseEdgeCases', binaryen.none, binaryen.none, [], module.block(null, edBody));
  module.addFunctionExport('exerciseEdgeCases', 'exerciseEdgeCases');

  // ======================================================================
  // Exercise 6: exerciseDynamicIndex(idx: i32, a: i32, b: i32)
  //
  // The table index comes from a parameter — tests runtime-determined
  // dispatch (not just constant indices).  Shared data must only provide
  // valid ii_i indices to avoid type-mismatch traps in native WASM.
  // ======================================================================
  var diBody = [
    storeI32(C(0xdd06)),
    storeI32(L(0)),
    storeI32(L(1)),
    storeI32(L(2)),
    storeI32(ci(L(0), [L(1), L(2)], sig_ii_i))
  ];

  module.addFunction('exerciseDynamicIndex', sig_iii_i, binaryen.none, [], module.block(null, diBody));
  module.addFunctionExport('exerciseDynamicIndex', 'exerciseDynamicIndex');

  // ======================================================================
  // Shared data generation
  // ======================================================================

  // -- i32 pairs: for exerciseDispatchPair and exerciseChained --
  var i32Pairs = [
    [100, 40],
    [0, 0],
    [-1, 1],
    [0x7fffffff, 1],
    [-0x80000000, -1],
    [1, 31],
    [255, 8],
    [0x12345678, -0x12345678]
  ];
  for (var r = 0; r < 3; ++r) {
    i32Pairs.push([common.rand.smallI32(), common.rand.smallI32()]);
  }

  // -- float pairs: for exerciseFloatPair (small values to avoid trunc_s traps) --
  var floatPairs = [
    [10, 20],
    [0, 0],
    [-5, 3],
    [100, -7],
    [1000, 1000],
    [-30000, 20000]
  ];
  for (var r = 0; r < 2; ++r) {
    floatPairs.push([common.rand.smallI32(), common.rand.smallI32()]);
  }

  // -- i32 triples: for exerciseTriple --
  var i32Triples = [
    [0xff, 0xab, 0x42],
    [0, 0, 0],
    [100, 200, 1],
    [100, 200, 0],
    [-1, 0x7fffffff, 1],
    [0, 0, -1]
  ];
  for (var r = 0; r < 2; ++r) {
    i32Triples.push([common.rand.smallI32(), common.rand.smallI32(), common.rand.smallI32()]);
  }

  // -- dynamic dispatch: [idx, a, b] where idx is always a valid ii_i index --
  var dynamicDispatch = [
    [0, 100, 200],
    [1, 200, 50],
    [3, 7, 8],
    [4, 0xff00, 0x00ff],
    [7, 1, 5],
    [8, 42, 999],
    [11, 77, 0],
    [13, 50, 75],
    [14, -8, 2],
    [15, 123, 456]
  ];
  for (var r = 0; r < 2; ++r) {
    var idx = validIiIIndices[(Math.random() * validIiIIndices.length) | 0];
    dynamicDispatch.push([idx, common.rand.smallI32(), common.rand.smallI32()]);
  }

  common.emitSharedData({
    i32_pairs: i32Pairs,
    float_pairs: floatPairs,
    i32_triples: i32Triples,
    dynamic_dispatch: dynamicDispatch
  });

  common.finalizeAndOutput(module);
})();
