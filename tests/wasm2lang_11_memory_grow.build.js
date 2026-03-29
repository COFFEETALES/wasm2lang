'use strict';

(async function () {
  var common = require('./build_common');
  var binaryen = await common.loadBinaryen();
  var ctx = common.createTestModule(binaryen, {memoryPages: 8, heapBase: 1024});
  var module = ctx.module;

  var heapTop = ctx.heapTop;
  var storeI32 = ctx.storeI32;

  // exerciseMemoryGrow(): void
  //  1. Store memory.size (should be 8 — initial page count)
  //  2. Store memory.grow(0) (should return 8 — no-op grow returns current size)
  //  3. Store memory.size again (should still be 8)
  //  4. Store verification marker 0xDEADBEEF
  module.addFunction(
    'exerciseMemoryGrow',
    binaryen.none,
    binaryen.none,
    [],
    module.block(null, [
      // 1: store memory.size
      storeI32(module.memory.size()),
      // 2: store memory.grow(0) — returns current page count without growing
      storeI32(module.memory.grow(module.i32.const(0))),
      // 3: store memory.size again
      storeI32(module.memory.size()),
      // 4: store marker
      storeI32(module.i32.const(0xdeadbeef | 0)),
      module.return()
    ])
  );
  module.addFunctionExport('exerciseMemoryGrow', 'exerciseMemoryGrow');

  common.finalizeAndOutput(module);
})();
