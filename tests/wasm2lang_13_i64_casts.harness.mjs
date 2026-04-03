'use strict';

const moduleImports = {
  i64_to_f32: x => Math.fround(Number(x)),
  i64_to_f64: x => Number(x),
  f32_to_i64: x => BigInt(Math.trunc(x)),
  f64_to_i64: x => BigInt(Math.trunc(x))
};

const wasmImports = {cast: moduleImports};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  for (const t of data.cast_triples) {
    exports.exerciseI64Casts(t[0], Math.fround(t[1]), t[2]);
  }

  exports.exerciseI64CastEdgeCases();
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest, wasmImports};
