'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  // Mixed-width loads — shared subword cases.
  for (const p of data.subword_cases) {
    exports.exerciseMixedWidthLoads(p[0], p[1]);
  }

  // Load-to-float — function-specific pairs.
  const invokeScenarios = function (scenarioList, callback) {
    for (const scenario of scenarioList) {
      callback(...scenario);
    }
  };
  invokeScenarios(
    [[42, 7], [0, 0], [-1, 1], [0x12345678, -100], [255, 256], [-128, 127]],
    (a, b) => exports.exerciseLoadToFloat(a, b)
  );

  // Cross-type pipeline — shared mixed-type cases.
  for (const t of data.mixed_type_cases) {
    exports.exerciseCrossTypePipeline(t[0], Math.fround(t[1]), t[2]);
  }

  // Sub-word store/reload — shared subword cases.
  for (const p of data.subword_cases) {
    exports.exerciseSubWordStoreReload(p[0], p[1]);
  }

  // Precision and reinterpret — shared mixed-type cases.
  for (const t of data.mixed_type_cases) {
    exports.exercisePrecisionAndReinterpret(t[0], Math.fround(t[1]), t[2]);
  }
};

const dumpMemory = true;

export { dumpMemory, moduleImports, runTest };
