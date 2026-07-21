'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports) {
  void buff;
  void out;
  exports.alignHeapTop();
  exports.exerciseTerminalLoopWithOuterExit();
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
