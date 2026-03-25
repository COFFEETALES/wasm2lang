'use strict';
(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const {module, storeI32} = common.createTestModule(binaryen, {});

  // Locals helpers
  const p = (i, t) => module.local.get(i, t || binaryen.i32);
  const i32 = n => module.i32.const(n);

  // ─── crc32(ptr: i32, len: i32) → i32 ───
  // Bitwise CRC32 (no lookup table) over a byte buffer in memory.
  //
  // params:  $ptr (0), $len (1)
  // locals:  $crc (2), $end (3), $byte (4), $j (5)
  module.addFunction(
    'crc32',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      // $crc = -1
      module.local.set(2, i32(-1)),
      // $end = $ptr + $len
      module.local.set(3, module.i32.add(p(0), p(1))),

      // outer loop: iterate bytes
      module.block('$done', [
        module.loop(
          '$outer',
          module.block(null, [
            // br_if $done if $ptr >= $end (unsigned)
            module.br('$done', module.i32.ge_u(p(0), p(3))),

            // $crc ^= mem[$ptr] (load8_u)
            module.local.set(2, module.i32.xor(p(2), module.i32.load8_u(0, 1, p(0)))),

            // inner loop: 8 bits
            module.local.set(5, i32(0)),
            module.block('$bit_done', [
              module.loop(
                '$bits',
                module.block(null, [
                  module.br('$bit_done', module.i32.ge_u(p(5), i32(8))),

                  // if ($crc & 1)  $crc = ($crc >>> 1) ^ 0xEDB88320
                  // else           $crc = $crc >>> 1
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

            // $ptr++
            module.local.set(0, module.i32.add(p(0), i32(1))),
            module.br('$outer')
          ])
        )
      ]),

      // return $crc ^ -1
      module.return(module.i32.xor(p(2), i32(-1)))
    ])
  );
  module.addFunctionExport('crc32', 'crc32');

  // ─── exerciseCrc32(ptr: i32, len: i32) ───
  // Calls crc32 on the given memory region and stores the result to the heap.
  module.addFunction(
    'exerciseCrc32',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('crc32', [p(0), p(1)], binaryen.i32)), module.return()])
  );
  module.addFunctionExport('exerciseCrc32', 'exerciseCrc32');

  common.finalizeAndOutput(module);

  // Test inputs — each string is written to memory by the harness, then
  // exerciseCrc32(ptr, len) is called to compute and store the CRC.
  const staticInputs = ['', 'a', 'abc', 'wasm2lang', 'hello, world!', '0123456789'];
  function randomString() {
    var len = (Math.random() * 32) | 0;
    var s = '';
    for (var i = 0; i < len; i++) s += String.fromCharCode(32 + ((Math.random() * 95) | 0));
    return s;
  }
  const crc32_inputs = staticInputs.concat(Array.from({length: 3}, randomString));
  common.emitSharedData({crc32_inputs});
})();
