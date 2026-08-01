'use strict';

// ---------------------------------------------------------------------------
// Method emission.  The body of the emitter is shared with the C# backend as
// AbstractCodegen.prototype.emitClassMethod_ — the two differ only in the
// type-name spelling below and in the visibility keyword an exported method
// carries (Java: none, see exportedMethodVisibility_).
// ---------------------------------------------------------------------------

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.classTypeName_ = function (binaryen, wasmType) {
  return Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, wasmType);
};
