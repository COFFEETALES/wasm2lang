'use strict';

// ---------------------------------------------------------------------------
// Reserved words and mangler profile.
// ---------------------------------------------------------------------------

/** @const {!Object<string, boolean>} */
Wasm2Lang.Backend.AsmjsCodegen.RESERVED_ = Wasm2Lang.Backend.buildReservedSet([
  'abstract',
  'arguments',
  'await',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'double',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'function',
  'goto',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'int',
  'interface',
  'let',
  'long',
  'native',
  'new',
  'null',
  'of',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'typeof',
  'undefined',
  'var',
  'void',
  'volatile',
  'while',
  'with',
  'yield',
  'NaN',
  'Infinity'
]);

Wasm2Lang.Backend.registerManglerProfile('asmjs', {
  reservedWords: Wasm2Lang.Backend.AsmjsCodegen.RESERVED_,
  rejectName: /** @param {string} name @return {boolean} */ function (name) {
    var /** @const {number} */ ch = name.charCodeAt(0);
    return (48 <= ch && ch <= 57) || !!Wasm2Lang.Backend.AsmjsCodegen.RESERVED_[name];
  },
  singleCharset: '$ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz',
  blockCharset: '$ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz0123456789',
  caseInsensitive: false
});
