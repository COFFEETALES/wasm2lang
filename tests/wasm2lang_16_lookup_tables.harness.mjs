'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  for (const n of data.square_inputs) {
    exports.exerciseSquares(n);
  }

  for (const needle of data.binary_search_needles) {
    exports.exerciseBinarySearch(needle);
  }

  for (const n of data.fib_memo_inputs) {
    exports.exerciseFibMemo(n);
  }

  for (const n of data.bit_pattern_inputs) {
    exports.exerciseBitPatterns(n);
  }

  const scratch = 1536;
  const view = new Uint8Array(buff);

  for (const str of data.crc32_strings) {
    for (let i = 0; i < str.length; i++) {
      view[scratch + i] = str.charCodeAt(i);
    }
    exports.exerciseCrc32PreCalc(scratch, str.length);
  }
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
