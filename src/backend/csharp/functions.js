'use strict';

// ---------------------------------------------------------------------------
// Method emission.  The body of the emitter is shared with the Java backend as
// AbstractCodegen.prototype.emitClassMethod_ — the two differ only in the
// type-name spelling below and in the visibility keyword an exported method
// carries (C#: public, see exportedMethodVisibility_).
// ---------------------------------------------------------------------------

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.classTypeName_ = function (binaryen, wasmType) {
  return Wasm2Lang.Backend.CsharpCodegen.csharpTypeName_(binaryen, wasmType);
};
