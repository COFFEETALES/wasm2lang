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
