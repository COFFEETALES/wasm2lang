'use strict';
(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const {module, storeI32} = common.createTestModule(binaryen, {});

  const p0 = () => module.local.get(0, binaryen.i32);

  // Recursive factorial — matches the user-provided WAT:
  //   (func $factorial (param $n i32) (result i32)
  //     (if (result i32)
  //       (i32.le_s (local.get $n) (i32.const 1))
  //       (then (i32.const 1))
  //       (else (i32.mul (local.get $n)
  //               (call $factorial (i32.sub (local.get $n) (i32.const 1)))))))
  module.addFunction(
    'factorial',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.if(
      module.i32.le_s(p0(), module.i32.const(1)),
      module.i32.const(1),
      module.i32.mul(p0(), module.call('factorial', [module.i32.sub(p0(), module.i32.const(1))], binaryen.i32))
    )
  );
  module.addFunctionExport('factorial', 'factorial');

  // Test driver: calls factorial for each input and stores the result.
  module.addFunction(
    'exerciseFactorial',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('factorial', [p0()], binaryen.i32)), module.return()])
  );
  module.addFunctionExport('exerciseFactorial', 'exerciseFactorial');

  common.finalizeAndOutput(module);

  const staticInputs = [0, 1, 2, 3, 5, 7, 10, 12, 13, -1];
  const data = {
    factorial_inputs: staticInputs.concat(Array.from({length: 3}, () => (Math.random() * 13) | 0))
  };
  common.emitSharedData(data);
})();
