'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  for (const q of data.quads) {
    exports.exerciseSIMDLanes(q[0], q[1], q[2], q[3]);
  }
  for (const p of data.pairs) {
    exports.exerciseSIMDArithmetic(p[0], p[1]);
  }
  for (const p of data.pairs) {
    exports.exerciseSIMDBitwise(p[0], p[1]);
  }
  for (const p of data.shift_pairs) {
    exports.exerciseSIMDShift(p[0], p[1]);
  }
  for (const p of data.pairs) {
    exports.exerciseSIMDCompare(p[0], p[1]);
  }
  for (const q of data.quads) {
    exports.exerciseSIMDShuffle(q[0], q[1], q[2], q[3]);
  }
  for (const q of data.quads) {
    exports.exerciseSIMDMemory(q[0], q[1], q[2], q[3]);
  }
  exports.exerciseSIMDEdgeCases();
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
