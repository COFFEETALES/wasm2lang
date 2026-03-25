'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();
  const scratch = 0;
  const view = new Uint8Array(buff);

  for (const str of data.crc32_inputs) {
    for (let i = 0; i < str.length; i++) {
      view[scratch + i] = str.charCodeAt(i);
    }
    exports.exerciseCrc32(scratch, str.length);
  }
};

const dumpMemory = true;

export { dumpMemory, moduleImports, runTest };
