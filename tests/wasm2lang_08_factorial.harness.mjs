'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  for (const v of data.factorial_inputs) {
    exports.exerciseFactorial(v);
  }
};

const dumpMemory = true;

export { dumpMemory, moduleImports, runTest };
