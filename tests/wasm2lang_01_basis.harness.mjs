'use strict';

const memoryPageSize = 65536;
const memoryInitialPages = 8;
const memoryMaximumPages = 8;

const expectedData = [
  'hello, world.\n',
  'QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\n',
  'Random string data: ~!@#$%^&*()_+`-={}[]|;:"<>,.?/0123456789\n',
  'segment data 2\n',
  'segment data 3\n',
  'X\n',
  'segment data 4\n'
];

const offsetList = new Int32Array(expectedData.length);
{
  let i = 0;
  offsetList[0] = i = (i + 1024 + 127) & ~127;
  for (let j = 1; j < expectedData.length; ++j) {
    offsetList[+0 + j] = i = (i + expectedData[-1 + j].length + 1 + 127) & ~127;
  }
  var heapBase = (i + expectedData[-1 + expectedData.length].length + 1 + 127) & ~127;
}

let instanceMemoryBuffer = null;
let stdoutWrite = null;

const readZeroTerminatedString = function (memoryBytes, startIndex) {
  let outputBytes = [];
  for (let byteIndex = startIndex; 0 !== memoryBytes[byteIndex]; ++byteIndex) {
    outputBytes[outputBytes.length] = memoryBytes[byteIndex];
  }
  return outputBytes.map(byteValue => String.fromCharCode(byteValue)).join('');
};

let observedData = null;
const moduleImports = {
  'hostOnBufferReady': function () {
    const memoryBytes = new Uint8Array(instanceMemoryBuffer);
    let actualOutput = readZeroTerminatedString(memoryBytes, 128);
    observedData[observedData.length] = actualOutput;
    stdoutWrite(actualOutput);
  }
};

const verifyMVPOps = function (exports, data) {
  exports.alignHeapTop();
  const startOffset = exports.getHeapTop();
  const invokeScenarios = function (scenarioList, callback) {
    for (const scenario of scenarioList) {
      callback(...scenario);
    }
  };

  // MVP ops — shared i32/f32/f64 triples.
  for (const t of data.i32_f32_f64_triples) {
    exports.exerciseMVPOps(t[0], Math.fround(t[1]), t[2]);
  }

  exports.exerciseOverflowOps();
  exports.exerciseEdgeCases();

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
  invokeScenarios(
    [
      [1, 10],
      [3, 1],
      [7, 0],
      [2, 4]
    ],
    (startValue, iterationCount) => exports.exerciseDoWhileVariantA(startValue, iterationCount)
  );

  // Nested loop + switch dispatch — function-specific scenarios.
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

  // br_table with duplicate targets — function-specific (differs from branch_indices).
  invokeScenarios([[0], [1], [2], [3], [4], [5], [-1], [99]], index => exports.exerciseBrTableMultiTarget(index));

  // Nested switches — function-specific scenarios.
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

  // br_table with an internal default target — function-specific subset.
  invokeScenarios([[0], [1], [2], [3], [-1], [99]], index => exports.exerciseSwitchDefaultInternal(index));

  // Multi-exit loop + switch — function-specific scenarios.
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

  // Conditional escape loop + switch — function-specific scenarios.
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

  // Nested arithmetic trees — shared i32 values.
  for (const v of data.i32_values) {
    exports.exerciseNestedArithmetic(v);
  }

  // Memory-driven arithmetic — shared i32 pairs.
  for (const p of data.i32_pairs) {
    exports.exerciseMemoryArithmetic(p[0], p[1]);
  }

  // Mixed-type chains — first 4 shared mixed-type cases.
  for (let i = 0; i < 4; ++i) {
    const t = data.mixed_type_cases[i];
    exports.exerciseMixedTypeChains(t[0], Math.fround(t[1]), t[2]);
  }

  // Edge arithmetic — no parameters.
  exports.exerciseEdgeArithmetic();

  // Mixed-width loads — shared subword cases.
  for (const p of data.subword_cases) {
    exports.exerciseMixedWidthLoads(p[0], p[1]);
  }

  // Load-to-float — function-specific pairs (differs from subword_cases).
  invokeScenarios(
    [
      [42, 7],
      [0, 0],
      [-1, 1],
      [0x12345678, -100],
      [255, 256],
      [-128, 127]
    ],
    (a, b) => exports.exerciseLoadToFloat(a, b)
  );

  // Cross-type pipeline — shared mixed-type cases.
  for (const t of data.mixed_type_cases) {
    exports.exerciseCrossTypePipeline(t[0], Math.fround(t[1]), t[2]);
  }

  // Sub-word store/reload — shared subword cases.
  for (const p of data.subword_cases) {
    exports.exerciseSubWordStoreReload(p[0], p[1]);
  }

  // Precision and reinterpret — shared mixed-type cases.
  for (const t of data.mixed_type_cases) {
    exports.exercisePrecisionAndReinterpret(t[0], Math.fround(t[1]), t[2]);
  }
};

const runTest = function (buff, out, exports, data) {
  instanceMemoryBuffer = buff;
  stdoutWrite = out;
  observedData = [];
  exports.emitSegmentsToHost();

  const memoryBytes = new Uint8Array(instanceMemoryBuffer);
  const expectedOutputs = expectedData.map((unusedValue, dataIndex) =>
    readZeroTerminatedString(memoryBytes, offsetList[dataIndex])
  );

  const count =
    1 +
    expectedOutputs.findIndex(function (item) {
      return 'X\n' === item;
    });

  if (observedData.length !== count) {
    throw new Error('Output count mismatch: expected ' + count + ', got ' + observedData.length);
  }

  for (let dataIndex = 0; dataIndex < count; ++dataIndex) {
    if (observedData[dataIndex] !== expectedOutputs[dataIndex]) {
      throw new Error(
        'Output mismatch at index ' +
          dataIndex +
          ': expected "' +
          expectedOutputs[dataIndex] +
          '", got "' +
          observedData[dataIndex] +
          '"'
      );
    }
  }

  verifyMVPOps(exports, data);
};

const dumpMemory = true;

export {
  dumpMemory,
  expectedData,
  heapBase,
  memoryInitialPages,
  memoryMaximumPages,
  memoryPageSize,
  moduleImports,
  offsetList,
  runTest
};
