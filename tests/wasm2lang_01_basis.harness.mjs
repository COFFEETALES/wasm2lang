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

const verifyMVPOps = function (exports) {
  exports.alignHeapTop();
  const startOffset = exports.getHeapTop();
  const invokeScenarios = function (scenarioList, callback) {
    for (const scenario of scenarioList) {
      callback(...scenario);
    }
  };

  // Primary parameter set.
  exports.exerciseMVPOps(42, Math.fround(3.5), 2.75);

  // Edge-case parameter sets.
  exports.exerciseMVPOps(0, Math.fround(0.0), 0.0);
  exports.exerciseMVPOps(-1, Math.fround(0.5), 0.5);
  exports.exerciseMVPOps(2147483647, Math.fround(100.0), 100.0);

  // Additional parameter sets.
  exports.exerciseMVPOps(1, Math.fround(1.0), 1.0);
  exports.exerciseMVPOps(-2147483648, Math.fround(3.0), 3.0);
  exports.exerciseMVPOps(255, Math.fround(0.125), 0.125);
  exports.exerciseMVPOps(16, Math.fround(4.0), 4.0);

  exports.exerciseOverflowOps();
  exports.exerciseEdgeCases();

  // br_table dispatch — direct cases, default, and adversarial indices.
  invokeScenarios([[0], [1], [2], [3]], index => exports.exerciseBrTable(index));
  invokeScenarios([[4], [-1], [99], [-2147483648]], index => exports.exerciseBrTable(index));

  // br_table with loop target — positive countdowns and already-terminal starts.
  invokeScenarios([[5], [2], [1], [0], [-3], [9]], startCount => exports.exerciseBrTableLoop(startCount));

  // Counted loop — forward ranges, empty ranges, reverse ranges, and negatives.
  invokeScenarios(
    [
      [0, 5],
      [2, 2],
      [-2, 3],
      [5, 1],
      [7, 8]
    ],
    (startValue, exclusiveLimit) => exports.exerciseCountedLoop(startValue, exclusiveLimit)
  );

  // Do-while countdown — normal factorial path and non-positive entry values.
  invokeScenarios([[5], [1], [0], [-3]], countdownStart => exports.exerciseDoWhileLoop(countdownStart));

  // Do-while variant — long, short, and zero-budget entries.
  invokeScenarios(
    [
      [1, 10],
      [3, 1],
      [7, 0],
      [2, 4]
    ],
    (startValue, iterationCount) => exports.exerciseDoWhileVariantA(startValue, iterationCount)
  );

  // Nested loop + switch dispatch — empty outer loop, direct default, and alternating resets.
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

  // Loop state machine — multi-step transitions, direct case 2, terminal, and default exits.
  invokeScenarios(
    [
      [0, 0, 3],
      [0, 20, 5],
      [2, 9, 4],
      [3, 7, 2],
      [4, 99, 9],
      [-1, 5, 1]
    ],
    (startState, startAccumulator, transitionBudget) =>
      exports.exerciseSwitchInLoop(startState, startAccumulator, transitionBudget)
  );

  // br_table with duplicate targets — shared targets and default routing.
  invokeScenarios([[0], [1], [2], [3], [4], [5], [-1], [99]], index => exports.exerciseBrTableMultiTarget(index));

  // Nested switches — inner defaults, outer defaults, and outer non-zero cases.
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

  // br_table with an internal default target.
  invokeScenarios([[0], [1], [2], [3], [-1], [99]], index => exports.exerciseSwitchDefaultInternal(index));

  // Multi-exit loop + switch — completed, alternate, and default-driven exits.
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

  // Conditional escape loop + switch — looping, immediate default exits, and direct escape checks.
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

  // Nested arithmetic trees — deeply nested i32 expressions.
  invokeScenarios([[42], [0], [-1], [2147483647], [1], [255], [-100]], a => exports.exerciseNestedArithmetic(a));

  // Memory-driven arithmetic — store/load/compute chains.
  invokeScenarios(
    [
      [42, 7],
      [0, 0],
      [-1, 1],
      [0x12345678, -100],
      [255, 256]
    ],
    (a, b) => exports.exerciseMemoryArithmetic(a, b)
  );

  // Mixed-type chains — cross-type conversions and arithmetic.
  invokeScenarios(
    [
      [42, Math.fround(3.5), 2.75],
      [0, Math.fround(0.0), 0.0],
      [-1, Math.fround(-1.5), -1.5],
      [100, Math.fround(0.125), 100.0]
    ],
    (a, b, c) => exports.exerciseMixedTypeChains(a, b, c)
  );

  // Edge arithmetic — overflow, boundary, and identity tests.
  exports.exerciseEdgeArithmetic();

  // Mixed-width loads — signed/unsigned byte and halfword arithmetic.
  invokeScenarios(
    [
      [42, 7],
      [0, 0],
      [-1, 1],
      [0x12345678, -100],
      [255, 128],
      [-128, -1]
    ],
    (a, b) => exports.exerciseMixedWidthLoads(a, b)
  );

  // Load-to-float — memory loads converted to f32/f64 and combined.
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

  // Cross-type pipeline — deep multi-stage mixed-type pipelines.
  invokeScenarios(
    [
      [42, Math.fround(3.5), 2.75],
      [0, Math.fround(0.0), 0.0],
      [-1, Math.fround(-1.5), -1.5],
      [100, Math.fround(0.125), 100.0],
      [255, Math.fround(10.0), -50.0]
    ],
    (a, b, c) => exports.exerciseCrossTypePipeline(a, b, c)
  );

  // Sub-word store/reload — store8/store16 computed values, byte-assembly, multi-stage chains.
  invokeScenarios(
    [
      [42, 7],
      [0, 0],
      [-1, 1],
      [0x12345678, -100],
      [255, 128],
      [-128, -1]
    ],
    (a, b) => exports.exerciseSubWordStoreReload(a, b)
  );

  // Precision and reinterpret — f32 precision boundaries, fractional truncation, reinterpret chains.
  invokeScenarios(
    [
      [42, Math.fround(3.5), 2.75],
      [0, Math.fround(0.0), 0.0],
      [-1, Math.fround(-1.5), -1.5],
      [100, Math.fround(0.125), 100.0],
      [255, Math.fround(10.0), -50.0]
    ],
    (a, b, c) => exports.exercisePrecisionAndReinterpret(a, b, c)
  );
};

const runTest = function (buff, out, exports) {
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

  verifyMVPOps(exports);
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
