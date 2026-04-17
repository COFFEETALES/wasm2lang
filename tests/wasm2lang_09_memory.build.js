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

  var storeI32 = ctx.storeI32;

  var p = function (i) {
    return module.local.get(i, binaryen.i32);
  };
  var i32 = function (n) {
    return module.i32.const(n);
  };

  // ═══════════════════════════════════════════════════════════════════
  // exerciseBulkMemory(base: i32): void  —  from old test 10
  //  1. memory.fill(base, 0xAA, 32)          — fill 32 bytes
  //  2. memory.copy(base+32, base, 32)        — non-overlapping copy
  //  3. memory.fill(base+64, 0xBB, 16)        — fill 16 bytes
  //  4. memory.copy(base+68, base+64, 16)     — overlapping copy (dest > src)
  //  5. memory.fill(base+96, 0xCC, 16)        — fill 16 bytes
  //  6. memory.copy(base+92, base+96, 16)     — overlapping copy (dest < src)
  //  7. Store verification marker 0xDEADBEEF
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseBulkMemory',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      module.memory.fill(p(0), i32(0xaa), i32(32)),
      module.memory.copy(module.i32.add(p(0), i32(32)), p(0), i32(32)),
      module.memory.fill(module.i32.add(p(0), i32(64)), i32(0xbb), i32(16)),
      module.memory.copy(module.i32.add(p(0), i32(68)), module.i32.add(p(0), i32(64)), i32(16)),
      module.memory.fill(module.i32.add(p(0), i32(96)), i32(0xcc), i32(16)),
      module.memory.copy(module.i32.add(p(0), i32(92)), module.i32.add(p(0), i32(96)), i32(16)),
      storeI32(i32(0xdeadbeef | 0)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // exerciseMemoryGrow(): void
  //  1. Store memory.size (should be 8)
  //  2. Store memory.grow(0) (returns current size, no-op)
  //  3. Store memory.size (should still be 8)
  //  4. Store memory.grow(0) a second time (idempotent, exercises dispatch
  //     twice so the JS backend's resizable-ArrayBuffer read path is
  //     evaluated after the first call)
  //  5. Store memory.size (unchanged, still 8)
  //  6. Store marker 0xDEADBEEF
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseMemoryGrow',
    binaryen.none,
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.memory.size()),
      storeI32(module.memory.grow(i32(0))),
      storeI32(module.memory.size()),
      storeI32(module.memory.grow(i32(0))),
      storeI32(module.memory.size()),
      storeI32(i32(0xdeadbeef | 0)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // exerciseBulkFillVerify(base: i32, val: i32, size: i32): void
  //  1. memory.fill(base, val, size)
  //  2. memory.copy(base + size, base, size)
  //  3. Advance heapTop past both regions (aligned to 4)
  //  4. Store marker 0xDEADBEEF
  // params: base(0), val(1), size(2)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseBulkFillVerify',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      module.memory.fill(p(0), p(1), p(2)),
      module.memory.copy(module.i32.add(p(0), p(2)), p(0), p(2)),
      // heapTop = (base + size*2 + 3) & -4
      module.global.set(
        'heapTop',
        module.i32.and(module.i32.add(module.i32.add(p(0), module.i32.add(p(2), p(2))), i32(3)), i32(-4))
      ),
      storeI32(i32(0xdeadbeef | 0)),
      module.return()
    ])
  );

  module.addFunctionExport('exerciseBulkMemory', 'exerciseBulkMemory');
  module.addFunctionExport('exerciseMemoryGrow', 'exerciseMemoryGrow');
  module.addFunctionExport('exerciseBulkFillVerify', 'exerciseBulkFillVerify');

  common.finalizeAndOutput(module);

  // Shared data generation.
  var staticBulk = [
    [0xaa, 32],
    [0xbb, 16],
    [0x00, 64],
    [0xff, 8],
    [0x55, 48]
  ];
  var data = {};
  data.bulk_params = staticBulk.concat(
    Array.from({length: 4}, function () {
      return [common.rand.u8(), ((common.rand.u8() % 61) + 4) & ~3];
    })
  );
  common.emitSharedData(data);
})();
