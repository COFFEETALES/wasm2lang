'use strict';

/**
 * Shared test infrastructure for wasm2lang test build scripts.
 *
 * NOT a test itself — the build_tests.sh discovery pattern only
 * matches wasm2lang_*.build.js, so this file is not picked up.
 */

async function loadBinaryen() {
  const path = require('path');
  const url = require('url');
  return (
    await import(
      url.pathToFileURL(path.join(process.env.NODE_PATH || path.join(process.cwd(), 'node_modules'), 'binaryen', 'index.js'))[
        'href'
      ]
    )
  ).default;
}

/**
 * Creates a WASM test module with common infrastructure:
 * memory, heapTop global, alignHeapTop/getHeapTop functions.
 *
 * @param {Object} binaryen
 * @param {Object} options - { memoryPages?, heapBase?, segments? }
 * @return {{ module, heapTop, advanceHeap, storeI32, storeF32, storeF64, storeF64Safe }}
 */
function createTestModule(binaryen, options) {
  const module = new binaryen.Module();
  module.setFeatures(binaryen.Features.MVP | binaryen.Features.NontrappingFPToInt);

  const memoryPages = options.memoryPages || 8;
  const segments = options.segments || [];
  const heapBase = options.heapBase || 1024;

  module.setMemory(memoryPages, memoryPages, 'memory', segments, false);
  module.addGlobal('heapTop', binaryen.i32, true, module.i32.const(heapBase));

  module.addFunction(
    'alignHeapTop',
    binaryen.none,
    binaryen.none,
    [],
    module.block(null, [
      module.global.set(
        'heapTop',
        module.i32.and(
          module.i32.add(module.global.get('heapTop', binaryen.i32), module.i32.const(255)),
          module.i32.const(~255)
        )
      ),
      module.return()
    ])
  );

  module.addFunction('getHeapTop', binaryen.none, binaryen.i32, [], module.return(module.global.get('heapTop', binaryen.i32)));

  module.addFunctionExport('alignHeapTop', 'alignHeapTop');
  module.addFunctionExport('getHeapTop', 'getHeapTop');

  const heapTop = () => module.global.get('heapTop', binaryen.i32);
  const advanceHeap = n => module.global.set('heapTop', module.i32.add(heapTop(), module.i32.const(n)));
  const storeI32 = value => module.block(null, [module.i32.store(0, 4, heapTop(), value), advanceHeap(4)]);
  const storeF32 = value => module.block(null, [module.f32.store(0, 4, heapTop(), value), advanceHeap(4)]);
  const storeF64 = value => module.block(null, [module.f64.store(0, 8, heapTop(), value), advanceHeap(8)]);
  const storeF64Safe = value => module.block(null, [module.f64.store(0, 4, heapTop(), value), advanceHeap(8)]);

  return {module, heapTop, advanceHeap, storeI32, storeF32, storeF64, storeF64Safe};
}

function finalizeAndOutput(module) {
  if (!module.validate()) throw new Error('validation error');
  process.stdout.write(module.emitText());
}

function emitSharedData(data) {
  let sharedDataPath = '';
  for (let i = 2; i < process.argv.length; ++i) {
    if ('--emit-shared-data' === process.argv[i] && i + 1 < process.argv.length) {
      sharedDataPath = process.argv[++i];
    }
  }
  if (sharedDataPath) {
    require('fs').writeFileSync(sharedDataPath, JSON.stringify(data, null, 2) + '\n');
  }
}

/** Random data generators for fuzz-augmented shared data. */
const rand = {
  i32: () => ((Math.random() * 0xffffffff) >>> 0) - 0x80000000,
  smallI32: () => ((Math.random() * 511) | 0) - 255,
  f32: () => Math.fround((Math.random() - 0.5) * 200),
  f64: () => (Math.random() - 0.5) * 200,
  uF32: () => Math.fround(Math.random() * 100),
  uF64: () => Math.random() * 100,
  uSmall: () => (Math.random() * 10) | 0
};

module.exports = {loadBinaryen, createTestModule, finalizeAndOutput, emitSharedData, rand};
