'use strict';

(async function () {
  const harness = await import('../tests/wasm2lang_01_segments.harness.mjs');
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();

  const expectedData = harness.expectedData;
  const offsetList = harness.offsetList;

  const module = new binaryen.Module();

  module.setFeatures(binaryen.Features.MVP | binaryen.Features.NontrappingFPToInt);

  module.setMemory(
    /* initial */ harness.memoryInitialPages,
    /* maximum */ harness.memoryMaximumPages,
    /* exportName */ 'memory',
    [
      {
        passive: false,
        offset: module.i32.const(0),
        data: Array.prototype.slice.call(new Uint8Array(offsetList.buffer))
      },
      ...expectedData.map((s, i) => ({
        passive: false,
        offset: module.i32.const(offsetList[i]),
        data: s
          .split('')
          .map(x => x.charCodeAt(0))
          .concat(0x0)
      }))
    ],
    /* shared */ false
  );

  module.addGlobal('heapTop', binaryen.i32, /* mutable */ true, module.i32.const(harness.heapBase));

  module.addFunction(
    'alignHeapTop',
    /*params*/ binaryen.none,
    /*result*/ binaryen.none,
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

  module.addFunction(
    'getHeapTop',
    /*params*/ binaryen.none,
    /*result*/ binaryen.i32,
    [],
    module.return(module.global.get('heapTop', binaryen.i32))
  );

  {
    const heapTop = () => module.global.get('heapTop', binaryen.i32);
    const advanceHeap = n => module.global.set('heapTop', module.i32.add(heapTop(), module.i32.const(n)));

    module.addFunction(
      'emitSegmentsToHost',
      /*params*/ binaryen.none,
      /*result*/ binaryen.none,
      [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
      module.block(null, [
        module.loop(
          'emitSegmentsSegmentLoop',
          module.block('emitSegmentsCurrentSegmentCompleted', [
            module.local.set(1, module.i32.load(0, 4, module.i32.mul(module.local.get(0, binaryen.i32), module.i32.const(4)))),
            module.local.set(0, module.i32.add(module.i32.const(1), module.local.get(0, binaryen.i32))),
            module.local.set(2, module.i32.const(0)),
            module.loop(
              'emitSegmentsByteLoop',
              module.block('emitSegmentsCurrentByteCompleted', [
                module.local.set(3, module.i32.load8_u(0, 1, module.local.get(1, binaryen.i32))),
                module.local.set(1, module.i32.add(module.i32.const(1), module.local.get(1, binaryen.i32))),
                module.i32.store8(
                  0,
                  1,
                  // get heap top
                  module.global.get('heapTop', binaryen.i32),
                  module.local.get(3, binaryen.i32)
                ),
                module.global.set('heapTop', module.i32.add(module.global.get('heapTop', binaryen.i32), module.i32.const(1))),
                module.i32.store8(
                  0,
                  1,
                  module.i32.add(module.i32.const(128), module.local.get(2, binaryen.i32)),
                  module.local.get(3, binaryen.i32)
                ),
                module.local.set(2, module.i32.add(module.i32.const(1), module.local.get(2, binaryen.i32))),
                module.if(
                  module.i32.eq(module.local.get(3, binaryen.i32), module.i32.const('X'.charCodeAt(0))),
                  module.block(null, [
                    module.i32.store8(
                      0,
                      1,
                      module.i32.add(module.i32.const(128), module.local.get(2, binaryen.i32)),
                      module.i32.const(0xa)
                    ),
                    module.i32.store8(
                      0,
                      1,
                      module.i32.add(
                        module.i32.const(1),
                        module.i32.add(module.i32.const(128), module.local.get(2, binaryen.i32))
                      ),
                      module.i32.const(0)
                    ),
                    module.i32.store8(0, 1, module.global.get('heapTop', binaryen.i32), module.i32.const(0xa)),
                    module.call('alignHeapTop', [], binaryen.none),
                    module.call('hostOnBufferReady', [], binaryen.none),
                    module.break('emitSegmentsCurrentSegmentCompleted')
                  ]),
                  0
                ),
                module.if(
                  module.i32.eqz(module.local.get(3, binaryen.i32), module.i32.const(0)),
                  module.block(null, [
                    module.call('alignHeapTop', [], binaryen.none),
                    module.call('hostOnBufferReady', [], binaryen.none),
                    module.break('emitSegmentsCurrentByteCompleted')
                  ])
                ),
                module.break('emitSegmentsByteLoop')
              ])
            ),

            module.break(
              'emitSegmentsSegmentLoop',
              module.i32.lt_s(module.local.get(0, binaryen.i32), module.i32.const(expectedData.length))
            )
          ])
        ),
        module.return()
      ])
    );
  }

  module.addFunctionExport('emitSegmentsToHost', 'emitSegmentsToHost');
  module.addFunctionExport('alignHeapTop', 'alignHeapTop');
  module.addFunctionExport('getHeapTop', 'getHeapTop');
  module.addFunctionImport('hostOnBufferReady', 'module', 'hostOnBufferReady', /* params */ binaryen.none, binaryen.none);

  common.finalizeAndOutput(module);
})();
