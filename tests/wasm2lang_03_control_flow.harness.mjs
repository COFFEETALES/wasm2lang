'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  // br_table dispatch — shared branch indices.
  for (const v of data.branch_indices) {
    exports.exerciseBrTable(v);
  }

  // br_table with loop target — shared countdown values.
  for (const v of data.loop_countdown_values) {
    exports.exerciseBrTableLoop(v);
  }

  // Counted loop — shared loop pairs.
  for (const p of data.loop_pairs) {
    exports.exerciseCountedLoop(p[0], p[1]);
  }

  // Do-while countdown — shared do-while values.
  for (const v of data.do_while_values) {
    exports.exerciseDoWhileLoop(v);
  }

  // Do-while variant — function-specific scenarios.
  const invokeScenarios = function (scenarioList, callback) {
    for (const scenario of scenarioList) {
      callback(...scenario);
    }
  };

  invokeScenarios(
    [
      [1, 10],
      [3, 1],
      [7, 0],
      [2, 4]
    ],
    (startValue, iterationCount) => exports.exerciseDoWhileVariantA(startValue, iterationCount)
  );

  // Nested loop + switch dispatch
  invokeScenarios(
    [
      [0, 0],
      [1, 0],
      [3, 0],
      [3, 2],
      [4, -1]
    ],
    (outerLimit, initialDispatchState) => exports.exerciseNestedLoops(outerLimit, initialDispatchState)
  );

  // Loop state machine — shared i32 triples.
  for (const t of data.i32_triples) {
    exports.exerciseSwitchInLoop(t[0], t[1], t[2]);
  }

  // br_table with duplicate targets
  invokeScenarios([[0], [1], [2], [3], [4], [5], [-1], [99]], index => exports.exerciseBrTableMultiTarget(index));

  // Nested switches
  invokeScenarios(
    [
      [0, 0],
      [0, 1],
      [0, -1],
      [0, 5],
      [1, 0],
      [2, 0],
      [-1, 0],
      [9, 0]
    ],
    (outerIndex, innerIndex) => exports.exerciseNestedSwitch(outerIndex, innerIndex)
  );

  // br_table with an internal default target
  invokeScenarios([[0], [1], [2], [3], [-1], [99]], index => exports.exerciseSwitchDefaultInternal(index));

  // Multi-exit loop + switch
  invokeScenarios(
    [
      [0, 0],
      [0, 50],
      [1, 1],
      [2, -5],
      [2, 5],
      [3, 7],
      [-1, 42],
      [9, 42]
    ],
    (startState, startAccumulator) => exports.exerciseMultiExitSwitchLoop(startState, startAccumulator)
  );

  // Conditional escape loop + switch
  invokeScenarios(
    [
      [10, 0],
      [30, 0],
      [1, 0],
      [0, 5],
      [-10, 2],
      [60, 2],
      [5, -1]
    ],
    (startAccumulator, startState) => exports.exerciseSwitchConditionalEscape(startAccumulator, startState)
  );
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
