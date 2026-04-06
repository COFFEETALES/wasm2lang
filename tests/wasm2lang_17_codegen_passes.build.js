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
  // fusedWhileSum: Pattern A fusion + while simplification combined.
  //
  // (block $done (loop $loop (br_if $done ...) body (br $loop)))
  //
  // FusionPass fuses $done+$loop. LoopSimplificationPass detects while
  // pattern (entry guard targets immediately enclosing block). Backend
  // must emit: while(!cond) { body } with correct break semantics.
  //
  // params: limit(0)  locals: i(1), sum(2)
  // Returns sum of 0..limit-1.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'fusedWhileSum',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.block('fusedWhileDone', [
        module.loop(
          'fusedWhileLoop',
          module.block(null, [
            module.br('fusedWhileDone', module.i32.ge_s(p(1), p(0))),
            module.local.set(2, module.i32.add(p(2), p(1))),
            module.local.set(1, module.i32.add(p(1), i32(1))),
            module.br('fusedWhileLoop')
          ])
        )
      ]),
      module.return(p(2))
    ])
  );

  // exerciseFusedWhile(limit: i32): void
  module.addFunction(
    'exerciseFusedWhile',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('fusedWhileSum', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // fusedBreakFromNestedIf: Break through a fused block from deeply
  // nested if arms.
  //
  // (block $outer (loop $loop
  //     (if cond1 (then (if cond2 (then (br $outer)))))
  //     body
  //     (br $loop)))
  //
  // FusionPass fuses $outer+$loop. The br $outer from 2 levels of
  // if nesting gets redirected through fusedBlockToLoop. Must emit
  // labeled break, not unlabeled.
  //
  // params: n(0)  locals: i(1), acc(2)
  // Accumulates i*3 until i >= n OR i*3 > 100.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'fusedBreakFromNestedIf',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.block('fusedIfDone', [
        module.loop(
          'fusedIfLoop',
          module.block(null, [
            module.br('fusedIfDone', module.i32.ge_s(p(1), p(0))),
            module.if(
              module.i32.gt_s(module.i32.mul(p(1), i32(3)), i32(100)),
              module.block(null, [module.if(module.i32.gt_s(p(2), i32(0)), module.br('fusedIfDone'))])
            ),
            module.local.set(2, module.i32.add(p(2), module.i32.mul(p(1), i32(3)))),
            module.local.set(1, module.i32.add(p(1), i32(1))),
            module.br('fusedIfLoop')
          ])
        )
      ]),
      module.return(p(2))
    ])
  );

  // exerciseFusedBreakFromIf(n: i32): void
  module.addFunction(
    'exerciseFusedBreakFromIf',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('fusedBreakFromNestedIf', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // nestedWhileLoops: Two nested while-loops. Both should get while
  // simplification. The outer while needs a label because the inner
  // loop's break to $outerDone crosses the inner breakable.
  //
  // Outer: sum rows of a conceptual matrix until sum exceeds threshold.
  // Inner: sum columns per row.
  //
  // params: rows(0), cols(1), threshold(2)
  // locals: r(3), c(4), rowSum(5), totalSum(6)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'nestedWhileLoops',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      module.block('outerWhileDone', [
        module.loop(
          'outerWhileLoop',
          module.block(null, [
            module.br('outerWhileDone', module.i32.ge_s(p(3), p(0))),
            module.local.set(5, i32(0)),
            module.local.set(4, i32(0)),
            module.block('innerWhileDone', [
              module.loop(
                'innerWhileLoop',
                module.block(null, [
                  module.br('innerWhileDone', module.i32.ge_s(p(4), p(1))),
                  // rowSum += (r + 1) * (c + 1)
                  module.local.set(
                    5,
                    module.i32.add(p(5), module.i32.mul(module.i32.add(p(3), i32(1)), module.i32.add(p(4), i32(1))))
                  ),
                  module.local.set(4, module.i32.add(p(4), i32(1))),
                  module.br('innerWhileLoop')
                ])
              )
            ]),
            module.local.set(6, module.i32.add(p(6), p(5))),
            // Early exit if total exceeds threshold
            module.br('outerWhileDone', module.i32.gt_s(p(6), p(2))),
            module.local.set(3, module.i32.add(p(3), i32(1))),
            module.br('outerWhileLoop')
          ])
        )
      ]),
      module.return(p(6))
    ])
  );

  // exerciseNestedWhile(rows: i32, cols: i32, threshold: i32): void
  module.addFunction(
    'exerciseNestedWhile',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('nestedWhileLoops', [p(0), p(1), p(2)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // whileWithInnerContinue: While-loop with explicit continue (br $loop)
  // from inside a nested if. This forces the labeled variant (lw$, not
  // ly$) because containsTargetingBranch_ finds the inner br $loop.
  //
  // params: limit(0)  locals: i(1), sum(2)
  // Sums odd numbers: skips even i via explicit continue.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'whileWithInnerContinue',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.block('whileContinueDone', [
        module.loop(
          'whileContinueLoop',
          module.block(null, [
            module.br('whileContinueDone', module.i32.ge_s(p(1), p(0))),
            module.local.set(1, module.i32.add(p(1), i32(1))),
            // Skip even numbers via explicit continue
            module.if(module.i32.eqz(module.i32.and(p(1), i32(1))), module.br('whileContinueLoop')),
            module.local.set(2, module.i32.add(p(2), p(1))),
            module.br('whileContinueLoop')
          ])
        )
      ]),
      module.return(p(2))
    ])
  );

  // exerciseWhileWithContinue(limit: i32): void
  module.addFunction(
    'exerciseWhileWithContinue',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('whileWithInnerContinue', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // loopDistantExitTarget: Loop with exit guard targeting a block that
  // is NOT the immediately enclosing block ($found wraps the loop,
  // but exit targets $done which is 2 levels up).
  //
  // Tests the LoopSimplificationPass fix: this MUST remain a for-loop,
  // NOT become a while-loop — while-exit would fall through to the
  // found-path code that the original br would have skipped.
  //
  // params: limit(0), target(1)
  // locals: i(2), result(3)
  // Linear search: returns index of target, or -1 if not found.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'loopDistantExitTarget',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(3, i32(-1)),
      module.block('distantDone', [
        module.block('distantFound', [
          module.loop(
            'distantLoop',
            module.block(null, [
              module.br('distantDone', module.i32.ge_s(p(2), p(0))),
              module.br('distantFound', module.i32.eq(p(2), p(1))),
              module.local.set(2, module.i32.add(p(2), i32(1))),
              module.br('distantLoop')
            ])
          )
        ]),
        // Found path: set result to current index
        module.local.set(3, p(2))
      ]),
      module.return(p(3))
    ])
  );

  // exerciseDistantExit(limit: i32, target: i32): void
  module.addFunction(
    'exerciseDistantExit',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('loopDistantExitTarget', [p(0), p(1)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // doWhileBreakOuter: Do-while loop where the body conditionally
  // breaks to an outer block (not the loop itself). Tests that do-while
  // codegen correctly handles breaks that escape the loop.
  //
  // params: start(0)  locals: acc(1), i(2)
  // Doubles acc each iteration, breaks out when acc > 1000.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'doWhileBreakOuter',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(1, module.i32.add(p(0), i32(1))),
      module.block('doWhileOuter', [
        module.loop(
          'doWhileBody',
          module.block(null, [
            module.local.set(1, module.i32.mul(p(1), i32(2))),
            module.local.set(2, module.i32.add(p(2), i32(1))),
            module.if(module.i32.gt_s(p(1), i32(1000)), module.br('doWhileOuter')),
            module.br('doWhileBody', module.i32.lt_s(p(2), i32(20)))
          ])
        )
      ]),
      module.return(p(1))
    ])
  );

  // exerciseDoWhileBreak(start: i32): void
  module.addFunction(
    'exerciseDoWhileBreak',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('doWhileBreakOuter', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // fusedDoWhile: Pattern A fusion where the inner loop is a do-while.
  //
  // (block $done (loop $loop body (br_if $loop cond)))
  //
  // FusionPass fuses $done+$loop. LoopSimplificationPass detects
  // do-while pattern (trailing conditional self-continue). Backend
  // must handle the combined fusion + do-while.
  //
  // params: start(0)  locals: val(1)
  // Repeatedly divides by 2 until odd or zero.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'fusedDoWhile',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.local.set(1, p(0)),
      module.block('fusedDoWhileDone', [
        module.loop(
          'fusedDoWhileLoop',
          module.block(null, [
            module.local.set(1, module.i32.shr_u(p(1), i32(1))),
            module.br(
              'fusedDoWhileLoop',
              module.i32.and(module.i32.gt_s(p(1), i32(0)), module.i32.eqz(module.i32.and(p(1), i32(1))))
            )
          ])
        )
      ]),
      module.return(p(1))
    ])
  );

  // exerciseFusedDoWhile(start: i32): void
  module.addFunction(
    'exerciseFusedDoWhile',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('fusedDoWhile', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // multiBreakValidation: Multiple conditional br_if from inside nested
  // control flow all targeting the same enclosing block. Tests that
  // labeled breaks are emitted correctly when several paths converge.
  //
  // params: a(0), b(1), c(2)  locals: result(3)
  // Validation chain with nested if arms each potentially breaking.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'multiBreakValidation',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.local.set(3, i32(0)),
      module.block('multiBreakDone', [
        module.if(
          module.i32.le_s(p(0), i32(0)),
          module.block(null, [module.local.set(3, i32(-1)), module.br('multiBreakDone')])
        ),
        module.if(
          module.i32.gt_s(p(1), i32(100)),
          module.block(null, [module.local.set(3, i32(-2)), module.br('multiBreakDone')])
        ),
        module.if(module.i32.eqz(p(2)), module.block(null, [module.local.set(3, i32(-3)), module.br('multiBreakDone')])),
        module.local.set(3, module.i32.add(module.i32.add(p(0), p(1)), p(2)))
      ]),
      module.return(p(3))
    ])
  );

  // exerciseMultiBreak(a: i32, b: i32, c: i32): void
  module.addFunction(
    'exerciseMultiBreak',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('multiBreakValidation', [p(0), p(1), p(2)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // ifElseSimple: Single if-then-break + else body.
  //
  // (block $done
  //   (if (ge_s x y) (then (local.set r (sub x y)) (br $done)))
  //   (local.set r (sub y x)))
  //
  // IfElseRecoveryPass restructures to if/else. Backend must emit
  // correct if/else without the block wrapper.
  //
  // params: x(0), y(1)  locals: r(2)
  // Returns abs(x - y).
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'ifElseSimple',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.block('ifElseDone', [
        module.if(
          module.i32.ge_s(p(0), p(1)),
          module.block(null, [module.local.set(2, module.i32.sub(p(0), p(1))), module.br('ifElseDone')])
        ),
        module.local.set(2, module.i32.sub(p(1), p(0)))
      ]),
      module.return(p(2))
    ])
  );

  // exerciseIfElseSimple(x: i32, y: i32): void
  module.addFunction(
    'exerciseIfElseSimple',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('ifElseSimple', [p(0), p(1)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // ifElseKeptLabel: If-then-break with intermediate br $done inside
  // the then-arm. The intermediate reference forces the label to be
  // kept after if-else recovery.
  //
  // (block $done
  //   (if (gt_s a 0) (then
  //     (local.set r a)
  //     (if (gt_s b 50) (then (br $done)))
  //     (local.set r (mul a b))
  //     (br $done)))
  //   (local.set r (add a b)))
  //
  // params: a(0), b(1)  locals: r(2)
  // Returns: a>0 && b>50 → a; a>0 && b<=50 → a*b; else → a+b
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'ifElseKeptLabel',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.block('ifElseKeptDone', [
        module.if(
          module.i32.gt_s(p(0), i32(0)),
          module.block(null, [
            module.local.set(2, p(0)),
            module.if(module.i32.gt_s(p(1), i32(50)), module.br('ifElseKeptDone')),
            module.local.set(2, module.i32.mul(p(0), p(1))),
            module.br('ifElseKeptDone')
          ])
        ),
        module.local.set(2, module.i32.add(p(0), p(1)))
      ]),
      module.return(p(2))
    ])
  );

  // exerciseIfElseKeptLabel(a: i32, b: i32): void
  module.addFunction(
    'exerciseIfElseKeptLabel',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('ifElseKeptLabel', [p(0), p(1)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // Exports
  // ═══════════════════════════════════════════════════════════════════
  module.addFunctionExport('fusedWhileSum', 'fusedWhileSum');
  module.addFunctionExport('exerciseFusedWhile', 'exerciseFusedWhile');
  module.addFunctionExport('fusedBreakFromNestedIf', 'fusedBreakFromNestedIf');
  module.addFunctionExport('exerciseFusedBreakFromIf', 'exerciseFusedBreakFromIf');
  module.addFunctionExport('nestedWhileLoops', 'nestedWhileLoops');
  module.addFunctionExport('exerciseNestedWhile', 'exerciseNestedWhile');
  module.addFunctionExport('whileWithInnerContinue', 'whileWithInnerContinue');
  module.addFunctionExport('exerciseWhileWithContinue', 'exerciseWhileWithContinue');
  module.addFunctionExport('loopDistantExitTarget', 'loopDistantExitTarget');
  module.addFunctionExport('exerciseDistantExit', 'exerciseDistantExit');
  module.addFunctionExport('doWhileBreakOuter', 'doWhileBreakOuter');
  module.addFunctionExport('exerciseDoWhileBreak', 'exerciseDoWhileBreak');
  module.addFunctionExport('fusedDoWhile', 'fusedDoWhile');
  module.addFunctionExport('exerciseFusedDoWhile', 'exerciseFusedDoWhile');
  module.addFunctionExport('multiBreakValidation', 'multiBreakValidation');
  module.addFunctionExport('exerciseMultiBreak', 'exerciseMultiBreak');
  module.addFunctionExport('ifElseSimple', 'ifElseSimple');
  module.addFunctionExport('exerciseIfElseSimple', 'exerciseIfElseSimple');
  module.addFunctionExport('ifElseKeptLabel', 'ifElseKeptLabel');
  module.addFunctionExport('exerciseIfElseKeptLabel', 'exerciseIfElseKeptLabel');

  common.finalizeAndOutput(module);

  // ═══════════════════════════════════════════════════════════════════
  // Shared data
  // ═══════════════════════════════════════════════════════════════════
  var data = {};

  data.fused_while_limits = [0, 1, 5, 10, 20, 100].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 50) | 0;
    })
  );

  data.fused_break_inputs = [0, 1, 5, 10, 20, 34, 50, 100].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 100) | 0;
    })
  );

  data.nested_while_triples = [
    [0, 0, 100],
    [1, 1, 100],
    [3, 3, 100],
    [3, 3, 10],
    [5, 4, 50],
    [10, 10, 1000],
    [4, 5, 30],
    [2, 2, 0]
  ].concat(
    Array.from({length: 4}, function () {
      return [((Math.random() * 8) | 0) + 1, ((Math.random() * 8) | 0) + 1, ((Math.random() * 200) | 0) + 10];
    })
  );

  data.while_continue_limits = [0, 1, 2, 5, 10, 20].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 30) | 0;
    })
  );

  data.distant_exit_pairs = [
    [10, 0],
    [10, 5],
    [10, 9],
    [10, 10],
    [10, -1],
    [1, 0],
    [1, 1],
    [0, 0],
    [5, 3],
    [20, 15]
  ].concat(
    Array.from({length: 4}, function () {
      var lim = ((Math.random() * 20) | 0) + 1;
      return [lim, (Math.random() * (lim + 5)) | 0];
    })
  );

  data.do_while_break_starts = [0, 1, 5, 10, 100, 500, 1000].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 500) | 0;
    })
  );

  data.fused_do_while_inputs = [0, 1, 2, 3, 4, 8, 16, 24, 32, 48, 64, 100, 255, 1024].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 1024) | 0;
    })
  );

  data.multi_break_triples = [
    [1, 50, 1],
    [0, 50, 1],
    [-5, 50, 1],
    [1, 101, 1],
    [1, 50, 0],
    [10, 10, 10],
    [50, 50, 50],
    [1, 100, 1]
  ].concat(
    Array.from({length: 4}, function () {
      return [common.rand.smallI32(), common.rand.smallI32(), common.rand.smallI32()];
    })
  );

  data.if_else_pairs = [
    [0, 0],
    [5, 3],
    [3, 5],
    [10, 10],
    [-1, 5],
    [5, -1],
    [-3, -7],
    [100, 1]
  ].concat(
    Array.from({length: 4}, function () {
      return [common.rand.smallI32(), common.rand.smallI32()];
    })
  );

  data.if_else_kept_pairs = [
    [1, 50],
    [1, 51],
    [-1, 50],
    [0, 50],
    [10, 10],
    [10, 60],
    [5, 5],
    [-5, -5]
  ].concat(
    Array.from({length: 4}, function () {
      return [common.rand.smallI32(), common.rand.smallI32()];
    })
  );

  common.emitSharedData(data);
})();
