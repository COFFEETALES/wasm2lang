'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports) {
  exports.alignHeapTop();
  exports.exerciseMemoryGrow();
};

const dumpMemory = true;

export { dumpMemory, moduleImports, runTest };
