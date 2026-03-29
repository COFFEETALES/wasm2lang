'use strict';

// Math constants and Infinity/NaN are routed through the foreign parameter
// in asm.js (V8/SpiderMonkey validators reject +stdlib.Math.E).
const moduleImports = {
  E: Math.E,
  LN10: Math.LN10,
  LN2: Math.LN2,
  LOG2E: Math.LOG2E,
  LOG10E: Math.LOG10E,
  PI: Math.PI,
  SQRT1_2: Math.SQRT1_2,
  SQRT2: Math.SQRT2,
  Infinity: Infinity,
  NaN: NaN
};

const wasmImports = {
  'Math': {
    acos: Math.acos,
    asin: Math.asin,
    atan: Math.atan,
    cos: Math.cos,
    sin: Math.sin,
    tan: Math.tan,
    exp: Math.exp,
    log: Math.log,
    ceil: Math.ceil,
    floor: Math.floor,
    sqrt: Math.sqrt,
    abs: Math.abs,
    min: Math.min,
    max: Math.max,
    atan2: Math.atan2,
    pow: Math.pow,
    E: Math.E,
    LN10: Math.LN10,
    LN2: Math.LN2,
    LOG2E: Math.LOG2E,
    LOG10E: Math.LOG10E,
    PI: Math.PI,
    SQRT1_2: Math.SQRT1_2,
    SQRT2: Math.SQRT2
  },
  'global': {
    Infinity: Infinity,
    NaN: NaN
  }
};

const runTest = function (buff, out, exports) {
  exports.alignHeapTop();
  exports.exerciseStdlibMath1();
  exports.exerciseStdlibMath2();
  exports.exerciseStdlibMath3();
  exports.exerciseStdlibMath4();
  exports.exerciseStdlibConstants();
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest, wasmImports};
