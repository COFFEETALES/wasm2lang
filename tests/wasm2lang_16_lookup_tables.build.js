'use strict';

(async function () {
  var common = require('./build_common');
  var binaryen = await common.loadBinaryen();

  // ═══════════════════════════════════════════════════════════════════
  // Pre-compute lookup tables at build time (embedded as data segments)
  // ═══════════════════════════════════════════════════════════════════

  // CRC32 256-entry table (standard polynomial 0xEDB88320)
  function computeCRC32Table() {
    var table = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var crc = i;
      for (var j = 0; j < 8; j++) {
        if (crc & 1) {
          crc = (crc >>> 1) ^ 0xedb88320;
        } else {
          crc = crc >>> 1;
        }
      }
      table[i] = crc;
    }
    return table;
  }

  // Squares 0..15
  function computeSquareTable() {
    var table = new Uint32Array(16);
    for (var i = 0; i < 16; i++) {
      table[i] = i * i;
    }
    return table;
  }

  // Sorted array for binary search (32 entries)
  var sortedValues = [
    -97, -50, -23, -10, -3, 0, 1, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 100,
    127
  ];

  var crc32Table = computeCRC32Table();
  var squareTable = computeSquareTable();
  var sortedArray = new Int32Array(sortedValues);

  var crc32Bytes = Array.from(new Uint8Array(crc32Table.buffer));
  var squareBytes = Array.from(new Uint8Array(squareTable.buffer));
  var sortedBytes = Array.from(new Uint8Array(sortedArray.buffer));

  // ═══════════════════════════════════════════════════════════════════
  // Memory layout:
  //   [0,    1024)  CRC32 256-entry table  (pre-computed data segment)
  //   [1024, 1088)  Square table 0..15     (pre-computed data segment)
  //   [1088, 1216)  Sorted array, 32 i32   (pre-computed data segment)
  //   [1216, 1344)  Fibonacci memo table   (zeroed at runtime)
  //   [1536, 2048)  Scratch area for CRC32 string data
  //   [2048, ...)   Heap (managed by heapTop)
  // ═══════════════════════════════════════════════════════════════════

  var module = new binaryen.Module();
  module.setFeatures(binaryen.Features.MVP | binaryen.Features.NontrappingFPToInt);
  module.setMemory(
    8,
    8,
    'memory',
    [
      {passive: false, offset: module.i32.const(0), data: crc32Bytes},
      {passive: false, offset: module.i32.const(1024), data: squareBytes},
      {passive: false, offset: module.i32.const(1088), data: sortedBytes}
    ],
    false
  );

  module.addGlobal('heapTop', binaryen.i32, true, module.i32.const(2048));

  module.addFunction(
    'alignHeapTop',
    binaryen.none,
    binaryen.none,
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

  module.addFunction('getHeapTop', binaryen.none, binaryen.i32, [], module.return(module.global.get('heapTop', binaryen.i32)));

  module.addFunctionExport('alignHeapTop', 'alignHeapTop');
  module.addFunctionExport('getHeapTop', 'getHeapTop');

  var heapTop = function () {
    return module.global.get('heapTop', binaryen.i32);
  };
  var advanceHeap = function (n) {
    return module.global.set('heapTop', module.i32.add(heapTop(), module.i32.const(n)));
  };
  var storeI32 = function (value) {
    return module.block(null, [module.i32.store(0, 4, heapTop(), value), advanceHeap(4)]);
  };

  var p = function (i, t) {
    return module.local.get(i, t || binaryen.i32);
  };
  var i32 = function (n) {
    return module.i32.const(n);
  };

  // ═══════════════════════════════════════════════════════════════════
  // crc32PreCalc(ptr: i32, len: i32) -> i32
  // CRC32 via pre-computed table at [0, 1024). No runtime init needed.
  // params: ptr(0), len(1)  locals: crc(2), end(3)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'crc32PreCalc',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(2, i32(-1)),
      module.local.set(3, module.i32.add(p(0), p(1))),
      module.block('$done', [
        module.loop(
          '$loop',
          module.block(null, [
            module.br('$done', module.i32.ge_u(p(0), p(3))),
            // crc = table[(crc ^ mem[ptr]) & 0xFF] ^ (crc >>> 8)
            module.local.set(
              2,
              module.i32.xor(
                module.i32.load(
                  0,
                  4,
                  module.i32.shl(module.i32.and(module.i32.xor(p(2), module.i32.load8_u(0, 1, p(0))), i32(0xff)), i32(2))
                ),
                module.i32.shr_u(p(2), i32(8))
              )
            ),
            module.local.set(0, module.i32.add(p(0), i32(1))),
            module.br('$loop')
          ])
        )
      ]),
      module.return(module.i32.xor(p(2), i32(-1)))
    ])
  );

  // exerciseCrc32PreCalc(ptr: i32, len: i32): void
  module.addFunction(
    'exerciseCrc32PreCalc',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('crc32PreCalc', [p(0), p(1)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // squareLookup(n: i32) -> i32
  // For n in [0,16) uses pre-computed table at [1024, 1088),
  // otherwise falls back to multiplication.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'squareLookup',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.if(
      module.i32.and(module.i32.ge_s(p(0), i32(0)), module.i32.lt_s(p(0), i32(16))),
      module.i32.load(0, 4, module.i32.add(i32(1024), module.i32.shl(p(0), i32(2)))),
      module.i32.mul(p(0), p(0))
    )
  );

  // squareCompute(n: i32) -> i32 — always multiply
  module.addFunction('squareCompute', binaryen.createType([binaryen.i32]), binaryen.i32, [], module.i32.mul(p(0), p(0)));

  // ═══════════════════════════════════════════════════════════════════
  // isPerfectSquare(n: i32) -> i32
  // Brute force: iterate i from 0 while i*i <= n (unsigned comparison
  // to handle overflow when i nears 46341).
  // params: n(0)  locals: i(1)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'isPerfectSquare',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.if(module.i32.lt_s(p(0), i32(0)), module.return(i32(0))),
      module.block('$done', [
        module.loop(
          '$loop',
          module.block(null, [
            module.br('$done', module.i32.gt_u(module.i32.mul(p(1), p(1)), p(0))),
            module.if(module.i32.eq(module.i32.mul(p(1), p(1)), p(0)), module.return(i32(1))),
            module.local.set(1, module.i32.add(p(1), i32(1))),
            module.br('$loop')
          ])
        )
      ]),
      module.return(i32(0))
    ])
  );

  // exerciseSquares(n: i32): void
  module.addFunction(
    'exerciseSquares',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('squareLookup', [p(0)], binaryen.i32)),
      storeI32(module.call('squareCompute', [p(0)], binaryen.i32)),
      storeI32(module.call('isPerfectSquare', [p(0)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // binarySearch(ptr: i32, count: i32, needle: i32) -> i32
  // Standard binary search on a sorted i32 array. Returns index or -1.
  // Convergence loop pattern (lo/hi shrinking) — different from
  // counted or conditional loops in existing tests.
  // params: ptr(0), count(1), needle(2)
  // locals: lo(3), hi(4), mid(5), val(6)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'binarySearch',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(4, p(1)),
      module.block('$done', [
        module.loop(
          '$loop',
          module.block(null, [
            module.br('$done', module.i32.ge_s(p(3), p(4))),
            // mid = (lo + hi) >>> 1
            module.local.set(5, module.i32.shr_u(module.i32.add(p(3), p(4)), i32(1))),
            // val = mem[ptr + mid*4]
            module.local.set(6, module.i32.load(0, 4, module.i32.add(p(0), module.i32.shl(p(5), i32(2))))),
            module.if(module.i32.eq(p(6), p(2)), module.return(p(5))),
            module.if(
              module.i32.lt_s(p(6), p(2)),
              module.local.set(3, module.i32.add(p(5), i32(1))),
              module.local.set(4, p(5))
            ),
            module.br('$loop')
          ])
        )
      ]),
      module.return(i32(-1))
    ])
  );

  // exerciseBinarySearch(needle: i32): void
  // Searches the pre-loaded sorted array at [1088, 1216) (32 entries).
  module.addFunction(
    'exerciseBinarySearch',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('binarySearch', [i32(1088), i32(32), p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // clearMemoTable(count: i32): void
  // Zeros i32 entries at [1216, 1216 + count*4).
  // params: count(0)  locals: i(1)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'clearMemoTable',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [binaryen.i32],
    module.block(null, [
      module.block('$done', [
        module.loop(
          '$loop',
          module.block(null, [
            module.br('$done', module.i32.ge_u(p(1), p(0))),
            module.i32.store(0, 4, module.i32.add(i32(1216), module.i32.shl(p(1), i32(2))), i32(0)),
            module.local.set(1, module.i32.add(p(1), i32(1))),
            module.br('$loop')
          ])
        )
      ]),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // fibMemo(n: i32) -> i32
  // Memoized fibonacci using table at [1216, ...).
  // Recursive with memo lookups — exercises recursion + memory
  // read/write in a pattern distinct from existing iter/rec fib.
  // params: n(0)  locals: result(1)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'fibMemo',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.if(module.i32.lt_s(p(0), i32(2)), module.return(i32(1))),
      // Check memo table
      module.local.set(1, module.i32.load(0, 4, module.i32.add(i32(1216), module.i32.shl(p(0), i32(2))))),
      module.if(module.i32.ne(p(1), i32(0)), module.return(p(1))),
      // Compute and memoize
      module.local.set(
        1,
        module.i32.add(
          module.call('fibMemo', [module.i32.sub(p(0), i32(1))], binaryen.i32),
          module.call('fibMemo', [module.i32.sub(p(0), i32(2))], binaryen.i32)
        )
      ),
      module.i32.store(0, 4, module.i32.add(i32(1216), module.i32.shl(p(0), i32(2))), p(1)),
      module.return(p(1))
    ])
  );

  // exerciseFibMemo(n: i32): void
  module.addFunction(
    'exerciseFibMemo',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      module.call('clearMemoTable', [module.i32.add(p(0), i32(1))], binaryen.none),
      storeI32(module.call('fibMemo', [p(0)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // isPowerOf2(n: i32) -> i32
  // Single-expression bitwise pattern: (n > 0) & ((n & (n-1)) == 0)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'isPowerOf2',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.i32.and(module.i32.gt_s(p(0), i32(0)), module.i32.eqz(module.i32.and(p(0), module.i32.sub(p(0), i32(1)))))
  );

  // ═══════════════════════════════════════════════════════════════════
  // byteReverse(n: i32) -> i32
  // Reverse byte order — deeply nested bitwise expression tree.
  // ((n>>>24)&0xFF) | ((n>>>8)&0xFF00) | ((n<<8)&0xFF0000) | (n<<24)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'byteReverse',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.i32.or(
      module.i32.or(
        module.i32.and(module.i32.shr_u(p(0), i32(24)), i32(0xff)),
        module.i32.and(module.i32.shr_u(p(0), i32(8)), i32(0xff00))
      ),
      module.i32.or(module.i32.and(module.i32.shl(p(0), i32(8)), i32(0xff0000)), module.i32.shl(p(0), i32(24)))
    )
  );

  // exerciseBitPatterns(n: i32): void
  module.addFunction(
    'exerciseBitPatterns',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('isPowerOf2', [p(0)], binaryen.i32)),
      storeI32(module.call('byteReverse', [p(0)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // Exports
  // ═══════════════════════════════════════════════════════════════════
  module.addFunctionExport('crc32PreCalc', 'crc32PreCalc');
  module.addFunctionExport('exerciseCrc32PreCalc', 'exerciseCrc32PreCalc');
  module.addFunctionExport('squareLookup', 'squareLookup');
  module.addFunctionExport('squareCompute', 'squareCompute');
  module.addFunctionExport('isPerfectSquare', 'isPerfectSquare');
  module.addFunctionExport('exerciseSquares', 'exerciseSquares');
  module.addFunctionExport('binarySearch', 'binarySearch');
  module.addFunctionExport('exerciseBinarySearch', 'exerciseBinarySearch');
  module.addFunctionExport('clearMemoTable', 'clearMemoTable');
  module.addFunctionExport('fibMemo', 'fibMemo');
  module.addFunctionExport('exerciseFibMemo', 'exerciseFibMemo');
  module.addFunctionExport('isPowerOf2', 'isPowerOf2');
  module.addFunctionExport('byteReverse', 'byteReverse');
  module.addFunctionExport('exerciseBitPatterns', 'exerciseBitPatterns');

  common.finalizeAndOutput(module);

  // ═══════════════════════════════════════════════════════════════════
  // Shared data
  // ═══════════════════════════════════════════════════════════════════
  var data = {};

  data.square_inputs = [0, 1, 4, 9, 15, 16, 25, 100, -1, 0x7fffffff].concat(
    Array.from({length: 4}, function () {
      return common.rand.smallI32();
    })
  );

  data.binary_search_needles = [-97, 0, 1, 23, 31, 59, 97, 127, -100, -1, 2, 50, 128, 1000].concat(
    Array.from({length: 4}, function () {
      return common.rand.smallI32();
    })
  );

  data.fib_memo_inputs = [0, 1, 2, 3, 5, 8, 10, 15, 20, 25, 30].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 30) | 0;
    })
  );

  data.bit_pattern_inputs = [0, 1, 2, 4, 8, 255, 256, 0x12345678, -1, 0x80000000 | 0, 0x7fffffff, 1024].concat(
    Array.from({length: 4}, function () {
      return common.rand.i32();
    })
  );

  data.crc32_strings = ['', 'a', 'abc', 'wasm2lang', 'hello, world!', '0123456789'].concat(
    Array.from({length: 6}, function () {
      return common.rand.randString(32);
    })
  );

  common.emitSharedData(data);
})();
