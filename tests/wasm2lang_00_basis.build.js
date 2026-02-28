'use strict';

(async function () {
  const harness = await import('../tests/wasm2lang_00_basis.harness.mjs');

  const path = require('path');
  const url = require('url');
  const binaryen = (
    await import(
      url.pathToFileURL(path.join(process.env.NODE_PATH || path.join(process.cwd(), 'node_modules'), 'binaryen', 'index.js'))[
        'href'
      ]
    )
  ).default;

  const module = new binaryen.Module();

  module.setMemory(
    /* initial */ harness.memoryInitialPages,
    /* maximum */ harness.memoryMaximumPages,
    /* exportName */ 'memory',
    [
      {
        passive: false,
        offset: module.i32.const(0),
        data: new Uint8Array([1, 2, 3])
      }
    ],
    /* shared */ false
  );

  {
    const i32 = binaryen.i32;
    const params = binaryen.createType([i32]);

    const n = module.local.get(0, i32);

    const body = module.block(
      null,
      [
        module.i32.const(42)
        //module.local.set(1, module.i32.const(Math.pow(2, 31) - 1)),
        //module.block(null, [
        //  module.local.set(2, module.i32.const(Math.pow(2, 31) - 1)),
        //  module.block(null, [module.local.set(3, module.i32.add(module.local.get(1, i32), module.local.get(2, i32)))])
        //]),
        //module.local.get(3, i32)
      ],
      i32
    );

    module.addFunction('basis0', /* params */ params, /* result */ i32, /* locals */ [i32, i32, i32], body);

    module.addFunctionExport('basis0', 'basis0');
  }

  if (!module.validate()) throw new Error('validation error');

  process.stdout.write(module.emitText());

  return module;
})();
