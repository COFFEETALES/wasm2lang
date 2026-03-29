'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports) {
  exports.alignHeapTop();
  exports.exerciseBulkMemory(exports.getHeapTop());
};

const dumpMemory = true;

export { dumpMemory, moduleImports, runTest };
