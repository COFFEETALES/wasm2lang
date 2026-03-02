'use strict';

const memoryPageSize = 65536;
const memoryInitialPages = 8;
const memoryMaximumPages = 8;

let instanceMemoryBuffer = null;
let stdoutWrite = null;

const moduleImports = {};

const runTest = function (buff, out, exports) {
  instanceMemoryBuffer = buff;
  stdoutWrite = out;
  /* Commented out for now, as the test module is not yet available.
  stdoutWrite((exports['basis0'](0) >>> 0) + '\n');
  */
};

const heapBase = 128;

const dumpMemory = true;

export {
  dumpMemory,
  heapBase,
  memoryInitialPages,
  memoryMaximumPages,
  memoryPageSize,
  moduleImports,
  runTest
};
