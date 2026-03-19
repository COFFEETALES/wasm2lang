'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  // MVP ops — shared i32/f32/f64 triples.
  for (const t of data.i32_f32_f64_triples) {
    exports.exerciseMVPOps(t[0], Math.fround(t[1]), t[2]);
  }

  exports.exerciseOverflowOps();
  exports.exerciseEdgeCases();
};

const dumpMemory = true;

export { dumpMemory, moduleImports, runTest };
