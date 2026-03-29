'use strict';

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const {module, storeF64} = common.createTestModule(binaryen, {
    memoryPages: 8,
    heapBase: 1024
  });

  // -----------------------------------------------------------------
  // Import stdlib Math functions (1-arg: f64 -> f64).
  // -----------------------------------------------------------------
  var mathFuncs1 = ['acos', 'asin', 'atan', 'cos', 'sin', 'tan', 'exp', 'log', 'ceil', 'floor', 'sqrt', 'abs'];
  for (var i = 0; i < mathFuncs1.length; ++i) {
    module.addFunctionImport(
      '$Math_' + mathFuncs1[i],
      'Math',
      mathFuncs1[i],
      binaryen.createType([binaryen.f64]),
      binaryen.f64
    );
  }

  // -----------------------------------------------------------------
  // Import stdlib Math functions (2-arg: f64 x f64 -> f64).
  // -----------------------------------------------------------------
  var mathFuncs2 = ['min', 'max', 'atan2', 'pow'];
  for (var i = 0; i < mathFuncs2.length; ++i) {
    module.addFunctionImport(
      '$Math_' + mathFuncs2[i],
      'Math',
      mathFuncs2[i],
      binaryen.createType([binaryen.f64, binaryen.f64]),
      binaryen.f64
    );
  }

  // -----------------------------------------------------------------
  // Import Math constants as immutable f64 globals.
  // -----------------------------------------------------------------
  var mathConsts = ['E', 'LN10', 'LN2', 'LOG2E', 'LOG10E', 'PI', 'SQRT1_2', 'SQRT2'];
  for (var i = 0; i < mathConsts.length; ++i) {
    module.addGlobalImport('$Math_' + mathConsts[i], 'Math', mathConsts[i], binaryen.f64);
  }

  // -----------------------------------------------------------------
  // Import Infinity and NaN as immutable f64 globals.
  // -----------------------------------------------------------------
  module.addGlobalImport('$g_Infinity', 'global', 'Infinity', binaryen.f64);
  module.addGlobalImport('$g_NaN', 'global', 'NaN', binaryen.f64);

  // -----------------------------------------------------------------
  // Helper: f64 constant shorthand.
  // -----------------------------------------------------------------
  var f64 = function (v) {
    return module.f64.const(v);
  };

  // -----------------------------------------------------------------
  // exerciseStdlibMath1(): calls each 1-arg Math function with a
  // constant input chosen so the result is exact in IEEE 754,
  // ensuring bit-identical output across JS/PHP/Java.
  // 12 storeF64 = 96 bytes.
  // -----------------------------------------------------------------
  module.addFunction(
    'exerciseStdlibMath1',
    binaryen.none,
    binaryen.none,
    [],
    module.block(null, [
      storeF64(module.call('$Math_acos', [f64(1.0)], binaryen.f64)), // = 0.0
      storeF64(module.call('$Math_asin', [f64(0.0)], binaryen.f64)), // = 0.0
      storeF64(module.call('$Math_atan', [f64(0.0)], binaryen.f64)), // = 0.0
      storeF64(module.call('$Math_cos', [f64(0.0)], binaryen.f64)), // = 1.0
      storeF64(module.call('$Math_sin', [f64(0.0)], binaryen.f64)), // = 0.0
      storeF64(module.call('$Math_tan', [f64(0.0)], binaryen.f64)), // = 0.0
      storeF64(module.call('$Math_exp', [f64(0.0)], binaryen.f64)), // = 1.0
      storeF64(module.call('$Math_log', [f64(1.0)], binaryen.f64)), // = 0.0
      storeF64(module.call('$Math_ceil', [f64(2.5)], binaryen.f64)), // = 3.0
      storeF64(module.call('$Math_floor', [f64(2.5)], binaryen.f64)), // = 2.0
      storeF64(module.call('$Math_sqrt', [f64(4.0)], binaryen.f64)), // = 2.0
      storeF64(module.call('$Math_abs', [f64(-7.0)], binaryen.f64)), // = 7.0
      module.return()
    ])
  );

  // -----------------------------------------------------------------
  // exerciseStdlibMath2(): calls each 2-arg Math function with
  // constant inputs producing exact IEEE 754 results.
  // 4 storeF64 = 32 bytes.
  // -----------------------------------------------------------------
  module.addFunction(
    'exerciseStdlibMath2',
    binaryen.none,
    binaryen.none,
    [],
    module.block(null, [
      storeF64(module.call('$Math_min', [f64(3.0), f64(5.0)], binaryen.f64)), // = 3.0
      storeF64(module.call('$Math_max', [f64(3.0), f64(5.0)], binaryen.f64)), // = 5.0
      storeF64(module.call('$Math_atan2', [f64(0.0), f64(1.0)], binaryen.f64)), // = 0.0
      storeF64(module.call('$Math_pow', [f64(2.0), f64(10.0)], binaryen.f64)), // = 1024.0
      module.return()
    ])
  );

  // -----------------------------------------------------------------
  // exerciseStdlibConstants(): reads all constant globals and the
  // Infinity / NaN globals, stores each as f64.
  // 8 constants + 2 globals = 10 storeF64 = 80 bytes.
  // -----------------------------------------------------------------
  var constBody = [];
  for (var i = 0; i < mathConsts.length; ++i) {
    constBody[constBody.length] = storeF64(module.global.get('$Math_' + mathConsts[i], binaryen.f64));
  }
  constBody[constBody.length] = storeF64(module.global.get('$g_Infinity', binaryen.f64));
  constBody[constBody.length] = storeF64(module.global.get('$g_NaN', binaryen.f64));
  constBody[constBody.length] = module.return();

  module.addFunction('exerciseStdlibConstants', binaryen.none, binaryen.none, [], module.block(null, constBody));

  // -----------------------------------------------------------------
  // exerciseStdlibMath3(): more 1-arg calls with exact IEEE 754 results.
  // 10 storeF64 = 80 bytes.
  // -----------------------------------------------------------------
  module.addFunction(
    'exerciseStdlibMath3',
    binaryen.none,
    binaryen.none,
    [],
    module.block(null, [
      storeF64(module.call('$Math_abs', [f64(-3.0)], binaryen.f64)), // = 3.0
      storeF64(module.call('$Math_abs', [f64(0.0)], binaryen.f64)), // = 0.0
      storeF64(module.call('$Math_sqrt', [f64(9.0)], binaryen.f64)), // = 3.0
      storeF64(module.call('$Math_sqrt', [f64(0.0)], binaryen.f64)), // = 0.0
      storeF64(module.call('$Math_sqrt', [f64(1.0)], binaryen.f64)), // = 1.0
      storeF64(module.call('$Math_ceil', [f64(-2.5)], binaryen.f64)), // = -2.0
      storeF64(module.call('$Math_ceil', [f64(0.0)], binaryen.f64)), // = 0.0
      storeF64(module.call('$Math_floor', [f64(-2.5)], binaryen.f64)), // = -3.0
      storeF64(module.call('$Math_floor', [f64(0.0)], binaryen.f64)), // = 0.0
      storeF64(module.call('$Math_floor', [f64(7.0)], binaryen.f64)), // = 7.0
      module.return()
    ])
  );

  // -----------------------------------------------------------------
  // exerciseStdlibMath4(): more 2-arg calls with exact IEEE 754 results.
  // 10 storeF64 = 80 bytes.
  // -----------------------------------------------------------------
  module.addFunction(
    'exerciseStdlibMath4',
    binaryen.none,
    binaryen.none,
    [],
    module.block(null, [
      storeF64(module.call('$Math_pow', [f64(3.0), f64(3.0)], binaryen.f64)), // = 27.0
      storeF64(module.call('$Math_pow', [f64(2.0), f64(20.0)], binaryen.f64)), // = 1048576.0
      storeF64(module.call('$Math_pow', [f64(1.0), f64(100.0)], binaryen.f64)), // = 1.0
      storeF64(module.call('$Math_min', [f64(-5.0), f64(3.0)], binaryen.f64)), // = -5.0
      storeF64(module.call('$Math_min', [f64(0.0), f64(0.0)], binaryen.f64)), // = 0.0
      storeF64(module.call('$Math_max', [f64(-5.0), f64(3.0)], binaryen.f64)), // = 3.0
      storeF64(module.call('$Math_max', [f64(0.0), f64(0.0)], binaryen.f64)), // = 0.0
      storeF64(module.call('$Math_atan2', [f64(0.0), f64(-1.0)], binaryen.f64)), // = PI
      storeF64(module.call('$Math_atan2', [f64(1.0), f64(0.0)], binaryen.f64)), // = PI/2
      storeF64(module.call('$Math_atan2', [f64(0.0), f64(1.0)], binaryen.f64)), // = 0.0
      module.return()
    ])
  );

  module.addFunctionExport('exerciseStdlibMath1', 'exerciseStdlibMath1');
  module.addFunctionExport('exerciseStdlibMath2', 'exerciseStdlibMath2');
  module.addFunctionExport('exerciseStdlibMath3', 'exerciseStdlibMath3');
  module.addFunctionExport('exerciseStdlibMath4', 'exerciseStdlibMath4');
  module.addFunctionExport('exerciseStdlibConstants', 'exerciseStdlibConstants');

  common.finalizeAndOutput(module);
})();
