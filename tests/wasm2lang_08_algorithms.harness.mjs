'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();
  exports.initCrc32Tables();

  for (const v of data.factorial_inputs) {
    exports.exerciseFactorial(v);
  }

  for (const v of data.fibonacci_inputs) {
    exports.exerciseFibonacci(v);
  }

  for (const v of data.collatz_inputs) {
    exports.exerciseCollatz(v);
  }

  for (const pair of data.gcd_inputs) {
    exports.exerciseGcd(pair[0], pair[1]);
  }

  for (const pair of data.select_inputs) {
    exports.exerciseSelect(pair[0], pair[1]);
  }

  for (const v of data.bitwise_inputs) {
    exports.exerciseBitwise(v);
  }

  const scratch = 1088;
  const view = new Uint8Array(buff);

  for (const str of data.string_inputs) {
    for (let i = 0; i < str.length; i++) {
      view[scratch + i] = str.charCodeAt(i);
    }
    view[scratch + str.length] = 0;
    exports.exerciseString(scratch);
  }

  for (const str of data.crc32_inputs) {
    for (let i = 0; i < str.length; i++) {
      view[scratch + i] = str.charCodeAt(i);
    }
    exports.exerciseCrc32(scratch, str.length);
  }

  exports.exerciseMemory(scratch);
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
