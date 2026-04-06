'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  for (const v of data.fused_while_limits) {
    exports.exerciseFusedWhile(v);
  }

  for (const v of data.fused_break_inputs) {
    exports.exerciseFusedBreakFromIf(v);
  }

  for (const triple of data.nested_while_triples) {
    exports.exerciseNestedWhile(triple[0], triple[1], triple[2]);
  }

  for (const v of data.while_continue_limits) {
    exports.exerciseWhileWithContinue(v);
  }

  for (const pair of data.distant_exit_pairs) {
    exports.exerciseDistantExit(pair[0], pair[1]);
  }

  for (const v of data.do_while_break_starts) {
    exports.exerciseDoWhileBreak(v);
  }

  for (const v of data.fused_do_while_inputs) {
    exports.exerciseFusedDoWhile(v);
  }

  for (const triple of data.multi_break_triples) {
    exports.exerciseMultiBreak(triple[0], triple[1], triple[2]);
  }

  for (const pair of data.if_else_pairs) {
    exports.exerciseIfElseSimple(pair[0], pair[1]);
  }

  for (const pair of data.if_else_kept_pairs) {
    exports.exerciseIfElseKeptLabel(pair[0], pair[1]);
  }
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
