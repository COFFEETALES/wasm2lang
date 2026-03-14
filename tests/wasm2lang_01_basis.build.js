'use strict';

(async function () {
  const harness = await import('../tests/wasm2lang_01_basis.harness.mjs');

  const path = require('path');
  const url = require('url');
  const binaryen = (
    await import(
      url.pathToFileURL(path.join(process.env.NODE_PATH || path.join(process.cwd(), 'node_modules'), 'binaryen', 'index.js'))[
        'href'
      ]
    )
  ).default;

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
    const p0 = () => module.local.get(0, binaryen.i32);
    const p1 = () => module.local.get(1, binaryen.f32);
    const p2 = () => module.local.get(2, binaryen.f64);
    const heapTop = () => module.global.get('heapTop', binaryen.i32);
    const advanceHeap = (n) => module.global.set('heapTop', module.i32.add(heapTop(), module.i32.const(n)));
    const storeI32 = (value) => module.block(null, [
      module.i32.store(0, 4, heapTop(), value),
      advanceHeap(4)
    ]);
    const storeF32 = (value) => module.block(null, [
      module.f32.store(0, 4, heapTop(), value),
      advanceHeap(4)
    ]);
    const storeF64 = (value) => module.block(null, [
      module.f64.store(0, 8, heapTop(), value),
      advanceHeap(8)
    ]);

    module.addFunction(
      'exerciseMVPOps',
      binaryen.createType([binaryen.i32, binaryen.f32, binaryen.f64]),
      binaryen.none,
      [],
      module.block(null, [
        // i32 binary arithmetic
        storeI32(module.i32.add(p0(), module.i32.const(1))),
        storeI32(module.i32.sub(p0(), module.i32.const(1))),
        storeI32(module.i32.mul(p0(), module.i32.const(3))),
        storeI32(module.i32.div_s(p0(), module.i32.const(2))),
        storeI32(module.i32.div_u(p0(), module.i32.const(2))),
        storeI32(module.i32.rem_s(p0(), module.i32.const(3))),
        storeI32(module.i32.rem_u(p0(), module.i32.const(3))),

        // i32 bitwise
        storeI32(module.i32.and(p0(), module.i32.const(0xFF))),
        storeI32(module.i32.or(p0(), module.i32.const(0xF0))),
        storeI32(module.i32.xor(p0(), module.i32.const(0xAA))),
        storeI32(module.i32.shl(p0(), module.i32.const(4))),
        storeI32(module.i32.shr_s(p0(), module.i32.const(4))),
        storeI32(module.i32.shr_u(p0(), module.i32.const(4))),
        storeI32(module.i32.rotl(p0(), module.i32.const(8))),
        storeI32(module.i32.rotr(p0(), module.i32.const(8))),

        // i32 unary
        storeI32(module.i32.clz(p0())),
        storeI32(module.i32.ctz(p0())),
        storeI32(module.i32.popcnt(p0())),
        storeI32(module.i32.eqz(p0())),

        // i32 comparisons
        storeI32(module.i32.eq(p0(), module.i32.const(42))),
        storeI32(module.i32.ne(p0(), module.i32.const(42))),
        storeI32(module.i32.lt_s(p0(), module.i32.const(42))),
        storeI32(module.i32.lt_u(p0(), module.i32.const(42))),
        storeI32(module.i32.gt_s(p0(), module.i32.const(42))),
        storeI32(module.i32.gt_u(p0(), module.i32.const(42))),
        storeI32(module.i32.le_s(p0(), module.i32.const(42))),
        storeI32(module.i32.le_u(p0(), module.i32.const(42))),
        storeI32(module.i32.ge_s(p0(), module.i32.const(42))),
        storeI32(module.i32.ge_u(p0(), module.i32.const(42))),

        // f32 binary arithmetic
        storeF32(module.f32.add(p1(), module.f32.const(1.0))),
        storeF32(module.f32.sub(p1(), module.f32.const(1.0))),
        storeF32(module.f32.mul(p1(), module.f32.const(2.0))),
        storeF32(module.f32.div(p1(), module.f32.const(2.0))),
        storeF32(module.f32.min(p1(), module.f32.const(0.5))),
        storeF32(module.f32.max(p1(), module.f32.const(0.5))),
        storeF32(module.f32.copysign(p1(), module.f32.const(-1.0))),

        // f32 unary
        storeF32(module.f32.abs(p1())),
        storeF32(module.f32.neg(p1())),
        storeF32(module.f32.ceil(p1())),
        storeF32(module.f32.floor(p1())),
        storeF32(module.f32.trunc(p1())),
        storeF32(module.f32.nearest(p1())),
        storeF32(module.f32.sqrt(module.f32.abs(p1()))),

        // f32 comparisons
        storeI32(module.f32.eq(p1(), module.f32.const(0.0))),
        storeI32(module.f32.ne(p1(), module.f32.const(0.0))),
        storeI32(module.f32.lt(p1(), module.f32.const(0.0))),
        storeI32(module.f32.gt(p1(), module.f32.const(0.0))),
        storeI32(module.f32.le(p1(), module.f32.const(0.0))),
        storeI32(module.f32.ge(p1(), module.f32.const(0.0))),

        // Alignment padding: 49 preceding 4-byte stores leave heapTop at
        // 4 mod 8; one extra store brings it to 0 mod 8 so f64 stores
        // (which declare align=8) land on 8-byte boundaries.
        storeI32(module.i32.const(0)),

        // f64 binary arithmetic
        storeF64(module.f64.add(p2(), module.f64.const(1.0))),
        storeF64(module.f64.sub(p2(), module.f64.const(1.0))),
        storeF64(module.f64.mul(p2(), module.f64.const(2.0))),
        storeF64(module.f64.div(p2(), module.f64.const(2.0))),
        storeF64(module.f64.min(p2(), module.f64.const(0.5))),
        storeF64(module.f64.max(p2(), module.f64.const(0.5))),
        storeF64(module.f64.copysign(p2(), module.f64.const(-1.0))),

        // f64 unary
        storeF64(module.f64.abs(p2())),
        storeF64(module.f64.neg(p2())),
        storeF64(module.f64.ceil(p2())),
        storeF64(module.f64.floor(p2())),
        storeF64(module.f64.trunc(p2())),
        storeF64(module.f64.nearest(p2())),
        storeF64(module.f64.sqrt(module.f64.abs(p2()))),

        // f64 comparisons
        storeI32(module.f64.eq(p2(), module.f64.const(0.0))),
        storeI32(module.f64.ne(p2(), module.f64.const(0.0))),
        storeI32(module.f64.lt(p2(), module.f64.const(0.0))),
        storeI32(module.f64.gt(p2(), module.f64.const(0.0))),
        storeI32(module.f64.le(p2(), module.f64.const(0.0))),
        storeI32(module.f64.ge(p2(), module.f64.const(0.0))),

        // Conversions: integer truncation from float
        storeI32(module.i32.trunc_s.f32(p1())),
        storeI32(module.i32.trunc_u.f32(p1())),
        storeI32(module.i32.trunc_s.f64(p2())),
        storeI32(module.i32.trunc_u.f64(p2())),

        // Conversions: float from integer
        storeF32(module.f32.convert_s.i32(p0())),
        storeF32(module.f32.convert_u.i32(p0())),
        storeF64(module.f64.convert_s.i32(p0())),
        storeF64(module.f64.convert_u.i32(p0())),

        // Conversions: float width (f64.promote first to stay 8-byte aligned)
        storeF64(module.f64.promote(p1())),
        storeF32(module.f32.demote(p2())),

        // Reinterpretations
        storeI32(module.i32.reinterpret(p1())),
        storeF32(module.f32.reinterpret(p0())),

        // Select (conditional ternary)
        storeI32(module.select(p0(), module.i32.const(100), module.i32.const(200))),
        storeI32(module.select(module.i32.const(0), module.i32.const(100), module.i32.const(200))),

        // Non-trapping float-to-int conversions (saturating)
        storeI32(module.i32.trunc_s_sat.f32(p1())),
        storeI32(module.i32.trunc_u_sat.f32(p1())),
        storeI32(module.i32.trunc_s_sat.f64(p2())),
        storeI32(module.i32.trunc_u_sat.f64(p2())),

        // Memory: i32 store/load
        module.i32.store(0, 4, heapTop(), p0()),
        storeI32(module.i32.load(0, 4, heapTop())),

        // Memory: i8 store, load signed, load unsigned
        module.i32.store8(0, 1, heapTop(), p0()),
        storeI32(module.i32.load8_s(0, 1, heapTop())),
        module.i32.store8(0, 1, heapTop(), p0()),
        storeI32(module.i32.load8_u(0, 1, heapTop())),

        // Memory: i16 store, load signed, load unsigned
        module.i32.store16(0, 2, heapTop(), p0()),
        storeI32(module.i32.load16_s(0, 2, heapTop())),
        module.i32.store16(0, 2, heapTop(), p0()),
        storeI32(module.i32.load16_u(0, 2, heapTop())),

        // Memory: f32 store/load
        module.f32.store(0, 4, heapTop(), p1()),
        storeF32(module.f32.load(0, 4, heapTop())),

        // Memory: f64 store/load (pad to restore 8-byte alignment after f32)
        storeI32(module.i32.const(0)),
        module.f64.store(0, 8, heapTop(), p2()),
        storeF64(module.f64.load(0, 8, heapTop())),

        // Drop
        module.drop(p0()),

        module.return()
      ])
    );
  }

  module.addFunction(
    'emitSegmentsToHost',
    /*params*/ binaryen.none,
    /*result*/ binaryen.none,
    [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      module.loop(
        'segmentLoop',
        module.block('segmentBlock', [
          module.local.set(1, module.i32.load(0, 4, module.i32.mul(module.local.get(0, binaryen.i32), module.i32.const(4)))),
          module.local.set(0, module.i32.add(module.i32.const(1), module.local.get(0, binaryen.i32))),
          module.local.set(2, module.i32.const(0)),
          module.loop(
            'byteLoop',
            module.block('byteBlock', [
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
                  module.break('segmentBlock')
                ]),
                0
              ),
              module.if(
                module.i32.eqz(module.local.get(3, binaryen.i32), module.i32.const(0)),
                module.block(null, [
                  module.call('alignHeapTop', [], binaryen.none),
                  module.call('hostOnBufferReady', [], binaryen.none),
                  module.break('byteBlock')
                ])
              ),
              module.break('byteLoop')
            ])
          ),

          module.break(
            'segmentLoop',
            module.i32.lt_s(module.local.get(0, binaryen.i32), module.i32.const(expectedData.length))
          )
        ])
      ),
      module.return()
    ])
  );

  module.addFunctionExport('emitSegmentsToHost', 'emitSegmentsToHost');
  module.addFunctionExport('exerciseMVPOps', 'exerciseMVPOps');
  module.addFunctionExport('alignHeapTop', 'alignHeapTop');
  module.addFunctionExport('getHeapTop', 'getHeapTop');
  module.addFunctionImport('hostOnBufferReady', 'module', 'hostOnBufferReady', /* params */ binaryen.none, binaryen.none);

  if (!module.validate()) throw new Error('validation error');

  process.stdout.write(module.emitText());

  return module;
})();
