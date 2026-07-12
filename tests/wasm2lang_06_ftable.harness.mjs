'use strict';

const moduleImports = {};

// Lock both call_indirect emission paths in the readable nomangle variant:
// pure operands/index stay on the direct table-call fast path, while the
// effectful ordering gate goes through its typed dispatcher.  Runtime CRCs
// alone prove semantics but would not catch an accidental all-wrapper size
// regression.
const validateCode = function (code, testName) {
  if (!/_nomangle$/.test(testName)) return;
  if (!/\$ftable_ii_i\[\(0\) & \d+\]\(/.test(code)) {
    throw new Error('pure call_indirect no longer uses the direct table fast path');
  }
  if (!/\$w2l_call_indirect_i_i\(markCallIndirectI32\(/.test(code)) {
    throw new Error('effectful call_indirect does not use the ordered dispatcher');
  }
};

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

  exports.exerciseCallIndirectTerminalOrder();
  exports.exerciseCallIndirectOrderedEffects();
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest, validateCode};
