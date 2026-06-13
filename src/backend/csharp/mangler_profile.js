'use strict';

// ---------------------------------------------------------------------------
// Reserved words and mangler profile.
//
// C# cannot use {@code defineLanguageManglerProfile} directly: the helper's
// case-sensitive charset includes {@code $}, which is illegal in C#
// identifiers.  The profile is registered manually with a {@code $}-free
// charset instead (the reserved-word handling matches the helper).
// ---------------------------------------------------------------------------

/** @const {!Object<string, boolean>} */
Wasm2Lang.Backend.CsharpCodegen.RESERVED_ = /** @return {!Object<string, boolean>} */ (function () {
  var /** @const {!Array<string>} */ words = [
      'abstract',
      'as',
      'base',
      'bool',
      'break',
      'byte',
      'case',
      'catch',
      'char',
      'checked',
      'class',
      'const',
      'continue',
      'decimal',
      'default',
      'delegate',
      'do',
      'double',
      'else',
      'enum',
      'event',
      'explicit',
      'extern',
      'false',
      'finally',
      'fixed',
      'float',
      'for',
      'foreach',
      'goto',
      'if',
      'implicit',
      'in',
      'int',
      'interface',
      'internal',
      'is',
      'lock',
      'long',
      'namespace',
      'new',
      'null',
      'object',
      'operator',
      'out',
      'override',
      'params',
      'private',
      'protected',
      'public',
      'readonly',
      'ref',
      'return',
      'sbyte',
      'sealed',
      'short',
      'sizeof',
      'stackalloc',
      'static',
      'string',
      'struct',
      'switch',
      'this',
      'throw',
      'true',
      'try',
      'typeof',
      'uint',
      'ulong',
      'unchecked',
      'unsafe',
      'ushort',
      'using',
      'virtual',
      'void',
      'volatile',
      'while'
    ];
  var /** @const {!Object<string, boolean>} */ reserved = /** @type {!Object<string, boolean>} */ (Object.create(null));
  for (var /** @type {number} */ i = 0, /** @const {number} */ wordLen = words.length; i < wordLen; ++i) {
    reserved[words[i]] = true;
  }
  var /** @const {string} */ alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
  Wasm2Lang.Backend.registerManglerProfile('csharp', {
    reservedWords: reserved,
    rejectName: /** @param {string} name @return {boolean} */ function (name) {
      var /** @const {number} */ ch = name.charCodeAt(0);
      return (48 <= ch && ch <= 57) || !!reserved[name];
    },
    singleCharset: alpha,
    blockCharset: alpha + '0123456789',
    caseInsensitive: false
  });
  return reserved;
})();
