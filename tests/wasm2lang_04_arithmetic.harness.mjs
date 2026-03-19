'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  // Nested arithmetic trees — shared i32 values.
  for (const v of data.i32_values) {
    exports.exerciseNestedArithmetic(v);
  }

  // Memory-driven arithmetic — shared i32 pairs.
  for (const p of data.i32_pairs) {
    exports.exerciseMemoryArithmetic(p[0], p[1]);
  }

  // Mixed-type chains — first 4 shared mixed-type cases.
  for (let i = 0; i < 4; ++i) {
    const t = data.mixed_type_cases[i];
    exports.exerciseMixedTypeChains(t[0], Math.fround(t[1]), t[2]);
  }

  // Edge arithmetic — no parameters.
  exports.exerciseEdgeArithmetic();
};

const dumpMemory = true;

export { dumpMemory, moduleImports, runTest };
