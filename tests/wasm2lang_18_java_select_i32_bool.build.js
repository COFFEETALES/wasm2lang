'use strict';

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const {module, storeI32} = common.createTestModule(binaryen, {
    memoryPages: 8,
    heapBase: 1024
  });

  const i32 = value => module.i32.const(value);
  const p = index => module.local.get(index, binaryen.i32);

  // A wasm comparison still has type i32. Java represents the comparison
  // expression as boolean, so a select arm must materialize it as 0 or 1.
  module.addFunction(
    'selectBooleanFalseArm',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.return(module.select(p(0), p(1), module.i32.eq(p(2), i32(7))))
  );

  module.addFunction(
    'selectBooleanTrueArm',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.return(module.select(p(0), module.i32.eq(p(1), i32(7)), p(2)))
  );

  // Value-typed wasm if has the same i32/Java-boolean boundary on each arm.
  module.addFunction(
    'ifBooleanFalseArm',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.return(module.if(p(0), p(1), module.i32.eq(p(2), i32(7))))
  );

  module.addFunction(
    'ifBooleanTrueArm',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.return(module.if(p(0), module.i32.eq(p(1), i32(7)), p(2)))
  );

  module.addFunction(
    'exerciseSelectI32BooleanArms',
    binaryen.none,
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('selectBooleanFalseArm', [i32(1), i32(37), i32(8)], binaryen.i32)),
      storeI32(module.call('selectBooleanFalseArm', [i32(0), i32(37), i32(7)], binaryen.i32)),
      storeI32(module.call('selectBooleanFalseArm', [i32(0), i32(37), i32(8)], binaryen.i32)),
      storeI32(module.call('selectBooleanTrueArm', [i32(1), i32(7), i32(41)], binaryen.i32)),
      storeI32(module.call('selectBooleanTrueArm', [i32(1), i32(8), i32(41)], binaryen.i32)),
      storeI32(module.call('selectBooleanTrueArm', [i32(0), i32(7), i32(41)], binaryen.i32)),
      storeI32(module.call('ifBooleanFalseArm', [i32(1), i32(43), i32(8)], binaryen.i32)),
      storeI32(module.call('ifBooleanFalseArm', [i32(0), i32(43), i32(7)], binaryen.i32)),
      storeI32(module.call('ifBooleanFalseArm', [i32(0), i32(43), i32(8)], binaryen.i32)),
      storeI32(module.call('ifBooleanTrueArm', [i32(1), i32(7), i32(47)], binaryen.i32)),
      storeI32(module.call('ifBooleanTrueArm', [i32(1), i32(8), i32(47)], binaryen.i32)),
      storeI32(module.call('ifBooleanTrueArm', [i32(0), i32(7), i32(47)], binaryen.i32)),
      module.return()
    ])
  );

  module.addFunctionExport('exerciseSelectI32BooleanArms', 'exerciseSelectI32BooleanArms');
  common.emitSharedData({});
  common.finalizeAndOutput(module);
})();
