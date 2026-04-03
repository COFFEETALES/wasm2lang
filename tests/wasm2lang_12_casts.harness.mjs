'use strict';

const moduleImports = {
  i32_to_f32: x => Math.fround(x | 0),
  i32_to_f64: x => +(x | 0),
  f32_to_i32: x => ~~Math.fround(x) | 0,
  f64_to_i32: x => ~~x | 0,
  f32_to_u32: x => ~~Math.fround(x) | 0,
  f64_to_u32: x => ~~x | 0,
  u32_to_f32: x => Math.fround(x >>> 0),
  u32_to_f64: x => +(x >>> 0)
};

const wasmImports = {cast: moduleImports};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  for (const t of data.cast_triples) {
    exports.exerciseI32Casts(t[0], Math.fround(t[1]), t[2]);
    exports.exerciseU32Casts(t[0], Math.fround(t[1]), t[2]);
  }

  exports.exerciseCastEdgeCases();
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest, wasmImports};
