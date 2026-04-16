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
  // switchRequiresLabel: Flat switch dispatch where case action code
  // breaks to the outer dispatch block. The switch statement must have
  // a label so `break $outerLabel` resolves correctly.
  //
  // (block $exit
  //   (block $case2 (block $case1 (block $case0
  //     (br_table $case0 $case1 $case2 $exit (local.get $idx)))))
  //   case0: if (idx == 99) { result=77; break $exit; } result=10; break $exit
  //   case1: result=20; break $exit
  //   case2: result=30)
  //
  // params: idx(0)  locals: result(1)
  // Returns: idx=0 → 10 (or 77 if idx==99, but that can't happen since
  //   br_table maps 0→case0). idx=1 → 20. idx=2 → 30. default → 0.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'switchRequiresLabel',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.block('swLabelExit', [
        module.block('swLabelCase2', [
          module.block('swLabelCase1', [
            module.block('swLabelCase0', [
              module.switch(['swLabelCase0', 'swLabelCase1', 'swLabelCase2'], 'swLabelExit', p(0))
            ]),
            // case 0: conditional early exit via br to outer dispatch block
            module.if(
              module.i32.eq(p(0), i32(99)),
              module.block(null, [module.local.set(1, i32(77)), module.br('swLabelExit')])
            ),
            module.local.set(1, i32(10)),
            module.br('swLabelExit')
          ]),
          // case 1
          module.local.set(1, i32(20)),
          module.br('swLabelExit')
        ]),
        // case 2 (default fall-through)
        module.local.set(1, i32(30))
      ]),
      module.return(p(1))
    ])
  );

  // exerciseSwitchRequiresLabel(idx: i32): void
  module.addFunction(
    'exerciseSwitchRequiresLabel',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('switchRequiresLabel', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // nonWrappingDispatch: Flat switch dispatch where the outer dispatch
  // block is NOT the first child of its parent, so the detection pass
  // renames it (sw$) rather than wrapping.  The outer block's trailing
  // children are case action code, not epilogue — the emitter must not
  // route all case breaks through the epilogue path.
  //
  // Structure (before pass):
  //   (local.set $default ...)          ;; makes $exit not first child
  //   (block $exit
  //     (block $case2 (block $case1 (block $case0
  //       (br_table $case0 $case1 $case2 $exit (idx)))))
  //     case0: result = a + b; break $exit
  //     case1: result = a * b; break $exit
  //     case2: result = default)        ;; trailing child — NOT epilogue
  //   (return result)
  //
  // params: idx(0), a(1), b(2)  locals: result(3), default(4)
  // Returns: idx=0 → a+b, idx=1 → a*b, idx=2 → default(a-b),
  //          default(idx>=3) → default(a-b).
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'nonWrappingDispatch',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(4, module.i32.sub(p(1), p(2))),
      module.block('nwExit', [
        module.block('nwCase2', [
          module.block('nwCase1', [
            module.block('nwCase0', [module.switch(['nwCase0', 'nwCase1', 'nwCase2'], 'nwExit', p(0))]),
            // case 0: result = a + b
            module.local.set(3, module.i32.add(p(1), p(2))),
            module.br('nwExit')
          ]),
          // case 1: result = a * b
          module.local.set(3, module.i32.mul(p(1), p(2))),
          module.br('nwExit')
        ]),
        // case 2: result = default (trailing child of $nwExit — not epilogue)
        module.local.set(3, p(4))
      ]),
      module.return(p(3))
    ])
  );

  // exerciseNonWrappingDispatch(idx: i32, a: i32, b: i32): void
  module.addFunction(
    'exerciseNonWrappingDispatch',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('nonWrappingDispatch', [p(0), p(1), p(2)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // wrappingDispatchEpilogue: Flat switch dispatch where the outer dispatch
  // block IS the first child of the loop body with trailing siblings.
  // The detection pass wraps the dispatch + trailing siblings into a new
  // sw$-prefixed block.  The trailing siblings are the epilogue — breaks
  // within the epilogue must target the outer exit block with correct
  // depth (must not count the now-closed switch as an enclosing level).
  //
  // Structure (before pass):
  //   (block $completed
  //     (loop $loop
  //       (block $stateTwo
  //         (block $stateOne (block $stateZero
  //           (br_table $stateZero $stateOne $stateTwo $completed (state))))
  //         case0: idx *= 2; state = 1; br $loop
  //         case1: idx -= 1; state = 2; br $loop)
  //       ;; epilogue — inside loop but after dispatch block:
  //       if (idx > 50) { result = -1; br $completed }
  //       idx += 25; state = 0; br $loop))
  //   result = result || idx
  //
  // params: startIdx(0), startState(1)  locals: result(2)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'wrappingDispatchEpilogue',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.block('wdeCompleted', [
        module.loop(
          'wdeLoop',
          module.block(null, [
            module.block('wdeStateTwo', [
              module.block('wdeStateOne', [
                module.block('wdeStateZero', [
                  module.switch(['wdeStateZero', 'wdeStateOne', 'wdeStateTwo'], 'wdeCompleted', p(1))
                ]),
                // case 0: idx *= 2, state = 1, continue loop
                module.local.set(0, module.i32.mul(p(0), i32(2))),
                module.local.set(1, i32(1)),
                module.br('wdeLoop')
              ]),
              // case 1: idx -= 1, state = 2, continue loop
              module.local.set(0, module.i32.sub(p(0), i32(1))),
              module.local.set(1, i32(2)),
              module.br('wdeLoop')
            ]),
            // epilogue: runs when state == 2 falls through
            module.if(
              module.i32.gt_s(p(0), i32(50)),
              module.block(null, [module.local.set(2, i32(-1)), module.br('wdeCompleted')])
            ),
            module.local.set(0, module.i32.add(p(0), i32(25))),
            module.local.set(1, i32(0)),
            module.br('wdeLoop')
          ])
        )
      ]),
      module.if(module.i32.eqz(p(2)), module.local.set(2, p(0))),
      module.return(p(2))
    ])
  );

  // exerciseWrappingDispatchEpilogue(startIdx: i32, startState: i32): void
  module.addFunction(
    'exerciseWrappingDispatchEpilogue',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('wrappingDispatchEpilogue', [p(0), p(1)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // terminatorDispatch: Flat switch dispatch where intermediate blocks end
  // with `return` rather than unconditional break.  All case actions are
  // terminal, so no synthetic fall-through breaks are needed — the detection
  // pass must accept return/unreachable as valid chain terminators.  The
  // outer block is followed by a trailing value expression (i32.const 0)
  // that acts as the implicit return for the default case.
  //
  // Structure (RPN-style evaluator):
  //   (block $default
  //     (block $mod (block $div (block $mul (block $sub (block $add
  //       (br_table $add $sub $mul $div $mod $default (op))))
  //       (return (a + b))) (return (a - b))) (return (a * b)))
  //       (return (a / b))) (return (a % b)))
  //   (i32.const 0)
  //
  // params: a(0), b(1), op(2)
  // Returns: op=0 → a+b, 1 → a-b, 2 → a*b, 3 → a/b, 4 → a%b, else → 0.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'terminatorDispatch',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [],
    module.block(null, [
      module.block('tdDefault', [
        module.block('tdMod', [
          module.block('tdDiv', [
            module.block('tdMul', [
              module.block('tdSub', [
                module.block('tdAdd', [module.switch(['tdAdd', 'tdSub', 'tdMul', 'tdDiv', 'tdMod'], 'tdDefault', p(2))]),
                module.return(module.i32.add(p(0), p(1)))
              ]),
              module.return(module.i32.sub(p(0), p(1)))
            ]),
            module.return(module.i32.mul(p(0), p(1)))
          ]),
          module.return(module.i32.div_s(p(0), p(1)))
        ]),
        module.return(module.i32.rem_s(p(0), p(1)))
      ]),
      module.return(i32(0))
    ])
  );

  // exerciseTerminatorDispatch(a: i32, b: i32, op: i32): void
  module.addFunction(
    'exerciseTerminatorDispatch',
    binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('terminatorDispatch', [p(0), p(1), p(2)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // guardElisionProduct: Block with leading br_if guard targeting itself.
  //
  // (block $done
  //   (br_if $done (le_s x 0))
  //   (local.set r (mul x 2)))
  //
  // BlockGuardElisionPass inverts the condition and wraps in if-not.
  // No remaining refs → label removed entirely.
  //
  // params: x(0)  locals: r(1)
  // Returns: x > 0 ? x*2 : 0
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'guardElisionProduct',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.block('guardProdDone', [
        module.br('guardProdDone', module.i32.le_s(p(0), i32(0))),
        module.local.set(1, module.i32.mul(p(0), i32(2)))
      ]),
      module.return(p(1))
    ])
  );

  // exerciseGuardElisionProduct(x: i32): void
  module.addFunction(
    'exerciseGuardElisionProduct',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('guardElisionProduct', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // guardElisionRetained: Block with leading br_if guard AND an
  // additional br_if in the body targeting the same block. The label
  // must be kept because of the remaining reference.
  //
  // (block $done
  //   (br_if $done (le_s x 0))
  //   (local.set r x)
  //   (br_if $done (gt_s y 10))
  //   (local.set r (mul x y)))
  //
  // params: x(0), y(1)  locals: r(2)
  // Returns: x <= 0 ? 0 : y > 10 ? x : x*y
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'guardElisionRetained',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.block('guardRetDone', [
        module.br('guardRetDone', module.i32.le_s(p(0), i32(0))),
        module.local.set(2, p(0)),
        module.br('guardRetDone', module.i32.gt_s(p(1), i32(10))),
        module.local.set(2, module.i32.mul(p(0), p(1)))
      ]),
      module.return(p(2))
    ])
  );

  // exerciseGuardElisionRetained(x: i32, y: i32): void
  module.addFunction(
    'exerciseGuardElisionRetained',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('guardElisionRetained', [p(0), p(1)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // redundantLoopBlock: Block wrapping a while-loop where the block
  // label becomes unreferenced after loop simplification consumes the
  // exit guard as the while condition.
  //
  // (block $exit (loop $loop
  //   (br_if $exit (ge_s i n))
  //   body
  //   (br $loop)))
  //
  // After fusion+simplification, $exit is unreferenced with one child.
  // RedundantBlockRemovalPass unwraps the block.
  //
  // params: n(0)  locals: sum(1), i(2)
  // Returns: sum of 0..n-1
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'redundantLoopBlock',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.block('redundantExit', [
        module.loop(
          'redundantLoop',
          module.block(null, [
            module.br('redundantExit', module.i32.ge_s(p(2), p(0))),
            module.local.set(1, module.i32.add(p(1), p(2))),
            module.local.set(2, module.i32.add(p(2), i32(1))),
            module.br('redundantLoop')
          ])
        )
      ]),
      module.return(p(1))
    ])
  );

  // exerciseRedundantLoopBlock(n: i32): void
  module.addFunction(
    'exerciseRedundantLoopBlock',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('redundantLoopBlock', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // localInitFolding: Non-zero local.set(const) before any read are
  // folded into the local declaration. The local.set is elided from
  // the IR and the backend emits the initial value directly.
  //
  // params: n(0)  locals: a(1)=10, b(2)=20, i(3)=0(default)
  // Loops n times, accumulating a*i + b into a running sum.
  // Returns sum.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'localInitFolding',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(1, i32(10)),
      module.local.set(2, i32(20)),
      module.local.set(3, i32(0)),
      module.block('lifDone', [
        module.loop(
          'lifLoop',
          module.block(null, [
            module.br('lifDone', module.i32.ge_s(p(3), p(0))),
            module.local.set(4, module.i32.add(p(4), module.i32.add(module.i32.mul(p(1), p(3)), p(2)))),
            module.local.set(3, module.i32.add(p(3), i32(1))),
            module.br('lifLoop')
          ])
        )
      ]),
      module.return(p(4))
    ])
  );

  // exerciseLocalInitFolding(n: i32): void
  module.addFunction(
    'exerciseLocalInitFolding',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('localInitFolding', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // localInitFoldingMixed: Non-foldable local.set BEFORE foldable ones.
  //
  // This exercises the edge case that caused the black-screen bug:
  // the old counter-based approach counted N foldable sets then
  // skipped the first N local.set instructions in DFS order — but
  // the first local.set here is NON-foldable (uses a parameter),
  // so it would be incorrectly skipped.
  //
  // With the map-based fix:
  //   - local.set 1 (non-foldable: param+100) is emitted normally
  //   - local.set 2 (const 0) is nop'd by normalization (zero fold)
  //   - local.set 3 (const 42) is handled by initOverrides map
  //
  // params: n(0)
  // locals: base(1), acc(2)=0(default), offset(3)=42, i(4)
  // Loops n times, accumulating (base + offset + i) into sum.
  // Returns sum.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'localInitFoldingMixed',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(1, module.i32.add(p(0), i32(100))),
      module.local.set(2, i32(0)),
      module.local.set(3, i32(42)),
      module.block('lifmDone', [
        module.loop(
          'lifmLoop',
          module.block(null, [
            module.br('lifmDone', module.i32.ge_s(p(4), p(0))),
            module.local.set(2, module.i32.add(p(2), module.i32.add(module.i32.add(p(1), p(3)), p(4)))),
            module.local.set(4, module.i32.add(p(4), i32(1))),
            module.br('lifmLoop')
          ])
        )
      ]),
      module.return(p(2))
    ])
  );

  // exerciseLocalInitFoldingMixed(n: i32): void
  module.addFunction(
    'exerciseLocalInitFoldingMixed',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('localInitFoldingMixed', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // multiGuardWhile: Multi-condition while loop — multiple consecutive
  // br_if exit guards at the top of the loop body.
  //
  // (block $done (loop $loop (block
  //   (br_if $done (i32.ge_s i limit))
  //   (br_if $done (i32.eq sum threshold))
  //   body
  //   (br $loop))))
  //
  // Two exit guards both targeting $done must be combined into a single
  // while condition: while (i < limit && sum != threshold) { body }.
  //
  // params: limit(0), threshold(1)  locals: i(2), sum(3)
  // Accumulates i into sum until i >= limit OR sum == threshold.
  // Returns sum.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'multiGuardWhile',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.block('mgwDone', [
        module.loop(
          'mgwLoop',
          module.block(null, [
            module.br('mgwDone', module.i32.ge_s(p(2), p(0))),
            module.br('mgwDone', module.i32.eq(p(3), p(1))),
            module.local.set(3, module.i32.add(p(3), p(2))),
            module.local.set(2, module.i32.add(p(2), i32(1))),
            module.br('mgwLoop')
          ])
        )
      ]),
      module.return(p(3))
    ])
  );

  // exerciseMultiGuardWhile(limit: i32, threshold: i32): void
  module.addFunction(
    'exerciseMultiGuardWhile',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('multiGuardWhile', [p(0), p(1)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // switchNoLabel: Flat switch dispatch where NO case action code
  // contains breaks from within a nested loop. All breaks to chain
  // blocks are equivalent to plain `break` in the enclosing switch, so
  // the switch does not need a label.
  //
  // (block $exit
  //   (block $c1 (block $c0
  //     (br_table $c0 $c1 $exit (local.get $idx)))))
  //   case0: result = x + 1
  //   case1: if (x > 0) { result = x * 2 } else { result = -x }; break $exit
  //   default: result = 0)
  //
  // params: idx(0), x(1)  locals: result(2)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'switchNoLabel',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.block('snlExit', [
        module.block('snlCase1', [
          module.block('snlCase0', [module.switch(['snlCase0', 'snlCase1'], 'snlExit', p(0))]),
          // case 0: simple assignment + break
          module.local.set(2, module.i32.add(p(1), i32(1))),
          module.br('snlExit')
        ]),
        // case 1: nested block (if/else) with break to outer
        module.if(
          module.i32.gt_s(p(1), i32(0)),
          module.local.set(2, module.i32.mul(p(1), i32(2))),
          module.local.set(2, module.i32.sub(i32(0), p(1)))
        ),
        module.br('snlExit')
      ]),
      module.return(p(2))
    ])
  );

  // exerciseSwitchNoLabel(idx: i32, x: i32): void
  module.addFunction(
    'exerciseSwitchNoLabel',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('switchNoLabel', [p(0), p(1)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // fusedForNoLabel: Fused block+loop where the only break exits the
  // loop itself. Since the break is to the fused block (which maps to
  // the loop), and the loop is the innermost breakable, the label
  // should be elided in the output.
  //
  // (block $outer (loop $loop (block
  //   body
  //   (br_if $outer exitCond)
  //   body
  //   (br $loop))))
  //
  // params: limit(0)  locals: i(1), acc(2)
  // Accumulates i*i into acc, breaks when i >= limit.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'fusedForNoLabel',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.block('ffnlDone', [
        module.loop(
          'ffnlLoop',
          module.block(null, [
            module.local.set(2, module.i32.add(p(2), module.i32.mul(p(1), p(1)))),
            module.br('ffnlDone', module.i32.ge_s(module.i32.add(p(1), i32(1)), p(0))),
            module.local.set(1, module.i32.add(p(1), i32(1))),
            module.br('ffnlLoop')
          ])
        )
      ]),
      module.return(p(2))
    ])
  );

  // exerciseFusedForNoLabel(limit: i32): void
  module.addFunction(
    'exerciseFusedForNoLabel',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('fusedForNoLabel', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // noWhileBlockTail: Regression for Rule-2 semantic preservation.
  //
  // (block $exit
  //   (loop $loop
  //     (br_if $exit (ge_s i limit))
  //     (local.set i (add i 1))
  //     (br $loop))
  //   (local.set tail 42))   ;; tail code — block is NOT fused
  // (i32.add i tail)
  //
  // BlockLoopFusionPass does NOT fuse $exit (two children: loop + tail).
  // LoopSimplificationPass MUST keep the loop as for-loop: a while-form
  // would fall through to the tail_set after exit, but the original
  // br $exit skips it.  With bug: tail = 42, result = limit + 42; with
  // fix: tail = 0, result = limit.  Determinism between WASM and asm.js
  // catches the divergence.
  //
  // params: limit(0)  locals: i(1), tail(2)
  // Returns: limit + 0 = limit (correct).  With bug: limit + 42.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'noWhileBlockTail',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.block('nwbtExit', [
        module.loop(
          'nwbtLoop',
          module.block(null, [
            module.br('nwbtExit', module.i32.ge_s(p(1), p(0))),
            module.local.set(1, module.i32.add(p(1), i32(1))),
            module.br('nwbtLoop')
          ])
        ),
        module.local.set(2, i32(42))
      ]),
      module.return(module.i32.add(p(1), p(2)))
    ])
  );

  // exerciseNoWhileBlockTail(limit: i32): void
  module.addFunction(
    'exerciseNoWhileBlockTail',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('noWhileBlockTail', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // ifGuardedWhileInner: LWI pattern (if-guarded labeled while).
  //
  // (loop $L
  //   (if (lt_s i n)
  //     (then
  //       (local.set i (add i 1))
  //       (if (eqz (and i 1)) (br $L))    ;; inner continue → labeled
  //       (local.set acc (add acc i))
  //       (br $L))))
  //
  // LoopSimplificationPass detects this as LWI (labeled while) because the
  // body pre-final children contain a targeting branch ($L) via the nested
  // `if (even) (br $L)`.  Backends emit `while (i < n) { ...; continue L; }`.
  //
  // params: n(0)  locals: i(1), acc(2)
  // Sums odd values of i in (0..n].
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'ifGuardedWhileInner',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.loop(
        'igwiLoop',
        module.if(
          module.i32.lt_s(p(1), p(0)),
          module.block(null, [
            module.local.set(1, module.i32.add(p(1), i32(1))),
            module.if(module.i32.eqz(module.i32.and(p(1), i32(1))), module.br('igwiLoop')),
            module.local.set(2, module.i32.add(p(2), p(1))),
            module.br('igwiLoop')
          ])
        )
      ),
      module.return(p(2))
    ])
  );

  // exerciseIfGuardedWhileInner(n: i32): void
  module.addFunction(
    'exerciseIfGuardedWhileInner',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('ifGuardedWhileInner', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // terminalExitLoop: LCT/LFT pattern (terminal-exit for-loop).
  //
  // (block $exit (loop $L (block
  //   (local.set steps (add steps 1))
  //   (local.set acc (add acc steps))
  //   (if (lt_s steps cap) (br $L))         ;; internal continue path
  //   (br $exit))))                          ;; unconditional final exit
  //
  // Body's last child is unconditional br to outer ($exit), earlier children
  // contain a br $L (internal continue).  LoopSimplificationPass marks this
  // as LCT (labeled) or LFT (unlabeled) depending on inner breakable nesting.
  //
  // params: cap(0)  locals: steps(1), acc(2)
  // Runs steps 1..cap, summing steps into acc.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'terminalExitLoop',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.block('telExit', [
        module.loop(
          'telLoop',
          module.block(null, [
            module.local.set(1, module.i32.add(p(1), i32(1))),
            module.local.set(2, module.i32.add(p(2), p(1))),
            module.if(module.i32.lt_s(p(1), p(0)), module.br('telLoop')),
            module.br('telExit')
          ])
        )
      ]),
      module.return(p(2))
    ])
  );

  // exerciseTerminalExitLoop(cap: i32): void
  module.addFunction(
    'exerciseTerminalExitLoop',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('terminalExitLoop', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // doWhileWithExitTail: LDA/LEA pattern (do-while with trailing exit br).
  //
  // (block $exit (loop $L (block
  //   (local.set acc (add acc i))
  //   (local.set i (add i 1))
  //   (br_if $L (lt_s i limit))             ;; continue-if conditional
  //   (br $exit))))                          ;; unconditional trailing exit
  //
  // Second-to-last is conditional br_if $L, last is unconditional br to outer,
  // body length > 2 ⇒ LoopSimplificationPass marks this LDA/LEA.  Backends
  // emit `do { ... } while (cond);` with no synthetic trailing exit.
  //
  // params: start(0), limit(1)  locals: i(2), acc(3)
  // Accumulates start..(limit-1).  Loop always runs at least once.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'doWhileWithExitTail',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(2, p(0)),
      module.block('dwetExit', [
        module.loop(
          'dwetLoop',
          module.block(null, [
            module.local.set(3, module.i32.add(p(3), p(2))),
            module.local.set(2, module.i32.add(p(2), i32(1))),
            module.br('dwetLoop', module.i32.lt_s(p(2), p(1))),
            module.br('dwetExit')
          ])
        )
      ]),
      module.return(p(3))
    ])
  );

  // exerciseDoWhileWithExitTail(start: i32, limit: i32): void
  module.addFunction(
    'exerciseDoWhileWithExitTail',
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('doWhileWithExitTail', [p(0), p(1)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // bareDoWhileLoop: LEB pattern (bare do-while, no block wrapper).
  //
  // (loop $L (br_if $L (lt_s (local.tee i (add i 1)) limit)))
  //
  // Loop body IS the conditional br (no block wrapper).  Side effects live
  // inside the condition via local.tee.  LoopSimplificationPass marks this
  // as LEB (unlabeled do-while).  Backends emit `do { } while (side-effect
  // cond);` — effectively an empty-body do-while.
  //
  // params: limit(0)  locals: i(1)
  // Counts 1..limit.  After loop, i == limit.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'bareDoWhileLoop',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.loop(
        'bdwlLoop',
        module.br('bdwlLoop', module.i32.lt_s(module.local.tee(1, module.i32.add(p(1), i32(1)), binaryen.i32), p(0)))
      ),
      module.return(p(1))
    ])
  );

  // exerciseBareDoWhileLoop(limit: i32): void
  module.addFunction(
    'exerciseBareDoWhileLoop',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('bareDoWhileLoop', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // switchContinueLoop: LCS/LFS pattern (for-loop ending with br_table
  // where one target is the loop itself = self-continue via switch).
  //
  // (block $exit (loop $L (block
  //   (local.set steps (add steps 1))
  //   (local.set acc (add acc steps))
  //   (br_table [$L $L $L] $exit (i32.rem_u steps 5)))))
  //
  // Body's last child is a SwitchId whose names array contains $L ⇒
  // LoopSimplificationPass marks LCS (labeled) or LFS (unlabeled).
  // Backends emit a for-loop whose bottom dispatch chooses continue/break.
  //
  // params: initAcc(0)  locals: steps(1), acc(2)
  // Runs 3 iterations (steps 1..3), returns initAcc + 1+2+3 = initAcc+6.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'switchContinueLoop',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(2, p(0)),
      module.block('sclExit', [
        module.loop(
          'sclLoop',
          module.block(null, [
            module.local.set(1, module.i32.add(p(1), i32(1))),
            module.local.set(2, module.i32.add(p(2), p(1))),
            module.switch(['sclLoop', 'sclLoop', 'sclLoop'], 'sclExit', module.i32.rem_u(p(1), i32(5)))
          ])
        )
      ]),
      module.return(p(2))
    ])
  );

  // exerciseSwitchContinueLoop(initAcc: i32): void
  module.addFunction(
    'exerciseSwitchContinueLoop',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('switchContinueLoop', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // rootSwitchStateMachine: rs$ pattern (root-switch loop state machine).
  //
  // Outer block + fused block + loop whose body is [sw$ dispatch chain,
  // unconditional br to chain].  RootSwitchDetectionPass marks the outer
  // block with w2l_rootsw$.  Backend collapses the entire structure into
  // a single loop+switch with inlined exit paths.
  //
  // (block $rsOuter
  //   (block $rsFused (loop $rsLoop (block
  //     (block $rsCase2 (block $rsCase1 (block $rsCase0
  //       (br_table [$rsCase0 $rsCase1 $rsCase2] $rsOuter state))
  //       ;; case 0: acc+=1, state=1, br $rsLoop))
  //       ;; case 1: acc+=10, state=2, br $rsLoop)
  //       ;; case 2: acc+=100, br $rsOuter)))
  //     (local.set acc (add acc 1000)))  ;; unreached epilogue (>=2 children)
  //   (return acc))
  //
  // params: initState(0)  locals: state(1), acc(2)
  // Dispatches state transitions until state exits to $rsOuter.
  // state=0 → 1 → 2 → exit (acc = 1 + 10 + 100 = 111)
  // state=1 → 2 → exit (acc = 10 + 100 = 110)
  // state=2 → exit (acc = 100)
  // state>=3 or <0 → default → exit (acc = 0)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'rootSwitchStateMachine',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(1, p(0)),
      module.block('rsOuter', [
        module.block('rsFused', [
          module.loop(
            'rsLoop',
            module.block(null, [
              module.block('rsCase2', [
                module.block('rsCase1', [
                  module.block('rsCase0', [module.switch(['rsCase0', 'rsCase1', 'rsCase2'], 'rsOuter', p(1))]),
                  module.local.set(2, module.i32.add(p(2), i32(1))),
                  module.local.set(1, i32(1)),
                  module.br('rsLoop')
                ]),
                module.local.set(2, module.i32.add(p(2), i32(10))),
                module.local.set(1, i32(2)),
                module.br('rsLoop')
              ]),
              module.local.set(2, module.i32.add(p(2), i32(100))),
              module.br('rsOuter')
            ])
          )
        ]),
        // unreached epilogue — present so $rsOuter has >=2 children (required
        // by RootSwitchDetectionPass to recognize the chain).
        module.local.set(2, module.i32.add(p(2), i32(1000)))
      ]),
      module.return(p(2))
    ])
  );

  // exerciseRootSwitchStateMachine(initState: i32): void
  module.addFunction(
    'exerciseRootSwitchStateMachine',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('rootSwitchStateMachine', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // loopWithNamedBodyBlock: Pattern B fusion — loop whose body is a
  // named block.
  //
  // (loop $L (block $B
  //   (br_if $B (ge_s i limit))              ;; break out of block = loop exit
  //   (local.set acc (add acc i))
  //   (local.set i (add i 1))
  //   (br $L)))                                ;; continue
  //
  // BlockLoopFusionPass detects Pattern B and renames $B → w2l_fused$B.
  // Backend collapses the two nesting levels; `br $B` becomes the loop's
  // break, `br $L` becomes continue.
  //
  // params: limit(0)  locals: i(1), acc(2)
  // Returns sum of 0..limit-1.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'loopWithNamedBodyBlock',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.loop(
        'lwnbLoop',
        module.block('lwnbBody', [
          module.br('lwnbBody', module.i32.ge_s(p(1), p(0))),
          module.local.set(2, module.i32.add(p(2), p(1))),
          module.local.set(1, module.i32.add(p(1), i32(1))),
          module.br('lwnbLoop')
        ])
      ),
      module.return(p(2))
    ])
  );

  // exerciseLoopWithNamedBodyBlock(limit: i32): void
  module.addFunction(
    'exerciseLoopWithNamedBodyBlock',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('loopWithNamedBodyBlock', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // ifElseChainThree: 3-arm if-else chain.
  //
  // (block $done
  //   (if (lt_s x 0)   (then (local.set r -1)  (br $done)))
  //   (if (lt_s x 10)  (then (local.set r 1)   (br $done)))
  //   (if (lt_s x 100) (then (local.set r 10)  (br $done)))
  //   (local.set r 100))
  //
  // IfElseRecoveryPass iteratively restructures if-then-break chains into
  // nested if/else/else chains.  This fixture exercises ≥3 arms to catch
  // bugs in the iterative restructuring loop.
  //
  // params: x(0)  locals: r(1)
  // Returns: x<0→-1, x<10→1, x<100→10, else→100.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'ifElseChainThree',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32],
    module.block(null, [
      module.block('iecDone', [
        module.if(module.i32.lt_s(p(0), i32(0)), module.block(null, [module.local.set(1, i32(-1)), module.br('iecDone')])),
        module.if(module.i32.lt_s(p(0), i32(10)), module.block(null, [module.local.set(1, i32(1)), module.br('iecDone')])),
        module.if(module.i32.lt_s(p(0), i32(100)), module.block(null, [module.local.set(1, i32(10)), module.br('iecDone')])),
        module.local.set(1, i32(100))
      ]),
      module.return(p(1))
    ])
  );

  // exerciseIfElseChainThree(x: i32): void
  module.addFunction(
    'exerciseIfElseChainThree',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('ifElseChainThree', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // localInitRepeatedSet: Same local.set twice with two different const
  // values — only the first folds; the second stays as a regular set.
  //
  // (local.set 1 (i32.const 10))     ;; foldable → initOverrides[1]=10
  // (local.set 1 (i32.const 20))     ;; NOT foldable (setLocals[1] is now
  //                                     true) → stays as runtime assignment
  // (local.set 2 (i32.const 30))     ;; foldable → initOverrides[2]=30
  // (return (x * local[1] + local[2]))
  //
  // After execution: local[1]=20 (runtime overwrite), local[2]=30.
  // Result: x*20 + 30.
  //
  // params: x(0)  locals: a(1), b(2)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'localInitRepeatedSet',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(1, i32(10)),
      module.local.set(1, i32(20)),
      module.local.set(2, i32(30)),
      module.return(module.i32.add(module.i32.mul(p(0), p(1)), p(2)))
    ])
  );

  // exerciseLocalInitRepeatedSet(x: i32): void
  module.addFunction(
    'exerciseLocalInitRepeatedSet',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('localInitRepeatedSet', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // localInitAllZero: Leading local.set(const 0) for multiple locals,
  // no non-zero folds.  Triggers the zeroFoldSet/nop-replacement path
  // without any hasOverrides metadata.
  //
  // (local.set 1 (i32.const 0))      ;; zero fold → nop replacement
  // (local.set 2 (i32.const 0))      ;; zero fold → nop replacement
  // (local.set 3 (i32.const 0))      ;; zero fold → nop replacement
  // (local.set 1 (x + 5))            ;; normal runtime set
  // (local.set 2 (x * 3))
  // (local.set 3 (x - 7))
  // (return a + b + c)
  //
  // Result: (x+5) + (x*3) + (x-7) = 5x - 2.
  //
  // params: x(0)  locals: a(1), b(2), c(3)
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'localInitAllZero',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(1, i32(0)),
      module.local.set(2, i32(0)),
      module.local.set(3, i32(0)),
      module.local.set(1, module.i32.add(p(0), i32(5))),
      module.local.set(2, module.i32.mul(p(0), i32(3))),
      module.local.set(3, module.i32.sub(p(0), i32(7))),
      module.return(module.i32.add(module.i32.add(p(1), p(2)), p(3)))
    ])
  );

  // exerciseLocalInitAllZero(x: i32): void
  module.addFunction(
    'exerciseLocalInitAllZero',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('localInitAllZero', [p(0)], binaryen.i32)), module.return()])
  );

  // ═══════════════════════════════════════════════════════════════════
  // rootValueBlock: function whose root body is an unnamed value-typed
  // block, last child is the value expression.
  //
  // (block (result i32)
  //   (local.set $a (i32.add x 10))
  //   (local.set $b (i32.mul $a 3))
  //   (local.set x  (i32.sub $b x))
  //   (i32.add x $a))
  //
  // Under binaryen:none (no flattening) the root body stays as a Block
  // with a non-void type and no name.  AbstractCodegen must recognize
  // this shape and emit `return <tail>` instead of leaving the tail as
  // a dangling expression followed by the `return 0` stabilizer.
  //
  // params: x(0)  locals: a(1), b(2)
  // Result: a = x+10; b = a*3; x = b-x; return x + a
  //       = (b-x) + a = (3*(x+10) - x) + (x+10) = 3x + 30 + 10 = 3x + 40.
  // ═══════════════════════════════════════════════════════════════════
  module.addFunction(
    'rootValueBlock',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    module.block(
      null,
      [
        module.local.set(1, module.i32.add(p(0), i32(10))),
        module.local.set(2, module.i32.mul(p(1), i32(3))),
        module.local.set(0, module.i32.sub(p(2), p(0))),
        module.i32.add(p(0), p(1))
      ],
      binaryen.i32
    )
  );

  // exerciseRootValueBlock(x: i32): void
  module.addFunction(
    'exerciseRootValueBlock',
    binaryen.createType([binaryen.i32]),
    binaryen.none,
    [],
    module.block(null, [storeI32(module.call('rootValueBlock', [p(0)], binaryen.i32)), module.return()])
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
  module.addFunctionExport('switchRequiresLabel', 'switchRequiresLabel');
  module.addFunctionExport('exerciseSwitchRequiresLabel', 'exerciseSwitchRequiresLabel');
  module.addFunctionExport('nonWrappingDispatch', 'nonWrappingDispatch');
  module.addFunctionExport('exerciseNonWrappingDispatch', 'exerciseNonWrappingDispatch');
  module.addFunctionExport('wrappingDispatchEpilogue', 'wrappingDispatchEpilogue');
  module.addFunctionExport('exerciseWrappingDispatchEpilogue', 'exerciseWrappingDispatchEpilogue');
  module.addFunctionExport('terminatorDispatch', 'terminatorDispatch');
  module.addFunctionExport('exerciseTerminatorDispatch', 'exerciseTerminatorDispatch');
  module.addFunctionExport('guardElisionProduct', 'guardElisionProduct');
  module.addFunctionExport('exerciseGuardElisionProduct', 'exerciseGuardElisionProduct');
  module.addFunctionExport('guardElisionRetained', 'guardElisionRetained');
  module.addFunctionExport('exerciseGuardElisionRetained', 'exerciseGuardElisionRetained');
  module.addFunctionExport('redundantLoopBlock', 'redundantLoopBlock');
  module.addFunctionExport('exerciseRedundantLoopBlock', 'exerciseRedundantLoopBlock');
  module.addFunctionExport('localInitFolding', 'localInitFolding');
  module.addFunctionExport('exerciseLocalInitFolding', 'exerciseLocalInitFolding');
  module.addFunctionExport('localInitFoldingMixed', 'localInitFoldingMixed');
  module.addFunctionExport('exerciseLocalInitFoldingMixed', 'exerciseLocalInitFoldingMixed');
  module.addFunctionExport('multiGuardWhile', 'multiGuardWhile');
  module.addFunctionExport('exerciseMultiGuardWhile', 'exerciseMultiGuardWhile');
  module.addFunctionExport('switchNoLabel', 'switchNoLabel');
  module.addFunctionExport('exerciseSwitchNoLabel', 'exerciseSwitchNoLabel');
  module.addFunctionExport('fusedForNoLabel', 'fusedForNoLabel');
  module.addFunctionExport('exerciseFusedForNoLabel', 'exerciseFusedForNoLabel');
  module.addFunctionExport('noWhileBlockTail', 'noWhileBlockTail');
  module.addFunctionExport('exerciseNoWhileBlockTail', 'exerciseNoWhileBlockTail');
  module.addFunctionExport('ifGuardedWhileInner', 'ifGuardedWhileInner');
  module.addFunctionExport('exerciseIfGuardedWhileInner', 'exerciseIfGuardedWhileInner');
  module.addFunctionExport('terminalExitLoop', 'terminalExitLoop');
  module.addFunctionExport('exerciseTerminalExitLoop', 'exerciseTerminalExitLoop');
  module.addFunctionExport('doWhileWithExitTail', 'doWhileWithExitTail');
  module.addFunctionExport('exerciseDoWhileWithExitTail', 'exerciseDoWhileWithExitTail');
  module.addFunctionExport('bareDoWhileLoop', 'bareDoWhileLoop');
  module.addFunctionExport('exerciseBareDoWhileLoop', 'exerciseBareDoWhileLoop');
  module.addFunctionExport('switchContinueLoop', 'switchContinueLoop');
  module.addFunctionExport('exerciseSwitchContinueLoop', 'exerciseSwitchContinueLoop');
  module.addFunctionExport('rootSwitchStateMachine', 'rootSwitchStateMachine');
  module.addFunctionExport('exerciseRootSwitchStateMachine', 'exerciseRootSwitchStateMachine');
  module.addFunctionExport('loopWithNamedBodyBlock', 'loopWithNamedBodyBlock');
  module.addFunctionExport('exerciseLoopWithNamedBodyBlock', 'exerciseLoopWithNamedBodyBlock');
  module.addFunctionExport('ifElseChainThree', 'ifElseChainThree');
  module.addFunctionExport('exerciseIfElseChainThree', 'exerciseIfElseChainThree');
  module.addFunctionExport('localInitRepeatedSet', 'localInitRepeatedSet');
  module.addFunctionExport('exerciseLocalInitRepeatedSet', 'exerciseLocalInitRepeatedSet');
  module.addFunctionExport('localInitAllZero', 'localInitAllZero');
  module.addFunctionExport('exerciseLocalInitAllZero', 'exerciseLocalInitAllZero');
  module.addFunctionExport('rootValueBlock', 'rootValueBlock');
  module.addFunctionExport('exerciseRootValueBlock', 'exerciseRootValueBlock');

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

  data.switch_requires_label_indices = [0, 1, 2, 3, 4, 5, 10, 100];

  data.non_wrapping_dispatch_triples = [
    [0, 7, 3],
    [1, 7, 3],
    [2, 7, 3],
    [3, 7, 3],
    [4, 7, 3],
    [0, 0, 0],
    [1, 0, 0],
    [2, -5, 10],
    [0, 100, 1],
    [1, 100, 1]
  ];

  data.wrapping_dispatch_epilogue_pairs = [
    [10, 0],
    [10, 1],
    [10, 2],
    [30, 0],
    [30, 2],
    [1, 0],
    [1, 2],
    [0, 0],
    [0, 2],
    [100, 0],
    [100, 2],
    [3, 3]
  ];

  // op=3 (div_s) and op=4 (rem_s) require b != 0 to avoid trapping.
  // All triples are chosen so that division/modulo by zero never occurs.
  data.terminator_dispatch_triples = [
    [5, 3, 0],
    [5, 3, 1],
    [5, 3, 2],
    [10, 3, 3],
    [10, 3, 4],
    [5, 3, 5],
    [5, 3, 10],
    [-10, 5, 0],
    [0, 1, 0],
    [100, 7, 3],
    [100, 7, 4],
    [0, 1, 4],
    [-5, 2, 3],
    [-7, 3, 4]
  ].concat(
    Array.from({length: 4}, function () {
      var a = common.rand.smallI32();
      var b = ((Math.random() * 20) | 0) + 1; // b >= 1 to avoid div-by-zero
      var op = (Math.random() * 7) | 0; // 0..6, covers default branch too
      return [a, b, op];
    })
  );

  data.guard_elision_product_values = [-10, -1, 0, 1, 2, 5, 10, 50, 100].concat(
    Array.from({length: 4}, function () {
      return common.rand.smallI32();
    })
  );

  data.guard_elision_retained_pairs = [
    [0, 0],
    [-1, 5],
    [1, 5],
    [1, 11],
    [5, 10],
    [5, 11],
    [10, 0],
    [10, 20],
    [-5, 15],
    [3, 3]
  ].concat(
    Array.from({length: 4}, function () {
      return [common.rand.smallI32(), common.rand.smallI32()];
    })
  );

  data.redundant_loop_block_limits = [0, 1, 2, 5, 10, 20, 50, 100].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 50) | 0;
    })
  );

  data.local_init_folding_limits = [0, 1, 2, 3, 5, 10, 20, 50].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 100) | 0;
    })
  );

  data.local_init_folding_mixed_limits = [0, 1, 2, 3, 5, 10, 20, 50].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 100) | 0;
    })
  );

  data.multi_guard_while_pairs = [
    [0, 100],
    [1, 100],
    [5, 100],
    [10, 3],
    [10, 10],
    [10, 0],
    [20, 50],
    [100, 1000]
  ].concat(
    Array.from({length: 4}, function () {
      var lim = ((Math.random() * 20) | 0) + 1;
      return [lim, ((Math.random() * 50) | 0) + 1];
    })
  );

  data.switch_no_label_pairs = [
    [0, 5],
    [1, 5],
    [2, 5],
    [0, -3],
    [1, -3],
    [1, 0],
    [0, 0],
    [3, 10]
  ].concat(
    Array.from({length: 4}, function () {
      return [(Math.random() * 4) | 0, common.rand.smallI32()];
    })
  );

  data.fused_for_no_label_limits = [0, 1, 2, 3, 5, 10, 20, 50].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 30) | 0;
    })
  );

  data.no_while_block_tail_limits = [0, 1, 2, 3, 5, 10, 20, 50].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 30) | 0;
    })
  );

  data.if_guarded_while_inner_limits = [0, 1, 2, 5, 10, 20, 50].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 40) | 0;
    })
  );

  data.terminal_exit_loop_caps = [1, 2, 3, 5, 10, 20, 50].concat(
    Array.from({length: 4}, function () {
      return ((Math.random() * 30) | 0) + 1;
    })
  );

  data.do_while_with_exit_tail_pairs = [
    [0, 1],
    [0, 5],
    [5, 5],
    [5, 10],
    [3, 8],
    [10, 10],
    [10, 20]
  ].concat(
    Array.from({length: 4}, function () {
      var start = (Math.random() * 10) | 0;
      return [start, start + ((Math.random() * 20) | 0) + 1];
    })
  );

  data.bare_do_while_loop_limits = [1, 2, 3, 5, 10, 20, 50, 100].concat(
    Array.from({length: 4}, function () {
      return ((Math.random() * 50) | 0) + 1;
    })
  );

  data.switch_continue_loop_initial = [0, 1, 7, 100, -10, 42, 1000].concat(
    Array.from({length: 4}, function () {
      return common.rand.smallI32();
    })
  );

  data.root_switch_state_machine_initial = [0, 1, 2, 3, 4, -1, 100].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 5) | 0;
    })
  );

  data.loop_with_named_body_block_limits = [0, 1, 2, 5, 10, 20, 50].concat(
    Array.from({length: 4}, function () {
      return (Math.random() * 40) | 0;
    })
  );

  data.if_else_chain_three_values = [-10, -1, 0, 1, 5, 9, 10, 50, 99, 100, 200, 1000].concat(
    Array.from({length: 4}, function () {
      return common.rand.smallI32();
    })
  );

  data.local_init_repeated_set_values = [-5, -1, 0, 1, 2, 5, 10, 100].concat(
    Array.from({length: 4}, function () {
      return common.rand.smallI32();
    })
  );

  data.local_init_all_zero_values = [-10, -1, 0, 1, 2, 5, 10, 50].concat(
    Array.from({length: 4}, function () {
      return common.rand.smallI32();
    })
  );

  data.root_value_block_values = [-10, -1, 0, 1, 2, 5, 10, 42, 100, 1000].concat(
    Array.from({length: 4}, function () {
      return common.rand.smallI32();
    })
  );

  common.emitSharedData(data);
})();
