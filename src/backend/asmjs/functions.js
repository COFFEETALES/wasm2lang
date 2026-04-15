'use strict';

// ---------------------------------------------------------------------------
// asm.js parameter-annotation hook.
//
// The shared {@code emitFunction_} skeleton lives in
// {@code jscommon/functions.js}; asm.js only needs to add the validator-
// required {@code x = x | 0;} (and friends) annotations after the function
// header.
// ---------------------------------------------------------------------------

/**
 * @override
 * @protected
 * @param {!Array<string>} parts
 * @param {!Binaryen} binaryen
 * @param {!Array<number>} paramTypes
 * @param {number} numParams
 * @param {string} indentStr
 * @return {void}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitParameterAnnotations_ = function (
  parts,
  binaryen,
  paramTypes,
  numParams,
  indentStr
) {
  for (var /** @type {number} */ pa = 0; pa !== numParams; ++pa) {
    var /** @const {string} */ pName = this.localN_(pa);
    parts[parts.length] = indentStr + pName + ' = ' + this.renderCoercionByType_(binaryen, pName, paramTypes[pa]) + ';';
  }
};
