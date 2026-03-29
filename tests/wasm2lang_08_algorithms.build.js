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
  //   [1088, 2048)  String scratch area           (960 bytes)
  //   [2048, ...)   Heap (managed by heapTop)

  var p = function (i, t) {
    return module.local.get(i, t || binaryen.i32);
  };
  var i32 = function (n) {
    return module.i32.const(n);
  };

  // ═══════════════════════════════════════════════════════════════════
  // factorial(n: i32) → i32  —  recursive
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
  // factorialIter(n: i32) → i32  —  iterative loop + accumulator
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
  // factorialTail(n: i32, acc: i32) → i32  —  tail-recursive
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
  // exerciseFactorial(n: i32) → void  —  calls all 3 variants, stores 3 results
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
  // crc32(ptr: i32, len: i32) → i32  —  bitwise (no lookup table)
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
  // crc32Table(ptr: i32, len: i32) → i32  —  256-entry table lookup
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
  // crc32Nibble(ptr: i32, len: i32) → i32  —  nibble-at-a-time (16-entry table)
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
  // exerciseCrc32(ptr: i32, len: i32) → void  —  calls all 3 variants, stores 3 results
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
  // initCrc32Tables() → void
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

  module.addFunctionExport('factorial', 'factorial');
  module.addFunctionExport('factorialIter', 'factorialIter');
  module.addFunctionExport('factorialTail', 'factorialTail');
  module.addFunctionExport('exerciseFactorial', 'exerciseFactorial');
  module.addFunctionExport('crc32', 'crc32');
  module.addFunctionExport('crc32Table', 'crc32Table');
  module.addFunctionExport('crc32Nibble', 'crc32Nibble');
  module.addFunctionExport('exerciseCrc32', 'exerciseCrc32');
  module.addFunctionExport('initCrc32Tables', 'initCrc32Tables');

  common.finalizeAndOutput(module);

  // Shared data generation.
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
  common.emitSharedData(data);
})();
