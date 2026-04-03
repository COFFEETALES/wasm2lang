'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  for (const p of data.i32_pairs) {
    exports.exerciseI64Arithmetic(p[0], p[1]);
  }

  for (const p of data.i32_pairs) {
    exports.exerciseI64Bitwise(p[0], p[1]);
  }

  for (const v of data.i32_values) {
    exports.exerciseI64Unary(v);
  }

  for (const p of data.i32_pairs) {
    exports.exerciseI64Comparison(p[0], p[1]);
  }

  for (const p of data.i32_pairs) {
    exports.exerciseI64Memory(p[0], p[1]);
  }

  for (let i = 0; i < data.conversion_cases.length; ++i) {
    const t = data.conversion_cases[i];
    exports.exerciseI64Conversions(t[0], Math.fround(t[1]), t[2]);
  }

  // Trunc/convert chains with wide-range random float input.
  for (const p of data.trunc_convert_pairs) {
    exports.exerciseI64TruncConvert(Math.fround(p[0]), p[1]);
  }

  exports.exerciseI64EdgeCases();
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
