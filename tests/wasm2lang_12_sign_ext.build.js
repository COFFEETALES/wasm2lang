'use strict';

(async function () {
  var common = require('./build_common');
  var binaryen = await common.loadBinaryen();
  var ctx = common.createTestModule(binaryen, {memoryPages: 8, heapBase: 1024});
  var module = ctx.module;

  // Enable SignExt feature.
  module.setFeatures(binaryen.Features.MVP | binaryen.Features.NontrappingFPToInt | binaryen.Features.SignExt);

  var storeI32 = ctx.storeI32;

  // exerciseSignExt(p0: i32): void
  // Exercises i32.extend8_s and i32.extend16_s with a runtime parameter.
  var p0 = function () {
    return module.local.get(0, binaryen.i32);
  };

  module.addFunction(
    'exerciseSignExt',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      // i32.extend8_s with parameter
      storeI32(module.i32.extend8_s(p0())),
      // i32.extend16_s with parameter
      storeI32(module.i32.extend16_s(p0())),

      // --- i32.extend8_s constant edge cases ---
      // 0x00 → 0
      storeI32(module.i32.extend8_s(module.i32.const(0x00))),
      // 0x7F → 127 (max positive 8-bit signed)
      storeI32(module.i32.extend8_s(module.i32.const(0x7f))),
      // 0x80 → -128 (min negative 8-bit signed)
      storeI32(module.i32.extend8_s(module.i32.const(0x80))),
      // 0xFF → -1
      storeI32(module.i32.extend8_s(module.i32.const(0xff))),
      // 0x100 → 0 (bit 8 not in low byte)
      storeI32(module.i32.extend8_s(module.i32.const(0x100))),
      // 0xDEAD00AB → -85 (only low byte matters: 0xAB = 171, sign-extended)
      storeI32(module.i32.extend8_s(module.i32.const(0xdead00ab | 0))),
      // -1 (0xFFFFFFFF) → -1 (low byte 0xFF sign-extended)
      storeI32(module.i32.extend8_s(module.i32.const(-1))),
      // -128 (0xFFFFFF80) → -128 (low byte 0x80 sign-extended)
      storeI32(module.i32.extend8_s(module.i32.const(-128))),

      // --- i32.extend16_s constant edge cases ---
      // 0x0000 → 0
      storeI32(module.i32.extend16_s(module.i32.const(0x0000))),
      // 0x7FFF → 32767 (max positive 16-bit signed)
      storeI32(module.i32.extend16_s(module.i32.const(0x7fff))),
      // 0x8000 → -32768 (min negative 16-bit signed)
      storeI32(module.i32.extend16_s(module.i32.const(0x8000))),
      // 0xFFFF → -1
      storeI32(module.i32.extend16_s(module.i32.const(0xffff))),
      // 0x10000 → 0 (bit 16 not in low 16 bits)
      storeI32(module.i32.extend16_s(module.i32.const(0x10000))),
      // 0xDEADBEEF → -16657 (low 16 bits 0xBEEF = 48879, sign-extended)
      storeI32(module.i32.extend16_s(module.i32.const(0xdeadbeef | 0))),
      // -1 (0xFFFFFFFF) → -1 (low 16 bits 0xFFFF sign-extended)
      storeI32(module.i32.extend16_s(module.i32.const(-1))),
      // -32768 (0xFFFF8000) → -32768 (low 16 bits 0x8000 sign-extended)
      storeI32(module.i32.extend16_s(module.i32.const(-32768))),

      // --- Nested: extend8_s of extend16_s ---
      // extend8_s(extend16_s(0x80FF)) → extend8_s(-1) → -1
      storeI32(module.i32.extend8_s(module.i32.extend16_s(module.i32.const(0x80ff)))),
      // extend16_s(extend8_s(0x80)) → extend16_s(-128) → -128
      storeI32(module.i32.extend16_s(module.i32.extend8_s(module.i32.const(0x80)))),

      module.return()
    ])
  );

  module.addFunctionExport('exerciseSignExt', 'exerciseSignExt');

  common.finalizeAndOutput(module);

  // Shared data generation.
  var staticData = {
    i32_values: [0, 1, 127, 128, 255, 256, 32767, 32768, 65535, 65536, -1, -128, -32768, 0x12345678, 0xdeadbeef | 0]
  };
  var data = {};
  data.i32_values = staticData.i32_values.concat(
    Array.from({length: 4}, function () {
      return common.rand.i32();
    })
  );
  common.emitSharedData(data);
})();
