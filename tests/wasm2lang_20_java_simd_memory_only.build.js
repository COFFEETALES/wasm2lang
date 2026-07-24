'use strict';

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const {module} = common.createTestModule(binaryen, {
    memoryPages: 8,
    heapBase: 1024
  });

  module.setFeatures(binaryen.Features.MVP | binaryen.Features.SIMD128);
  module.addGlobal('copyTrace', binaryen.i32, true, module.i32.const(0));
  module.addFunction(
    'markCopyPointer',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.block(null, [
      module.global.set(
        'copyTrace',
        module.i32.add(
          module.i32.mul(module.global.get('copyTrace', binaryen.i32), module.i32.const(10)),
          module.local.get(0, binaryen.i32)
        )
      ),
      module.return(module.local.get(1, binaryen.i32))
    ])
  );
  module.addFunction(
    'copySIMD16',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.v128.store(0, 1, module.local.get(1, binaryen.i32), module.v128.load(0, 1, module.local.get(0, binaryen.i32)))
  );
  module.addFunction(
    'copySIMD16Effectful',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.block(null, [
      module.global.set('copyTrace', module.i32.const(0)),
      module.v128.store(
        0,
        1,
        module.call('markCopyPointer', [module.i32.const(1), module.local.get(1, binaryen.i32)], binaryen.i32),
        module.v128.load(
          0,
          1,
          module.call('markCopyPointer', [module.i32.const(2), module.local.get(0, binaryen.i32)], binaryen.i32)
        )
      ),
      module.return(module.global.get('copyTrace', binaryen.i32))
    ])
  );
  module.addFunction(
    'getCopyTrace',
    binaryen.none,
    binaryen.i32,
    [],
    module.return(module.global.get('copyTrace', binaryen.i32))
  );
  module.addFunctionExport('copySIMD16', 'copySIMD16');
  module.addFunctionExport('copySIMD16Effectful', 'copySIMD16Effectful');
  module.addFunctionExport('getCopyTrace', 'getCopyTrace');

  common.emitSharedData({});
  common.finalizeAndOutput(module);
})();
