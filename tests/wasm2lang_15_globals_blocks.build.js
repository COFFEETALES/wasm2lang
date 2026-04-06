'use strict';

(async function () {
  var common = require('./build_common');
  var binaryen = await common.loadBinaryen();
  var ctx = common.createTestModule(binaryen, {memoryPages: 8, heapBase: 1024});
  var module = ctx.module;
  var storeI32 = ctx.storeI32;
  var heapTop = ctx.heapTop;
  var advanceHeap = ctx.advanceHeap;

  var p = function (i, t) {
    return module.local.get(i, t || binaryen.i32);
  };
  var i32 = function (n) {
    return module.i32.const(n);
  };

  // ═══════════════════════════════════════════════════════════════════
  // Mutable globals for cross-function state testing.
  // Tests GlobalGet, GlobalSet with multiple interacting globals.
  // ═══════════════════════════════════════════════════════════════════
  module.addGlobal('counterA', binaryen.i32, true, i32(0));
  module.addGlobal('counterB', binaryen.i32, true, i32(0));
  module.addGlobal('accumulator', binaryen.i32, true, i32(0));

  var gA = function () {
    return module.global.get('counterA', binaryen.i32);
  };
  var gB = function () {
    return module.global.get('counterB', binaryen.i32);
  };
  var gAcc = function () {
    return module.global.get('accumulator', binaryen.i32);
  };

  // incrementCounterA(n: i32): void
  module.addFunction(
    'incrementCounterA',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.global.set('counterA', module.i32.add(gA(), p(0)))
  );

  // decrementCounterB(n: i32): void
  module.addFunction(
    'decrementCounterB',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.global.set('counterB', module.i32.sub(gB(), p(0)))
  );

  // transferAToB(): void — counterB += counterA; counterA = 0
  module.addFunction(
    'transferAToB',
    binaryen.none,
    binaryen.none,
    [],
    module.block(null, [module.global.set('counterB', module.i32.add(gB(), gA())), module.global.set('counterA', i32(0))])
  );

  // accumulateProduct(): void — accumulator += counterA * counterB
  module.addFunction(
    'accumulateProduct',
    binaryen.none,
    binaryen.none,
    [],
    module.global.set('accumulator', module.i32.add(gAcc(), module.i32.mul(gA(), gB())))
  );

  // resetCounters(): void
  module.addFunction(
    'resetCounters',
    binaryen.none,
    binaryen.none,
    [],
    module.block(null, [
      module.global.set('counterA', i32(0)),
      module.global.set('counterB', i32(0)),
      module.global.set('accumulator', i32(0))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // exerciseGlobals(a: i32, b: i32): void
  // Drives the global-state functions through a deterministic sequence.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseGlobals',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      module.call('resetCounters', [], binaryen.none),
      // counterA = a + b
      module.call('incrementCounterA', [p(0)], binaryen.none),
      module.call('incrementCounterA', [p(1)], binaryen.none),
      storeI32(gA()),
      // counterB = 0 - a = -a
      module.call('decrementCounterB', [p(0)], binaryen.none),
      storeI32(gB()),
      // transfer: counterB = -a + (a+b) = b, counterA = 0
      module.call('transferAToB', [], binaryen.none),
      storeI32(gA()),
      storeI32(gB()),
      // accumulate: accumulator += 0 * b = 0
      module.call('accumulateProduct', [], binaryen.none),
      storeI32(gAcc()),
      // New round: counterA = a+1, counterB = b, accumulate → (a+1)*b
      module.call('resetCounters', [], binaryen.none),
      module.call('incrementCounterA', [module.i32.add(p(0), i32(1))], binaryen.none),
      module.global.set('counterB', p(1)),
      module.call('accumulateProduct', [], binaryen.none),
      storeI32(gAcc()),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // find2D: 2D matrix search with multi-level block breaks.
  //
  // Nested loop pattern where br_if $found breaks TWO levels (past
  // $rowDone, out of $found) and br_if $done skips the found-path.
  // Uses a result local so binaryen cannot fold the block structure
  // away into direct returns — the multi-level break survives to
  // codegen and exercises the fusion pass's label handling.
  //
  // params: ptr(0), rows(1), cols(2), needle(3)
  // locals: r(4), c(5), addr(6), result(7)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'find2D',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(7, i32(-1)),
      module.block('find2DDone', [
        module.block('find2DFound', [
          module.loop(
            'find2DRowLoop',
            module.block(null, [
              module.br('find2DDone', module.i32.ge_u(p(4), p(1))),
              module.local.set(5, i32(0)),
              module.block('find2DRowDone', [
                module.loop(
                  'find2DColLoop',
                  module.block(null, [
                    module.br('find2DRowDone', module.i32.ge_u(p(5), p(2))),
                    module.local.set(
                      6,
                      module.i32.add(p(0), module.i32.shl(module.i32.add(module.i32.mul(p(4), p(2)), p(5)), i32(2)))
                    ),
                    module.br('find2DFound', module.i32.eq(module.i32.load(0, 4, p(6)), p(3))),
                    module.local.set(5, module.i32.add(p(5), i32(1))),
                    module.br('find2DColLoop')
                  ])
                )
              ]),
              module.local.set(4, module.i32.add(p(4), i32(1))),
              module.br('find2DRowLoop')
            ])
          )
        ]),
        // $found: set result to flat index, then fall through $done
        module.local.set(7, module.i32.add(module.i32.mul(p(4), p(2)), p(5)))
      ]),
      // $done: result is -1 (not found) or flat index (found)
      module.return(p(7))
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // exerciseFind2D(): void — self-contained matrix search test.
  // Allocates a 4×3 matrix from heap, writes known values, searches.
  // locals: ptr(0)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseFind2D',
    binaryen.none,
    binaryen.none,
    [binaryen.i32],
    module.block(null, [
      // Allocate 48 bytes for 4×3 matrix (12 × i32)
      module.local.set(0, heapTop()),
      advanceHeap(48),
      // Row 0: [10, 20, 30]
      module.i32.store(0, 4, p(0), i32(10)),
      module.i32.store(4, 4, p(0), i32(20)),
      module.i32.store(8, 4, p(0), i32(30)),
      // Row 1: [40, 50, 60]
      module.i32.store(12, 4, p(0), i32(40)),
      module.i32.store(16, 4, p(0), i32(50)),
      module.i32.store(20, 4, p(0), i32(60)),
      // Row 2: [70, 80, 90]
      module.i32.store(24, 4, p(0), i32(70)),
      module.i32.store(28, 4, p(0), i32(80)),
      module.i32.store(32, 4, p(0), i32(90)),
      // Row 3: [42, 99, -1]
      module.i32.store(36, 4, p(0), i32(42)),
      module.i32.store(40, 4, p(0), i32(99)),
      module.i32.store(44, 4, p(0), i32(-1)),
      // Search for various needles
      storeI32(module.call('find2D', [p(0), i32(4), i32(3), i32(50)], binaryen.i32)),
      storeI32(module.call('find2D', [p(0), i32(4), i32(3), i32(42)], binaryen.i32)),
      storeI32(module.call('find2D', [p(0), i32(4), i32(3), i32(-1)], binaryen.i32)),
      storeI32(module.call('find2D', [p(0), i32(4), i32(3), i32(999)], binaryen.i32)),
      storeI32(module.call('find2D', [p(0), i32(4), i32(3), i32(10)], binaryen.i32)),
      storeI32(module.call('find2D', [p(0), i32(4), i32(3), i32(90)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // validateTriple: validation chain with sequential early exits.
  // Multiple br_if to the same $fail block — tests block-break
  // codegen with many conditional exits at the same scope level.
  // params: a(0), b(1), c(2)
  // Returns 1 if: a > 0, b in [1..100], c != 0, a+b < 200.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'validateTriple',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.block(null, [
      module.block('validateFail', [
        module.br('validateFail', module.i32.le_s(p(0), i32(0))),
        module.br('validateFail', module.i32.lt_s(p(1), i32(1))),
        module.br('validateFail', module.i32.gt_s(p(1), i32(100))),
        module.br('validateFail', module.i32.eqz(p(2))),
        module.br('validateFail', module.i32.ge_s(module.i32.add(p(0), p(1)), i32(200))),
        module.return(i32(1))
      ]),
      module.return(i32(0))
    ])
  );

  // exerciseValidation(a: i32, b: i32, c: i32): void
  module.addFunction(
    'exerciseValidation',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('validateTriple', [p(0), p(1), p(2)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // classifyValue: deeply nested if-as-expression returning values.
  // Tests IfId with both branches returning i32 (not void).
  // n < 0 → 0, n < 10 → 1, n < 100 → 2, n < 1000 → 3, else → 4
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'classifyValue',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.if(
      module.i32.lt_s(p(0), i32(0)),
      i32(0),
      module.if(
        module.i32.lt_s(p(0), i32(10)),
        i32(1),
        module.if(module.i32.lt_s(p(0), i32(100)), i32(2), module.if(module.i32.lt_s(p(0), i32(1000)), i32(3), i32(4)))
      )
    )
  );

  // ═══════════════════════════════════════════════════════════════════
  // conditionalMax3: max of three via nested if-expressions.
  // Each branch of the outer if contains another if-expression.
  // params: a(0), b(1), c(2)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'conditionalMax3',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.if(
      module.i32.ge_s(p(0), p(1)),
      module.if(module.i32.ge_s(p(0), p(2)), p(0), p(2)),
      module.if(module.i32.ge_s(p(1), p(2)), p(1), p(2))
    )
  );

  // exerciseIfExpressions(a: i32, b: i32, c: i32): void
  module.addFunction(
    'exerciseIfExpressions',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('classifyValue', [p(0)], binaryen.i32)),
      storeI32(module.call('classifyValue', [p(1)], binaryen.i32)),
      storeI32(module.call('classifyValue', [p(2)], binaryen.i32)),
      storeI32(module.call('conditionalMax3', [p(0), p(1), p(2)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // Mutual recursion: isEvenMR / isOddMR.
  // Tests forward function references and mutual call patterns.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'isEvenMR',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.if(module.i32.eqz(p(0)), i32(1), module.call('isOddMR', [module.i32.sub(p(0), i32(1))], binaryen.i32))
  );

  module.addFunction(
    'isOddMR',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.if(module.i32.eqz(p(0)), i32(0), module.call('isEvenMR', [module.i32.sub(p(0), i32(1))], binaryen.i32))
  );

  // exerciseMutualRecursion(n: i32): void
  module.addFunction(
    'exerciseMutualRecursion',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('isEvenMR', [p(0)], binaryen.i32)),
      storeI32(module.call('isOddMR', [p(0)], binaryen.i32)),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // exerciseDrop(n: i32): void — tests explicit DropId emission.
  // Computes values and drops them, interspersed with real stores.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'exerciseDrop',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [
      module.drop(module.i32.mul(p(0), p(0))),
      storeI32(module.i32.add(p(0), i32(1))),
      module.drop(module.i32.add(p(0), i32(42))),
      storeI32(module.i32.sub(p(0), i32(1))),
      module.return()
    ])
  );

  // ═══════════════════════════════════════════════════════════════════
  // Exports
  // ═══════════════════════════════════════════════════════════════════
  module.addFunctionExport('exerciseGlobals', 'exerciseGlobals');
  module.addFunctionExport('find2D', 'find2D');
  module.addFunctionExport('exerciseFind2D', 'exerciseFind2D');
  module.addFunctionExport('validateTriple', 'validateTriple');
  module.addFunctionExport('exerciseValidation', 'exerciseValidation');
  module.addFunctionExport('classifyValue', 'classifyValue');
  module.addFunctionExport('conditionalMax3', 'conditionalMax3');
  module.addFunctionExport('exerciseIfExpressions', 'exerciseIfExpressions');
  module.addFunctionExport('isEvenMR', 'isEvenMR');
  module.addFunctionExport('isOddMR', 'isOddMR');
  module.addFunctionExport('exerciseMutualRecursion', 'exerciseMutualRecursion');
  module.addFunctionExport('exerciseDrop', 'exerciseDrop');

  common.finalizeAndOutput(module);

  // ═══════════════════════════════════════════════════════════════════
  // Shared data
  // ═══════════════════════════════════════════════════════════════════
  var data = {};

  data.global_pairs = [
    [5, 3],
    [0, 0],
    [-1, 1],
    [100, -50],
    [0x7fffffff, 1]
  ].concat(
    Array.from({length: 4}, function () {
      return [common.rand.smallI32(), common.rand.smallI32()];
    })
  );

  data.validation_triples = [
    [1, 50, 1],
    [0, 50, 1],
    [1, 0, 1],
    [1, 101, 1],
    [1, 50, 0],
    [100, 100, 1],
    [99, 100, 1],
    [-5, 50, 1],
    [1, 1, -1],
    [50, 50, 99]
  ].concat(
    Array.from({length: 4}, function () {
      return [common.rand.smallI32(), common.rand.smallI32(), common.rand.smallI32()];
    })
  );

  data.if_expr_triples = [
    [-5, 0, 500],
    [0, 9, 99],
    [10, 100, 1000],
    [999, 1000, -1],
    [5, 50, 500],
    [42, 42, 42],
    [-100, -100, -100],
    [0, 0, 0]
  ].concat(
    Array.from({length: 4}, function () {
      return [common.rand.smallI32(), common.rand.smallI32(), common.rand.smallI32()];
    })
  );

  data.mutual_recursion_inputs = [0, 1, 2, 3, 4, 5, 10, 15, 20, 25].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 30) | 0;
    })
  );

  data.drop_inputs = [0, 1, -1, 42, 0x7fffffff, -0x80000000 | 0].concat(
    Array.from({length: 4}, function () {
      return common.rand.i32();
    })
  );

  common.emitSharedData(data);
})();
