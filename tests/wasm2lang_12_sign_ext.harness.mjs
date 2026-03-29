'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  for (const v of data.i32_values) {
    exports.exerciseSignExt(v);
  }
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
