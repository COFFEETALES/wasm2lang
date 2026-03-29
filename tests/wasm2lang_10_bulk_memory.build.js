'use strict';

(async function () {
  var common = require('./build_common');
  var binaryen = await common.loadBinaryen();
  var ctx = common.createTestModule(binaryen, {memoryPages: 8, heapBase: 1024});
  var module = ctx.module;

  // Enable BulkMemory feature.
  module.setFeatures(
    binaryen.Features.MVP |
      binaryen.Features.NontrappingFPToInt |
      binaryen.Features.BulkMemory |
      binaryen.Features.BulkMemoryOpt
  );

  var heapTop = ctx.heapTop;
  var storeI32 = ctx.storeI32;

  // exerciseBulkMemory(base: i32): void
  //  1. memory.fill(base, 0xAA, 32)          — fill 32 bytes with 0xAA
  //  2. memory.copy(base+32, base, 32)        — non-overlapping copy
  //  3. memory.fill(base+64, 0xBB, 16)        — fill 16 bytes with 0xBB
  //  4. memory.copy(base+68, base+64, 16)     — overlapping copy (dest > src)
  //  5. memory.fill(base+96, 0xCC, 16)        — fill 16 bytes with 0xCC
  //  6. memory.copy(base+92, base+96, 16)     — overlapping copy (dest < src)
  //  7. Store verification marker 0xDEADBEEF at heapTop
  var base = module.local.get(0, binaryen.i32);
  module.addFunction(
    'exerciseBulkMemory',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      // 1: fill 32 bytes at base with 0xAA
      module.memory.fill(module.local.get(0, binaryen.i32), module.i32.const(0xaa), module.i32.const(32)),
      // 2: copy 32 bytes from base to base+32 (non-overlapping)
      module.memory.copy(
        module.i32.add(module.local.get(0, binaryen.i32), module.i32.const(32)),
        module.local.get(0, binaryen.i32),
        module.i32.const(32)
      ),
      // 3: fill 16 bytes at base+64 with 0xBB
      module.memory.fill(
        module.i32.add(module.local.get(0, binaryen.i32), module.i32.const(64)),
        module.i32.const(0xbb),
        module.i32.const(16)
      ),
      // 4: overlapping copy — dest > src (base+68 <- base+64, 16 bytes)
      module.memory.copy(
        module.i32.add(module.local.get(0, binaryen.i32), module.i32.const(68)),
        module.i32.add(module.local.get(0, binaryen.i32), module.i32.const(64)),
        module.i32.const(16)
      ),
      // 5: fill 16 bytes at base+96 with 0xCC
      module.memory.fill(
        module.i32.add(module.local.get(0, binaryen.i32), module.i32.const(96)),
        module.i32.const(0xcc),
        module.i32.const(16)
      ),
      // 6: overlapping copy — dest < src (base+92 <- base+96, 16 bytes)
      module.memory.copy(
        module.i32.add(module.local.get(0, binaryen.i32), module.i32.const(92)),
        module.i32.add(module.local.get(0, binaryen.i32), module.i32.const(96)),
        module.i32.const(16)
      ),
      // 7: store marker
      storeI32(module.i32.const(0xdeadbeef | 0)),
      module.return()
    ])
  );
  module.addFunctionExport('exerciseBulkMemory', 'exerciseBulkMemory');

  common.finalizeAndOutput(module);
})();
