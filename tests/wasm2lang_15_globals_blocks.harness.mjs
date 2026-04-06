'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  for (const pair of data.global_pairs) {
    exports.exerciseGlobals(pair[0], pair[1]);
  }

  exports.exerciseFind2D();

  for (const triple of data.validation_triples) {
    exports.exerciseValidation(triple[0], triple[1], triple[2]);
  }

  for (const triple of data.if_expr_triples) {
    exports.exerciseIfExpressions(triple[0], triple[1], triple[2]);
  }

  for (const n of data.mutual_recursion_inputs) {
    exports.exerciseMutualRecursion(n);
  }

  for (const n of data.drop_inputs) {
    exports.exerciseDrop(n);
  }
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
