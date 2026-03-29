'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();
  exports.exerciseBulkMemory(exports.getHeapTop());
  exports.exerciseMemoryGrow();

  for (const p of data.bulk_params) {
    exports.exerciseBulkFillVerify(exports.getHeapTop(), p[0], p[1]);
  }
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
