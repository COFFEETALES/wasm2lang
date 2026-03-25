'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  // Basic dispatch — all ii_i and i_i entries with shared i32 pairs.
  for (const p of data.i32_pairs) {
    exports.exerciseDispatchPair(p[0], p[1]);
  }

  // Float dispatch — dd_i entries via integer-to-f64 conversion.
  for (const p of data.float_pairs) {
    exports.exerciseFloatPair(p[0], p[1]);
  }

  // Triple-arg dispatch — iii_i entries (select + combineBits).
  for (const t of data.i32_triples) {
    exports.exerciseTriple(t[0], t[1], t[2]);
  }

  // Chained calls — multi-stage pipeline crossing signature boundaries.
  for (const p of data.i32_pairs) {
    exports.exerciseChained(p[0], p[1]);
  }

  // Edge cases — hardcoded boundary values, all four signatures.
  exports.exerciseEdgeCases();

  // Dynamic index — table index from parameter, not constant.
  for (const d of data.dynamic_dispatch) {
    exports.exerciseDynamicIndex(d[0], d[1], d[2]);
  }
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
