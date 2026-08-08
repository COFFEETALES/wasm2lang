'use strict';

// Dense SIMD128 module (wasm reference).
//
// The export list is NOT written out here.  wasm2lang_24_simd_dense.build.js
// derives its op list from binaryen's own builder enumeration, so the set of
// exports changes whenever binaryen does; a hand-kept call list in three
// harnesses would drift silently and under-report coverage without failing.
// Each harness therefore enumerates the module's own `t_`-prefixed zero-argument
// i32 exports and calls them in ordinal name order — the same order in all
// three, because the names are ASCII and JS, Java and C# agree there.
const moduleImports = {};

const runTest = function (buff, out, exports) {
  void buff;
  const names = Object.keys(exports)
    .filter(n => n.indexOf('t_') === 0 && typeof exports[n] === 'function' && exports[n].length === 0)
    .sort();
  out('exports=' + names.length + '\n');
  for (const n of names) out(n + '=' + exports[n]() + '\n');
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
