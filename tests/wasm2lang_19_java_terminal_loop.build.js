'use strict';

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const {module, storeI32} = common.createTestModule(binaryen, {
    memoryPages: 8,
    heapBase: 1024
  });

  const i32 = value => module.i32.const(value);
  const p = index => module.local.get(index, binaryen.i32);

  // Clang/Binaryen can retain this explicit unreachable after a loop whose
  // only local fallthrough is an unconditional back-edge. The outer branch
  // exits the enclosing block, so the unreachable is statically dead and
  // must not be emitted as a Java statement after an infinite for-loop.
  module.addFunction(
    'terminalLoopWithOuterExit',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.block(null, [
      module.block('terminalLoopExit', [
        module.loop(
          'terminalLoopAgain',
          module.block(null, [module.br('terminalLoopExit', module.local.get(0, binaryen.i32)), module.br('terminalLoopAgain')])
        ),
        module.unreachable()
      ]),
      module.return(i32(73))
    ])
  );

  // A terminal loop may itself be the eager operand of return. It must be
  // emitted as a statement, never prefixed with a target-language `return`.
  module.addFunction(
    'returnTerminalLoop',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.return(
      module.loop(
        'returnTerminalLoopAgain',
        module.block(null, [module.if(p(0), module.return(i32(79))), module.br('returnTerminalLoopAgain')])
      )
    )
  );

  // The same terminal loop can be wrapped in a value operand block retaining
  // an explicit dead unreachable after a normalized binary round-trip.
  module.addFunction(
    'returnBlockWithTerminalLoop',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.return(
      module.block(null, [
        module.loop(
          'returnBlockTerminalAgain',
          module.block(null, [module.if(p(0), module.return(i32(83))), module.br('returnBlockTerminalAgain')])
        ),
        module.unreachable()
      ])
    )
  );

  // If arms are lazy. A terminal loop in the true arm must stay inside that
  // arm and must not make the if, or the following return, unconditionally
  // terminal when the false arm can fall through.
  module.addFunction(
    'lazyIfWithTerminalLoopArm',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.block(null, [
      module.if(
        p(0),
        module.loop(
          'lazyIfTerminalAgain',
          module.block(null, [module.if(p(0), module.return(i32(89))), module.br('lazyIfTerminalAgain')])
        ),
        module.nop()
      ),
      module.return(i32(97))
    ])
  );

  // A tail back-edge nested in a named block is not unavoidable when a branch
  // to that block can skip it. This is the shape emitted by Clang validation
  // loops and must retain normal fallthrough after the loop.
  module.addFunction(
    'tailBackEdgeCanBeBypassed',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.block(null, [
      module.loop(
        'bypassTailAgain',
        module.block(null, [module.block('bypassTail', [module.br('bypassTail', p(0)), module.br('bypassTailAgain')])])
      ),
      module.return(i32(103))
    ])
  );

  // The bypass can be nested in another loop. Label-reference scanning must
  // follow every NodeSchema edge, not only Block.children, or it will miss the
  // branch and incorrectly discard the return after the outer loop.
  module.addFunction(
    'nestedTailBackEdgeCanBeBypassed',
    binaryen.createType([binaryen.i32]),
    binaryen.i32,
    [],
    module.block(null, [
      module.loop(
        'nestedBypassOuterAgain',
        module.block('nestedBypassTail', [
          module.loop(
            'nestedBypassInnerAgain',
            module.block(null, [module.br('nestedBypassTail', p(0)), module.br('nestedBypassInnerAgain')])
          ),
          module.br('nestedBypassOuterAgain')
        ])
      ),
      module.return(i32(107))
    ])
  );

  module.addFunction(
    'exerciseTerminalLoopWithOuterExit',
    binaryen.none,
    binaryen.none,
    [],
    module.block(null, [
      storeI32(module.call('terminalLoopWithOuterExit', [i32(1)], binaryen.i32)),
      storeI32(module.call('returnTerminalLoop', [i32(1)], binaryen.i32)),
      storeI32(module.call('returnBlockWithTerminalLoop', [i32(1)], binaryen.i32)),
      storeI32(module.call('lazyIfWithTerminalLoopArm', [i32(1)], binaryen.i32)),
      storeI32(module.call('lazyIfWithTerminalLoopArm', [i32(0)], binaryen.i32)),
      storeI32(module.call('tailBackEdgeCanBeBypassed', [i32(1)], binaryen.i32)),
      storeI32(module.call('nestedTailBackEdgeCanBeBypassed', [i32(1)], binaryen.i32)),
      module.return()
    ])
  );

  module.addFunctionExport('exerciseTerminalLoopWithOuterExit', 'exerciseTerminalLoopWithOuterExit');
  common.emitSharedData({});
  common.finalizeAndOutput(module);
})();
