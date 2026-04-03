'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  // MVP ops — shared i32/f32/f64 triples.
  for (const t of data.i32_f32_f64_triples) {
    exports.exerciseMVPOps(t[0], Math.fround(t[1]), t[2]);
  }

  // Trunc/convert chains with wide-range random float input.
  for (const p of data.trunc_convert_pairs) {
    exports.exerciseTruncConvert(Math.fround(p[0]), p[1]);
  }

  exports.exerciseOverflowOps();
  exports.exerciseEdgeCases();

  // Exported mutable global: exercise via getter/setter and function.
  // Native WASM: WebAssembly.Global object; asm.js: getter/setter functions.
  const isWasmGlobal = typeof exports.counter === 'object';
  const setCounter = isWasmGlobal
    ? v => {
        exports.counter.value = v;
      }
    : exports.counter$set;
  const getCounter = isWasmGlobal ? () => exports.counter.value : exports.counter;
  setCounter(42);
  exports.exerciseGlobalExports(getCounter());
  setCounter(100);
  exports.exerciseGlobalExports(getCounter());
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
