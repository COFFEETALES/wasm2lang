'use strict';
(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const {module, heapTop, advanceHeap, storeI32, storeF32, storeF64, storeF64Safe} = common.createTestModule(binaryen, {});

  {
    const p0 = () => module.local.get(0, binaryen.i32);

    // -----------------------------------------------------------------
    // exerciseBrTable: tests br_table (switch) dispatch.
    // Takes an i32 index parameter; each case stores a unique marker
    // to memory.  Called multiple times with different indices.
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseBrTable',
      binaryen.createType([binaryen.i32]),
      binaryen.none,
      [],
      module.block('branchTableDispatchCompleted', [
        module.block('branchTableCaseThree', [
          module.block('branchTableCaseTwo', [
            module.block('branchTableCaseOne', [
              module.block('branchTableCaseZero', [
                module.block('branchTableDefaultCase', [
                  module.switch(
                    ['branchTableCaseZero', 'branchTableCaseOne', 'branchTableCaseTwo', 'branchTableCaseThree'],
                    'branchTableDefaultCase',
                    module.local.get(0, binaryen.i32)
                  )
                ]),
                // default
                storeI32(module.i32.const(0x00def000 | 0)),
                module.break('branchTableDispatchCompleted')
              ]),
              // case 0
              storeI32(module.i32.const(0x00ca5000 | 0)),
              module.break('branchTableDispatchCompleted')
            ]),
            // case 1
            storeI32(module.i32.const(0x00ca5001 | 0)),
            module.break('branchTableDispatchCompleted')
          ]),
          // case 2
          storeI32(module.i32.const(0x00ca5002 | 0)),
          module.break('branchTableDispatchCompleted')
        ]),
        // case 3
        storeI32(module.i32.const(0x00ca5003 | 0))
      ])
    );

    // -----------------------------------------------------------------
    // exerciseBrTableLoop: tests br_table with a loop target.
    // Counts down from param, using br_table to either continue the
    // loop (index 0) or break out (index 1), with default = break.
    // Stores the final counter value.
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseBrTableLoop',
      binaryen.createType([binaryen.i32]),
      binaryen.none,
      [binaryen.i32],
      module.block(null, [
        module.local.set(1, module.local.get(0, binaryen.i32)),
        module.block('branchTableLoopCompleted', [
          module.loop(
            'branchTableLoopIteration',
            module.block(null, [
              module.local.set(1, module.i32.sub(module.local.get(1, binaryen.i32), module.i32.const(1))),
              // if counter > 0 → index 0 (continue loop); else → index 1 (break)
              module.switch(
                ['branchTableLoopIteration', 'branchTableLoopCompleted'],
                'branchTableLoopCompleted',
                module.i32.le_s(module.local.get(1, binaryen.i32), module.i32.const(0))
              )
            ])
          )
        ]),
        storeI32(module.local.get(1, binaryen.i32)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseCountedLoop: LC pattern — parameterized counted loop.
    // Params: (startValue, exclusiveLimit)
    // Stores the sum of startValue..exclusiveLimit-1.
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseCountedLoop',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [binaryen.i32],
      module.block(null, [
        module.local.set(2, module.i32.const(0)),
        module.block('counted-loop-completed', [
          module.loop(
            'counted-loop-iteration',
            module.block(null, [
              module.break(
                'counted-loop-completed',
                module.i32.ge_s(module.local.get(0, binaryen.i32), module.local.get(1, binaryen.i32))
              ),
              module.local.set(2, module.i32.add(module.local.get(2, binaryen.i32), module.local.get(0, binaryen.i32))),
              module.local.set(0, module.i32.add(module.local.get(0, binaryen.i32), module.i32.const(1))),
              module.break('counted-loop-iteration')
            ])
          )
        ]),
        storeI32(module.local.get(2, binaryen.i32)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseDoWhileLoop: LD-B pattern — parameterized do-while.
    // Params: (countdownStart)
    // Positive inputs compute a factorial-style product; non-positive
    // inputs still execute once and take the fallback marker path.
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseDoWhileLoop',
      binaryen.createType([binaryen.i32]),
      binaryen.none,
      [binaryen.i32],
      module.block(null, [
        module.local.set(1, module.i32.const(1)),
        module.loop(
          'do-while.countdown.loop',
          module.block(null, [
            module.if(
              module.i32.gt_s(module.local.get(0, binaryen.i32), module.i32.const(0)),
              module.local.set(1, module.i32.mul(module.local.get(1, binaryen.i32), module.local.get(0, binaryen.i32))),
              module.local.set(1, module.i32.add(module.local.get(1, binaryen.i32), module.i32.const(111)))
            ),
            module.local.set(0, module.i32.sub(module.local.get(0, binaryen.i32), module.i32.const(1))),
            module.break('do-while.countdown.loop', module.i32.gt_s(module.local.get(0, binaryen.i32), module.i32.const(0)))
          ])
        ),
        storeI32(module.local.get(1, binaryen.i32)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseDoWhileVariantA: LD-A pattern — parameterized do-while
    // variant with a trailing conditional self-branch.
    // Params: (startValue, iterationCount)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseDoWhileVariantA',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        module.block('do-while-variant.completed', [
          module.loop(
            'do-while.variant.loop',
            module.block(null, [
              module.local.set(0, module.i32.mul(module.local.get(0, binaryen.i32), module.i32.const(2))),
              module.local.set(1, module.i32.sub(module.local.get(1, binaryen.i32), module.i32.const(1))),
              module.break('do-while.variant.loop', module.i32.gt_s(module.local.get(1, binaryen.i32), module.i32.const(0))),
              module.break('do-while-variant.completed')
            ])
          )
        ]),
        storeI32(module.local.get(0, binaryen.i32)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseNestedLoops: nested loop + switch dispatch.  The inner
    // dispatch mutates its active state across iterations, and the
    // default target exits the inner loop for the current outer round.
    // Params: (outerLimit, initialDispatchState)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseNestedLoops',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [binaryen.i32, binaryen.i32, binaryen.i32],
      module.block(null, [
        module.local.set(2, module.i32.const(0)),
        module.local.set(4, module.i32.const(0)),
        module.block('nestedLoopOuterCompleted', [
          module.loop(
            'nestedLoopOuterIteration',
            module.block(null, [
              module.break(
                'nestedLoopOuterCompleted',
                module.i32.ge_s(module.local.get(2, binaryen.i32), module.local.get(0, binaryen.i32))
              ),
              module.local.set(3, module.i32.const(0)),
              module.block('nestedLoopInnerCompleted', [
                module.loop(
                  'nestedLoopInnerIteration',
                  module.block(null, [
                    module.break(
                      'nestedLoopInnerCompleted',
                      module.i32.gt_s(
                        module.local.get(3, binaryen.i32),
                        module.i32.add(module.local.get(2, binaryen.i32), module.i32.const(1))
                      )
                    ),
                    module.block('nestedLoopDispatchStateTwo', [
                      module.block('nestedLoopDispatchStateOne', [
                        module.block('nestedLoopDispatchStateZero', [
                          module.switch(
                            ['nestedLoopDispatchStateZero', 'nestedLoopDispatchStateOne', 'nestedLoopDispatchStateTwo'],
                            'nestedLoopInnerCompleted',
                            module.local.get(1, binaryen.i32)
                          )
                        ]),
                        module.local.set(
                          4,
                          module.i32.add(
                            module.local.get(4, binaryen.i32),
                            module.i32.add(
                              module.i32.mul(module.local.get(2, binaryen.i32), module.i32.const(16)),
                              module.local.get(3, binaryen.i32)
                            )
                          )
                        ),
                        module.if(
                          module.i32.eq(module.local.get(3, binaryen.i32), module.i32.const(0)),
                          module.local.set(1, module.i32.const(1)),
                          module.local.set(1, module.i32.const(2))
                        ),
                        module.local.set(3, module.i32.add(module.local.get(3, binaryen.i32), module.i32.const(1))),
                        module.break('nestedLoopInnerIteration')
                      ]),
                      module.local.set(
                        4,
                        module.i32.add(
                          module.local.get(4, binaryen.i32),
                          module.i32.add(module.i32.const(100), module.local.get(2, binaryen.i32))
                        )
                      ),
                      module.if(
                        module.i32.and(
                          module.i32.add(module.local.get(2, binaryen.i32), module.local.get(3, binaryen.i32)),
                          module.i32.const(1)
                        ),
                        module.local.set(1, module.i32.const(2)),
                        module.local.set(1, module.i32.const(0))
                      ),
                      module.local.set(3, module.i32.add(module.local.get(3, binaryen.i32), module.i32.const(1))),
                      module.break('nestedLoopInnerIteration')
                    ]),
                    module.local.set(
                      4,
                      module.i32.add(
                        module.local.get(4, binaryen.i32),
                        module.i32.add(module.i32.const(200), module.local.get(3, binaryen.i32))
                      )
                    ),
                    module.if(
                      module.i32.ge_s(module.local.get(3, binaryen.i32), module.local.get(2, binaryen.i32)),
                      module.local.set(1, module.i32.const(7)),
                      module.local.set(1, module.i32.const(0))
                    ),
                    module.local.set(3, module.i32.add(module.local.get(3, binaryen.i32), module.i32.const(1))),
                    module.break('nestedLoopInnerIteration')
                  ])
                )
              ]),
              module.local.set(2, module.i32.add(module.local.get(2, binaryen.i32), module.i32.const(1))),
              module.local.set(1, module.i32.and(module.local.get(2, binaryen.i32), module.i32.const(1))),
              module.break('nestedLoopOuterIteration')
            ])
          )
        ]),
        storeI32(module.local.get(4, binaryen.i32)),
        storeI32(module.local.get(1, binaryen.i32)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseSwitchInLoop: parameterized loop state machine with
    // multi-step transitions before the default exit path completes.
    // Params: (startState, startAccumulator, transitionBudget)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseSwitchInLoop',
      binaryen.createType([binaryen.i32, binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        module.block('switchStateMachineCompleted', [
          module.loop(
            'switchStateMachineLoop',
            module.block(null, [
              module.block('switchStateMachineDispatchStateThree', [
                module.block('switchStateMachineDispatchStateTwo', [
                  module.block('switchStateMachineDispatchStateOne', [
                    module.block('switchStateMachineDispatchStateZero', [
                      module.switch(
                        [
                          'switchStateMachineDispatchStateZero',
                          'switchStateMachineDispatchStateOne',
                          'switchStateMachineDispatchStateTwo',
                          'switchStateMachineDispatchStateThree'
                        ],
                        'switchStateMachineCompleted',
                        module.local.get(0, binaryen.i32)
                      )
                    ]),
                    module.local.set(1, module.i32.add(module.local.get(1, binaryen.i32), module.i32.const(10))),
                    module.local.set(2, module.i32.sub(module.local.get(2, binaryen.i32), module.i32.const(1))),
                    module.if(
                      module.i32.lt_s(module.local.get(1, binaryen.i32), module.i32.const(15)),
                      module.local.set(0, module.i32.const(2)),
                      module.local.set(0, module.i32.const(1))
                    ),
                    module.break('switchStateMachineLoop')
                  ]),
                  module.local.set(1, module.i32.mul(module.local.get(1, binaryen.i32), module.i32.const(2))),
                  module.local.set(2, module.i32.sub(module.local.get(2, binaryen.i32), module.i32.const(1))),
                  module.if(
                    module.i32.gt_s(module.local.get(2, binaryen.i32), module.i32.const(1)),
                    module.local.set(0, module.i32.const(2)),
                    module.local.set(0, module.i32.const(4))
                  ),
                  module.break('switchStateMachineLoop')
                ]),
                module.local.set(1, module.i32.sub(module.local.get(1, binaryen.i32), module.i32.const(3))),
                module.local.set(2, module.i32.sub(module.local.get(2, binaryen.i32), module.i32.const(1))),
                module.if(
                  module.i32.lt_s(module.local.get(1, binaryen.i32), module.i32.const(0)),
                  module.local.set(0, module.i32.const(4)),
                  module.if(
                    module.i32.and(module.local.get(2, binaryen.i32), module.i32.const(1)),
                    module.local.set(0, module.i32.const(1)),
                    module.local.set(0, module.i32.const(0))
                  )
                ),
                module.break('switchStateMachineLoop')
              ]),
              module.local.set(1, module.i32.add(module.local.get(1, binaryen.i32), module.i32.const(70))),
              module.local.set(0, module.i32.const(4)),
              module.break('switchStateMachineLoop')
            ])
          )
        ]),
        storeI32(module.local.get(1, binaryen.i32)),
        storeI32(module.local.get(0, binaryen.i32)),
        storeI32(module.local.get(2, binaryen.i32)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseBrTableMultiTarget: br_table with duplicate targets.
    // Indices 0,2,4 → caseA (0xAABB0001), indices 1,3 → caseB
    // (0xAABB0002), default → 0xAABB00FF.
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseBrTableMultiTarget',
      binaryen.createType([binaryen.i32]),
      binaryen.none,
      [],
      module.block('multiTargetBranchTableCompleted', [
        module.block('multiTargetBranchTableDefaultCase', [
          module.block('multiTargetBranchTableSharedCaseB', [
            module.block('multiTargetBranchTableSharedCaseA', [
              module.switch(
                [
                  'multiTargetBranchTableSharedCaseA',
                  'multiTargetBranchTableSharedCaseB',
                  'multiTargetBranchTableSharedCaseA',
                  'multiTargetBranchTableSharedCaseB',
                  'multiTargetBranchTableSharedCaseA'
                ],
                'multiTargetBranchTableDefaultCase',
                module.local.get(0, binaryen.i32)
              )
            ]),
            storeI32(module.i32.const(0xaabb0001 | 0)),
            module.break('multiTargetBranchTableCompleted')
          ]),
          storeI32(module.i32.const(0xaabb0002 | 0)),
          module.break('multiTargetBranchTableCompleted')
        ]),
        storeI32(module.i32.const(0xaabb00ff | 0))
      ])
    );

    // -----------------------------------------------------------------
    // exerciseNestedSwitch: two independent br_table dispatches — an
    // inner dispatch lives inside outer case 0.  Tests that the
    // detection pass scopes nested dispatch blocks correctly.
    // Params: (outerIndex, innerIndex)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseNestedSwitch',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block('nestedSwitchDispatchCompleted', [
        module.block('nestedSwitchOuterCaseTwo', [
          module.block('nestedSwitchOuterCaseOne', [
            module.block('nestedSwitchOuterCaseZero', [
              module.block('nestedSwitchOuterDefaultCase', [
                module.switch(
                  ['nestedSwitchOuterCaseZero', 'nestedSwitchOuterCaseOne', 'nestedSwitchOuterCaseTwo'],
                  'nestedSwitchOuterDefaultCase',
                  module.local.get(0, binaryen.i32)
                )
              ]),
              // outer default
              storeI32(module.i32.const(0xde000000 | 0)),
              module.break('nestedSwitchDispatchCompleted')
            ]),
            // outer case 0: inner switch on param1
            module.block('nestedSwitchInnerDispatchCompleted', [
              module.block('nestedSwitchInnerCaseOne', [
                module.block('nestedSwitchInnerCaseZero', [
                  module.block('nestedSwitchInnerDefaultCase', [
                    module.switch(
                      ['nestedSwitchInnerCaseZero', 'nestedSwitchInnerCaseOne'],
                      'nestedSwitchInnerDefaultCase',
                      module.local.get(1, binaryen.i32)
                    )
                  ]),
                  // inner default
                  storeI32(module.i32.const(0xde0000ff | 0)),
                  module.break('nestedSwitchInnerDispatchCompleted')
                ]),
                // inner case 0
                storeI32(module.i32.const(0xde000010 | 0)),
                module.break('nestedSwitchInnerDispatchCompleted')
              ]),
              // inner case 1
              storeI32(module.i32.const(0xde000011 | 0))
            ]),
            module.break('nestedSwitchDispatchCompleted')
          ]),
          // outer case 1
          storeI32(module.i32.const(0xde000001 | 0)),
          module.break('nestedSwitchDispatchCompleted')
        ]),
        // outer case 2
        storeI32(module.i32.const(0xde000002 | 0))
      ])
    );

    // -----------------------------------------------------------------
    // exerciseSwitchDefaultInternal: br_table where the default target
    // is an intermediate block in the dispatch chain (not external).
    // Param: (index)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseSwitchDefaultInternal',
      binaryen.createType([binaryen.i32]),
      binaryen.none,
      [],
      module.block('switchDefaultInternalCompleted', [
        module.block('switchDefaultInternalCaseTwo', [
          module.block('switchDefaultInternalCaseOne', [
            module.block('switchDefaultInternalCaseZero', [
              module.switch(
                ['switchDefaultInternalCaseZero', 'switchDefaultInternalCaseOne', 'switchDefaultInternalCaseTwo'],
                'switchDefaultInternalCaseOne',
                module.local.get(0, binaryen.i32)
              )
            ]),
            // case 0
            storeI32(module.i32.const(0xd1000000 | 0)),
            module.break('switchDefaultInternalCompleted')
          ]),
          // case 1 AND default
          storeI32(module.i32.const(0xd1000001 | 0)),
          module.break('switchDefaultInternalCompleted')
        ]),
        // case 2
        storeI32(module.i32.const(0xd1000002 | 0))
      ])
    );

    // -----------------------------------------------------------------
    // exerciseMultiExitSwitchLoop: loop + switch state machine with
    // continued iterations, an alternate outer break, and a distinct
    // default-driven exit path.
    // Params: (startState, startAccumulator)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseMultiExitSwitchLoop',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        module.block('multiExitSwitchExitCompletedPath', [
          module.block('multiExitSwitchExitDefaultPath', [
            module.block('multiExitSwitchExitAlternatePath', [
              module.loop(
                'multiExitSwitchStateMachineLoop',
                module.block(null, [
                  module.block('multiExitSwitchStateThree', [
                    module.block('multiExitSwitchStateTwo', [
                      module.block('multiExitSwitchStateOne', [
                        module.block('multiExitSwitchStateZero', [
                          module.switch(
                            [
                              'multiExitSwitchStateZero',
                              'multiExitSwitchStateOne',
                              'multiExitSwitchStateTwo',
                              'multiExitSwitchStateThree'
                            ],
                            'multiExitSwitchExitDefaultPath',
                            module.local.get(0, binaryen.i32)
                          )
                        ]),
                        module.local.set(1, module.i32.add(module.local.get(1, binaryen.i32), module.i32.const(100))),
                        module.if(
                          module.i32.lt_s(module.local.get(1, binaryen.i32), module.i32.const(130)),
                          module.local.set(0, module.i32.const(1)),
                          module.local.set(0, module.i32.const(3))
                        ),
                        module.break('multiExitSwitchStateMachineLoop')
                      ]),
                      module.local.set(1, module.i32.add(module.local.get(1, binaryen.i32), module.i32.const(20))),
                      module.if(
                        module.i32.and(module.local.get(1, binaryen.i32), module.i32.const(1)),
                        module.local.set(0, module.i32.const(2)),
                        module.local.set(0, module.i32.const(3))
                      ),
                      module.break('multiExitSwitchStateMachineLoop')
                    ]),
                    module.if(
                      module.i32.lt_s(module.local.get(1, binaryen.i32), module.i32.const(0)),
                      module.break('multiExitSwitchExitAlternatePath')
                    ),
                    module.local.set(1, module.i32.sub(module.local.get(1, binaryen.i32), module.i32.const(5))),
                    module.local.set(0, module.i32.const(3)),
                    module.break('multiExitSwitchStateMachineLoop')
                  ]),
                  module.local.set(1, module.i32.add(module.local.get(1, binaryen.i32), module.i32.const(3))),
                  module.break('multiExitSwitchExitCompletedPath')
                ])
              )
            ]),
            storeI32(module.local.get(1, binaryen.i32)),
            storeI32(module.i32.const(0xcccccccc | 0)),
            module.return()
          ]),
          storeI32(module.local.get(1, binaryen.i32)),
          storeI32(module.i32.const(0xbbbbbbbb | 0)),
          module.return()
        ]),
        storeI32(module.local.get(1, binaryen.i32)),
        storeI32(module.i32.const(0xaaaaaaaa | 0)),
        module.return()
      ])
    );

    // -----------------------------------------------------------------
    // exerciseSwitchConditionalEscape: loop + switch (wrapping pattern)
    // where case 2 conditionally escapes; default exits immediately.
    // Params: (startAcc, startState)
    // -----------------------------------------------------------------
    module.addFunction(
      'exerciseSwitchConditionalEscape',
      binaryen.createType([binaryen.i32, binaryen.i32]),
      binaryen.none,
      [],
      module.block(null, [
        module.block('switchConditionalEscapeCompleted', [
          module.loop(
            'switchConditionalEscapeLoop',
            module.block(null, [
              module.block('switchConditionalEscapeStateTwo', [
                module.block('switchConditionalEscapeStateOne', [
                  module.block('switchConditionalEscapeStateZero', [
                    module.switch(
                      [
                        'switchConditionalEscapeStateZero',
                        'switchConditionalEscapeStateOne',
                        'switchConditionalEscapeStateTwo'
                      ],
                      'switchConditionalEscapeCompleted',
                      module.local.get(1, binaryen.i32)
                    )
                  ]),
                  // case 0: acc *= 2, state = 1
                  module.local.set(0, module.i32.mul(module.local.get(0, binaryen.i32), module.i32.const(2))),
                  module.local.set(1, module.i32.const(1)),
                  module.break('switchConditionalEscapeLoop')
                ]),
                // case 1: acc -= 1, state = 2
                module.local.set(0, module.i32.sub(module.local.get(0, binaryen.i32), module.i32.const(1))),
                module.local.set(1, module.i32.const(2)),
                module.break('switchConditionalEscapeLoop')
              ]),
              // case 2 (trailing): conditional escape
              module.if(
                module.i32.gt_s(module.local.get(0, binaryen.i32), module.i32.const(50)),
                module.block(null, [
                  storeI32(module.i32.const(0xeeee0001 | 0)),
                  module.break('switchConditionalEscapeCompleted')
                ]),
                0
              ),
              module.local.set(0, module.i32.add(module.local.get(0, binaryen.i32), module.i32.const(25))),
              module.local.set(1, module.i32.const(0)),
              module.break('switchConditionalEscapeLoop')
            ])
          )
        ]),
        storeI32(module.local.get(0, binaryen.i32)),
        module.return()
      ])
    );
  }

  // Exports
  module.addFunctionExport('exerciseBrTable', 'exerciseBrTable');
  module.addFunctionExport('exerciseBrTableLoop', 'exerciseBrTableLoop');
  module.addFunctionExport('exerciseCountedLoop', 'exerciseCountedLoop');
  module.addFunctionExport('exerciseDoWhileLoop', 'exerciseDoWhileLoop');
  module.addFunctionExport('exerciseDoWhileVariantA', 'exerciseDoWhileVariantA');
  module.addFunctionExport('exerciseNestedLoops', 'exerciseNestedLoops');
  module.addFunctionExport('exerciseSwitchInLoop', 'exerciseSwitchInLoop');
  module.addFunctionExport('exerciseBrTableMultiTarget', 'exerciseBrTableMultiTarget');
  module.addFunctionExport('exerciseNestedSwitch', 'exerciseNestedSwitch');
  module.addFunctionExport('exerciseSwitchDefaultInternal', 'exerciseSwitchDefaultInternal');
  module.addFunctionExport('exerciseMultiExitSwitchLoop', 'exerciseMultiExitSwitchLoop');
  module.addFunctionExport('exerciseSwitchConditionalEscape', 'exerciseSwitchConditionalEscape');

  common.finalizeAndOutput(module);

  // Shared data
  {
    const staticData = {
      branch_indices: [0, 1, 2, 3, 4, -1, 99, -2147483648],
      loop_pairs: [
        [0, 5],
        [2, 2],
        [-2, 3],
        [5, 1],
        [7, 8]
      ],
      loop_countdown_values: [5, 2, 1, 0, -3, 9],
      do_while_values: [5, 1, 0, -3],
      i32_triples: [
        [0, 0, 3],
        [0, 20, 5],
        [2, 9, 4],
        [3, 7, 2],
        [4, 99, 9],
        [-1, 5, 1]
      ]
    };
    const data = {};
    data.branch_indices = staticData.branch_indices.concat(Array.from({length: 6}, () => common.rand.uSmall()));
    data.loop_pairs = staticData.loop_pairs.concat(
      Array.from({length: 6}, () => [common.rand.smallI32(), common.rand.uSmall()])
    );
    data.loop_countdown_values = staticData.loop_countdown_values.concat(Array.from({length: 6}, () => common.rand.uSmall()));
    data.do_while_values = staticData.do_while_values.concat(Array.from({length: 6}, () => common.rand.uSmall()));
    data.i32_triples = staticData.i32_triples.concat(
      Array.from({length: 6}, () => [common.rand.uSmall(), common.rand.i32(), common.rand.uSmall()])
    );
    common.emitSharedData(data);
  }
})();
