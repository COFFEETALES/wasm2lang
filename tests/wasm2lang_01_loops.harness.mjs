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

const moduleImports = {
  'hostOnBufferReady': function () {
    const u8 = new Uint8Array(instanceMemoryBuffer);
    let arr = [];
    for (let i = 128; 0 !== u8[i]; ++i) {
      arr[arr.length] = u8[i];
    }
    stdoutWrite(arr.map(i => String.fromCharCode(i)).join(''));
  }
};

const runTest = function (buff, out, exports) {
  instanceMemoryBuffer = buff;
  stdoutWrite = out;
  /* Commented out for now, as the test module is not yet available.
  exports.emitSegmentsToHost();
  */
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
