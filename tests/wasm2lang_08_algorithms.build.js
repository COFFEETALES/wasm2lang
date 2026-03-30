'use strict';
(async function () {
  var common = require('./build_common');
  var binaryen = await common.loadBinaryen();
  var ctx = common.createTestModule(binaryen, {memoryPages: 8, heapBase: 2048});
  var module = ctx.module;
  var storeI32 = ctx.storeI32;

  // Memory layout:
  //   [0,    1024)  CRC32 256-entry lookup table (256 * 4 = 1024 bytes)
  //   [1024, 1088)  CRC32 16-entry nibble table  (16 * 4 = 64 bytes)
  //   [1088, 2048)  String/scratch area           (960 bytes)
  //   [2048, ...)   Heap (managed by heapTop)

  var p = function (i, t) {
    return module.local.get(i, t || binaryen.i32);
  };
  var i32 = function (n) {
    return module.i32.const(n);
  };

  // ═══════════════════════════════════════════════════════════════════
  // factorial(n: i32) -> i32  --  recursive
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'factorial',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.if(
      module.i32.le_s(p(0), i32(1)),
      i32(1),
      module.i32.mul(p(0), module.call('factorial', [module.i32.sub(p(0), i32(1))], binaryen.i32))
    )
  );

  // ═══════════════════════════════════════════════════════════════════
  // factorialIter(n: i32) -> i32  --  iterative loop + accumulator
  // params: n(0)  locals: acc(1)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'factorialIter',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.local.set(1, i32(1)),
      module.block('$done', [
        module.loop(
          '$iter',
          module.block(null, [
            module.br('$done', module.i32.le_s(p(0), i32(1))),
            module.local.set(1, module.i32.mul(p(1), p(0))),
            module.local.set(0, module.i32.sub(p(0), i32(1))),
            module.br('$iter')
          ])
        )
      ]),
      module.return(p(1))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // factorialTail(n: i32, acc: i32) -> i32  --  tail-recursive
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'factorialTail',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.if(
      module.i32.le_s(p(0), i32(1)),
      p(1),
      module.call('factorialTail', [module.i32.sub(p(0), i32(1)), module.i32.mul(p(0), p(1))], binaryen.i32)
    )
  );

  // ═══════════════════════════════════════════════════════════════════
  // exerciseFactorial(n: i32) -> void
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseFactorial',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('factorial', [p(0)], binaryen.i32)),
      storeI32(module.call('factorialIter', [p(0)], binaryen.i32)),
      storeI32(module.call('factorialTail', [p(0), i32(1)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // fibIter(n: i32) -> i32  --  iterative with two accumulators
  // params: n(0)  locals: a(1), b(2), i(3)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'fibIter',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      module.if(module.i32.lt_s(p(0), i32(2)), module.return(i32(1))),
      module.local.set(1, i32(1)),
      module.local.set(2, i32(1)),
      module.local.set(3, i32(2)),
      module.block('$exit', [
        module.loop(
          '$loop',
          module.block(null, [
            module.br('$exit', module.i32.gt_s(p(3), p(0))),
            module.local.set(2, module.i32.add(p(1), p(2))),
            module.local.set(1, module.i32.sub(p(2), p(1))),
            module.local.set(3, module.i32.add(p(3), i32(1))),
            module.br('$loop')
          ])
        )
      ]),
      module.return(p(2))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // fibRec(n: i32) -> i32  --  recursive double self-call
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'fibRec',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.if(
      module.i32.lt_s(p(0), i32(2)),
      i32(1),
      module.i32.add(
        module.call('fibRec', [module.i32.sub(p(0), i32(1))], binaryen.i32),
        module.call('fibRec', [module.i32.sub(p(0), i32(2))], binaryen.i32)
      )
    )
  );

  // ═══════════════════════════════════════════════════════════════════
  // exerciseFibonacci(n: i32) -> void
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseFibonacci',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('fibIter', [p(0)], binaryen.i32)),
      storeI32(module.call('fibRec', [p(0)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // collatzSteps(n: i32) -> i32  --  count steps to reach 1
  // params: n(0)  locals: steps(1)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'collatzSteps',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.block('$done', [
        module.loop(
          '$loop',
          module.block(null, [
            module.br('$done', module.i32.le_s(p(0), i32(1))),
            module.if(
              module.i32.and(p(0), i32(1)),
              module.local.set(0, module.i32.add(module.i32.mul(p(0), i32(3)), i32(1))),
              module.local.set(0, module.i32.shr_u(p(0), i32(1)))
            ),
            module.local.set(1, module.i32.add(p(1), i32(1))),
            module.br('$loop')
          ])
        )
      ]),
      module.return(p(1))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // collatzMax(n: i32) -> i32  --  highest value during sequence
  // params: n(0)  locals: peak(1)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'collatzMax',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.local.set(1, p(0)),
      module.block('$done', [
        module.loop(
          '$loop',
          module.block(null, [
            module.br('$done', module.i32.le_s(p(0), i32(1))),
            module.if(
              module.i32.and(p(0), i32(1)),
              module.local.set(0, module.i32.add(module.i32.mul(p(0), i32(3)), i32(1))),
              module.local.set(0, module.i32.shr_u(p(0), i32(1)))
            ),
            module.if(module.i32.gt_s(p(0), p(1)), module.local.set(1, p(0))),
            module.br('$loop')
          ])
        )
      ]),
      module.return(p(1))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // exerciseCollatz(n: i32) -> void
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseCollatz',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('collatzSteps', [p(0)], binaryen.i32)),
      storeI32(module.call('collatzMax', [p(0)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // gcdRec(a: i32, b: i32) -> i32  --  recursive Euclidean
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'gcdRec',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.if(module.i32.eqz(p(1)), p(0), module.call('gcdRec', [p(1), module.i32.rem_u(p(0), p(1))], binaryen.i32))
  );

  // ═══════════════════════════════════════════════════════════════════
  // gcdIter(a: i32, b: i32) -> i32  --  iterative Euclidean
  // params: a(0), b(1)  locals: t(2)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'gcdIter',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.block('$done', [
        module.loop(
          '$loop',
          module.block(null, [
            module.br('$done', module.i32.eqz(p(1))),
            module.local.set(2, module.i32.rem_u(p(0), p(1))),
            module.local.set(0, p(1)),
            module.local.set(1, p(2)),
            module.br('$loop')
          ])
        )
      ]),
      module.return(p(0))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // lcm(a: i32, b: i32) -> i32  --  via GCD
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'lcm',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.i32.div_u(module.i32.mul(p(0), p(1)), module.call('gcdRec', [p(0), p(1)], binaryen.i32))
  );

  // ═══════════════════════════════════════════════════════════════════
  // exerciseGcd(a: i32, b: i32) -> void
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseGcd',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('gcdRec', [p(0), p(1)], binaryen.i32)),
      storeI32(module.call('gcdIter', [p(0), p(1)], binaryen.i32)),
      storeI32(module.call('lcm', [p(0), p(1)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // min(a, b), max(a, b), clamp(v, lo, hi), abs(v) -- wasm select
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'wmin',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.select(module.i32.lt_s(p(0), p(1)), p(0), p(1))
  );

  module.addFunction(
    'wmax',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.select(module.i32.gt_s(p(0), p(1)), p(0), p(1))
  );

  module.addFunction(
    'wclamp',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.call('wmin', [module.call('wmax', [p(0), p(1)], binaryen.i32), p(2)], binaryen.i32)
  );

  module.addFunction(
    'wabs',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.select(module.i32.ge_s(p(0), i32(0)), p(0), module.i32.sub(i32(0), p(0)))
  );

  // ═══════════════════════════════════════════════════════════════════
  // exerciseSelect(a: i32, b: i32) -> void
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseSelect',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('wmin', [p(0), p(1)], binaryen.i32)),
      storeI32(module.call('wmax', [p(0), p(1)], binaryen.i32)),
      storeI32(module.call('wclamp', [p(0), i32(-50), i32(50)], binaryen.i32)),
      storeI32(module.call('wabs', [p(0)], binaryen.i32)),
      storeI32(module.call('wabs', [p(1)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // Bitwise: rotl, rotr, clz, ctz, popcnt
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction('wrotl', binaryen.createType([binaryen.i32, binaryen.i32]), binaryen.i32, [], module.i32.rotl(p(0), p(1)));

  module.addFunction('wrotr', binaryen.createType([binaryen.i32, binaryen.i32]), binaryen.i32, [], module.i32.rotr(p(0), p(1)));

  module.addFunction('wclz', binaryen.createType([binaryen.i32]), binaryen.i32, [], module.i32.clz(p(0)));

  module.addFunction('wctz', binaryen.createType([binaryen.i32]), binaryen.i32, [], module.i32.ctz(p(0)));

  module.addFunction('wpopcnt', binaryen.createType([binaryen.i32]), binaryen.i32, [], module.i32.popcnt(p(0)));

  // ═══════════════════════════════════════════════════════════════════
  // exerciseBitwise(v: i32) -> void
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseBitwise',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('wrotl', [p(0), i32(7)], binaryen.i32)),
      storeI32(module.call('wrotr', [p(0), i32(13)], binaryen.i32)),
      storeI32(module.call('wclz', [p(0)], binaryen.i32)),
      storeI32(module.call('wctz', [p(0)], binaryen.i32)),
      storeI32(module.call('wpopcnt', [p(0)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // strlen(ptr) -> i32  --  count bytes until null terminator
  // params: ptr(0)  locals: len(1)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'strlen',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.block('$done', [
        module.loop(
          '$loop',
          module.block(null, [
            module.br('$done', module.i32.eqz(module.i32.load8_u(0, 1, module.i32.add(p(0), p(1))))),
            module.local.set(1, module.i32.add(p(1), i32(1))),
            module.br('$loop')
          ])
        )
      ]),
      module.return(p(1))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // charAt(ptr, idx) -> i32  --  byte at index, or -1 if out of bounds
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'charAt',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.if(
      module.i32.lt_u(p(1), module.call('strlen', [p(0)], binaryen.i32)),
      module.i32.load8_u(0, 1, module.i32.add(p(0), p(1))),
      i32(-1)
    )
  );

  // ═══════════════════════════════════════════════════════════════════
  // indexOf(ptr, ch) -> i32  --  first index of byte ch, or -1
  // params: ptr(0), ch(1)  locals: i(2), c(3)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'indexOf',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.block('$done', [
        module.loop(
          '$loop',
          module.block(null, [
            module.local.set(3, module.i32.load8_u(0, 1, module.i32.add(p(0), p(2)))),
            module.br('$done', module.i32.eqz(p(3))),
            module.if(module.i32.eq(p(3), p(1)), module.return(p(2))),
            module.local.set(2, module.i32.add(p(2), i32(1))),
            module.br('$loop')
          ])
        )
      ]),
      module.return(i32(-1))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // djb2(ptr) -> i32  --  DJB2 hash of null-terminated string
  // params: ptr(0)  locals: hash(1), c(2)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'djb2',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(1, i32(5381)),
      module.block('$done', [
        module.loop(
          '$loop',
          module.block(null, [
            module.local.set(2, module.i32.load8_u(0, 1, p(0))),
            module.br('$done', module.i32.eqz(p(2))),
            module.local.set(1, module.i32.add(module.i32.add(module.i32.shl(p(1), i32(5)), p(1)), p(2))),
            module.local.set(0, module.i32.add(p(0), i32(1))),
            module.br('$loop')
          ])
        )
      ]),
      module.return(p(1))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // exerciseString(ptr: i32) -> void  --  ptr is null-terminated
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseString',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('strlen', [p(0)], binaryen.i32)),
      storeI32(module.call('charAt', [p(0), i32(0)], binaryen.i32)),
      storeI32(module.call('charAt', [p(0), i32(2)], binaryen.i32)),
      storeI32(module.call('indexOf', [p(0), i32(0x6f)], binaryen.i32)),
      storeI32(module.call('djb2', [p(0)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // sumArray(ptr, count) -> i32  --  sum count consecutive i32 values
  // params: ptr(0), count(1)  locals: sum(2), end(3)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'sumArray',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(3, module.i32.add(p(0), module.i32.shl(p(1), i32(2)))),
      module.block('$done', [
        module.loop(
          '$loop',
          module.block(null, [
            module.br('$done', module.i32.ge_u(p(0), p(3))),
            module.local.set(2, module.i32.add(p(2), module.i32.load(0, 4, p(0)))),
            module.local.set(0, module.i32.add(p(0), i32(4))),
            module.br('$loop')
          ])
        )
      ]),
      module.return(p(2))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // swap(a, b) -> void  --  swap two i32 values in memory
  // params: a(0), b(1)  locals: tmp(2)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'swap',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [binaryen.i32],
    module.block(null, [
      module.local.set(2, module.i32.load(0, 4, p(0))),
      module.i32.store(0, 4, p(0), module.i32.load(0, 4, p(1))),
      module.i32.store(0, 4, p(1), p(2)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // exerciseMemory(ptr: i32) -> void  --  self-contained array test
  // Writes [10, 20, 30, 40, 50] at ptr, sums, swaps, re-sums.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseMemory',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      module.i32.store(0, 4, p(0), i32(10)),
      module.i32.store(0, 4, module.i32.add(p(0), i32(4)), i32(20)),
      module.i32.store(0, 4, module.i32.add(p(0), i32(8)), i32(30)),
      module.i32.store(0, 4, module.i32.add(p(0), i32(12)), i32(40)),
      module.i32.store(0, 4, module.i32.add(p(0), i32(16)), i32(50)),
      storeI32(module.call('sumArray', [p(0), i32(5)], binaryen.i32)),
      module.call('swap', [p(0), module.i32.add(p(0), i32(4))], binaryen.none),
      storeI32(module.i32.load(0, 4, p(0))),
      storeI32(module.i32.load(0, 4, module.i32.add(p(0), i32(4)))),
      storeI32(module.call('sumArray', [p(0), i32(5)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // crc32(ptr: i32, len: i32) -> i32  --  bitwise (no lookup table)
  // params: ptr(0), len(1)  locals: crc(2), end(3), byte(4), j(5)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'crc32',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(2, i32(-1)),
      module.local.set(3, module.i32.add(p(0), p(1))),
      module.block('$done', [
        module.loop(
          '$outer',
          module.block(null, [
            module.br('$done', module.i32.ge_u(p(0), p(3))),
            module.local.set(2, module.i32.xor(p(2), module.i32.load8_u(0, 1, p(0)))),
            module.local.set(5, i32(0)),
            module.block('$bit_done', [
              module.loop(
                '$bits',
                module.block(null, [
                  module.br('$bit_done', module.i32.ge_u(p(5), i32(8))),
                  module.if(
                    module.i32.and(p(2), i32(1)),
                    module.local.set(2, module.i32.xor(module.i32.shr_u(p(2), i32(1)), i32(0xedb88320 | 0))),
                    module.local.set(2, module.i32.shr_u(p(2), i32(1)))
                  ),
                  module.local.set(5, module.i32.add(p(5), i32(1))),
                  module.br('$bits')
                ])
              )
            ]),
            module.local.set(0, module.i32.add(p(0), i32(1))),
            module.br('$outer')
          ])
        )
      ]),
      module.return(module.i32.xor(p(2), i32(-1)))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // crc32Table(ptr: i32, len: i32) -> i32  --  256-entry table lookup
  // Table at address 0: entry[i] = i32 at offset i*4
  // params: ptr(0), len(1)  locals: crc(2), end(3)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'crc32Table',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(2, i32(-1)),
      module.local.set(3, module.i32.add(p(0), p(1))),
      module.block('$done', [
        module.loop(
          '$outer',
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
            module.br('$outer')
          ])
        )
      ]),
      module.return(module.i32.xor(p(2), i32(-1)))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // crc32Nibble(ptr: i32, len: i32) -> i32  --  nibble-at-a-time (16-entry table)
  // Table at address 1024: entry[i] = i32 at offset 1024 + i*4
  // params: ptr(0), len(1)  locals: crc(2), end(3), byte(4)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'crc32Nibble',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(2, i32(-1)),
      module.local.set(3, module.i32.add(p(0), p(1))),
      module.block('$done', [
        module.loop(
          '$outer',
          module.block(null, [
            module.br('$done', module.i32.ge_u(p(0), p(3))),
            module.local.set(4, module.i32.load8_u(0, 1, p(0))),
            // low nibble: crc = nibble[(crc ^ byte) & 0xF] ^ (crc >>> 4)
            module.local.set(
              2,
              module.i32.xor(
                module.i32.load(
                  0,
                  4,
                  module.i32.add(i32(1024), module.i32.shl(module.i32.and(module.i32.xor(p(2), p(4)), i32(0xf)), i32(2)))
                ),
                module.i32.shr_u(p(2), i32(4))
              )
            ),
            // high nibble: crc = nibble[(crc ^ (byte >> 4)) & 0xF] ^ (crc >>> 4)
            module.local.set(
              2,
              module.i32.xor(
                module.i32.load(
                  0,
                  4,
                  module.i32.add(
                    i32(1024),
                    module.i32.shl(module.i32.and(module.i32.xor(p(2), module.i32.shr_u(p(4), i32(4))), i32(0xf)), i32(2))
                  )
                ),
                module.i32.shr_u(p(2), i32(4))
              )
            ),
            module.local.set(0, module.i32.add(p(0), i32(1))),
            module.br('$outer')
          ])
        )
      ]),
      module.return(module.i32.xor(p(2), i32(-1)))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // exerciseCrc32(ptr: i32, len: i32) -> void
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseCrc32',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('crc32', [p(0), p(1)], binaryen.i32)),
      storeI32(module.call('crc32Table', [p(0), p(1)], binaryen.i32)),
      storeI32(module.call('crc32Nibble', [p(0), p(1)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // initCrc32Tables() -> void
  // Writes 256-entry table at [0,1024) and 16-entry nibble table at [1024,1088).
  // locals: i(0), crc(1), j(2)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'initCrc32Tables',
    binaryen.none,
    binaryen.none,
    [binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      // --- 256-entry table ---
      module.local.set(0, i32(0)),
      module.block('$t256_done', [
        module.loop(
          '$t256',
          module.block(null, [
            module.br('$t256_done', module.i32.ge_u(p(0), i32(256))),
            module.local.set(1, p(0)),
            module.local.set(2, i32(0)),
            module.block('$b8_done', [
              module.loop(
                '$b8',
                module.block(null, [
                  module.br('$b8_done', module.i32.ge_u(p(2), i32(8))),
                  module.if(
                    module.i32.and(p(1), i32(1)),
                    module.local.set(1, module.i32.xor(module.i32.shr_u(p(1), i32(1)), i32(0xedb88320 | 0))),
                    module.local.set(1, module.i32.shr_u(p(1), i32(1)))
                  ),
                  module.local.set(2, module.i32.add(p(2), i32(1))),
                  module.br('$b8')
                ])
              )
            ]),
            module.i32.store(0, 4, module.i32.shl(p(0), i32(2)), p(1)),
            module.local.set(0, module.i32.add(p(0), i32(1))),
            module.br('$t256')
          ])
        )
      ]),

      // --- 16-entry nibble table ---
      module.local.set(0, i32(0)),
      module.block('$t16_done', [
        module.loop(
          '$t16',
          module.block(null, [
            module.br('$t16_done', module.i32.ge_u(p(0), i32(16))),
            module.local.set(1, p(0)),
            module.local.set(2, i32(0)),
            module.block('$b4_done', [
              module.loop(
                '$b4',
                module.block(null, [
                  module.br('$b4_done', module.i32.ge_u(p(2), i32(4))),
                  module.if(
                    module.i32.and(p(1), i32(1)),
                    module.local.set(1, module.i32.xor(module.i32.shr_u(p(1), i32(1)), i32(0xedb88320 | 0))),
                    module.local.set(1, module.i32.shr_u(p(1), i32(1)))
                  ),
                  module.local.set(2, module.i32.add(p(2), i32(1))),
                  module.br('$b4')
                ])
              )
            ]),
            module.i32.store(0, 4, module.i32.add(i32(1024), module.i32.shl(p(0), i32(2))), p(1)),
            module.local.set(0, module.i32.add(p(0), i32(1))),
            module.br('$t16')
          ])
        )
      ]),

      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // Exports
  // ═══════════════════════════════════════════════════════════════════
  module.addFunctionExport('factorial', 'factorial');
  module.addFunctionExport('factorialIter', 'factorialIter');
  module.addFunctionExport('factorialTail', 'factorialTail');
  module.addFunctionExport('exerciseFactorial', 'exerciseFactorial');
  module.addFunctionExport('fibIter', 'fibIter');
  module.addFunctionExport('fibRec', 'fibRec');
  module.addFunctionExport('exerciseFibonacci', 'exerciseFibonacci');
  module.addFunctionExport('collatzSteps', 'collatzSteps');
  module.addFunctionExport('collatzMax', 'collatzMax');
  module.addFunctionExport('exerciseCollatz', 'exerciseCollatz');
  module.addFunctionExport('gcdRec', 'gcdRec');
  module.addFunctionExport('gcdIter', 'gcdIter');
  module.addFunctionExport('lcm', 'lcm');
  module.addFunctionExport('exerciseGcd', 'exerciseGcd');
  module.addFunctionExport('wmin', 'wmin');
  module.addFunctionExport('wmax', 'wmax');
  module.addFunctionExport('wclamp', 'wclamp');
  module.addFunctionExport('wabs', 'wabs');
  module.addFunctionExport('exerciseSelect', 'exerciseSelect');
  module.addFunctionExport('wrotl', 'wrotl');
  module.addFunctionExport('wrotr', 'wrotr');
  module.addFunctionExport('wclz', 'wclz');
  module.addFunctionExport('wctz', 'wctz');
  module.addFunctionExport('wpopcnt', 'wpopcnt');
  module.addFunctionExport('exerciseBitwise', 'exerciseBitwise');
  module.addFunctionExport('strlen', 'strlen');
  module.addFunctionExport('charAt', 'charAt');
  module.addFunctionExport('indexOf', 'indexOf');
  module.addFunctionExport('djb2', 'djb2');
  module.addFunctionExport('exerciseString', 'exerciseString');
  module.addFunctionExport('sumArray', 'sumArray');
  module.addFunctionExport('swap', 'swap');
  module.addFunctionExport('exerciseMemory', 'exerciseMemory');
  module.addFunctionExport('crc32', 'crc32');
  module.addFunctionExport('crc32Table', 'crc32Table');
  module.addFunctionExport('crc32Nibble', 'crc32Nibble');
  module.addFunctionExport('exerciseCrc32', 'exerciseCrc32');
  module.addFunctionExport('initCrc32Tables', 'initCrc32Tables');

  common.finalizeAndOutput(module);

  // ═══════════════════════════════════════════════════════════════════
  // Shared data generation
  // ═══════════════════════════════════════════════════════════════════
  var staticFactorial = [0, 1, 2, 3, 5, 7, 10, 12, 13, -1];
  var staticCrc32 = ['', 'a', 'abc', 'wasm2lang', 'hello, world!', '0123456789'];
  var data = {};
  data.factorial_inputs = staticFactorial.concat(
    Array.from({length: 6}, function () {
      return (Math.random() * 13) | 0;
    })
  );
  data.crc32_inputs = staticCrc32.concat(
    Array.from({length: 8}, function () {
      return common.rand.randString(32);
    })
  );
  data.fibonacci_inputs = [0, 1, 2, 3, 5, 8, 10, 15, 20].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 20) | 0;
    })
  );
  data.collatz_inputs = [1, 2, 3, 6, 7, 12, 19, 27, 97, 871].concat(
    Array.from({length: 4}, function () {
      return ((Math.random() * 999) | 0) + 1;
    })
  );
  data.gcd_inputs = [
    [12, 8],
    [100, 75],
    [17, 13],
    [1, 1],
    [48, 36],
    [7, 1],
    [1000, 250],
    [97, 89]
  ].concat(
    Array.from({length: 4}, function () {
      return [((Math.random() * 999) | 0) + 1, ((Math.random() * 999) | 0) + 1];
    })
  );
  data.select_inputs = [
    [5, 3],
    [-7, 4],
    [0, 0],
    [100, -100],
    [-50, -30],
    [2147483647, -2147483648 | 0]
  ].concat(
    Array.from({length: 4}, function () {
      return [common.rand.smallI32(), common.rand.smallI32()];
    })
  );
  data.bitwise_inputs = [0, 1, -1, 0x80000000 | 0, 0x7fffffff, 0xff, 0xaaaaaaaa | 0, 42].concat(
    Array.from({length: 4}, function () {
      return common.rand.i32();
    })
  );
  data.string_inputs = ['a', 'hello', 'foo bar', 'wasm2lang', '0123456789'].concat(
    Array.from({length: 4}, function () {
      var s = common.rand.randString(20);
      return s.length > 0 ? s : 'x';
    })
  );

  common.emitSharedData(data);
})();
