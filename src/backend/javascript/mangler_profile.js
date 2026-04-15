'use strict';

// ---------------------------------------------------------------------------
// Reserved words and mangler profile for JavaScript.  Layers BigInt and the
// typed-array constructors on top of the shared JS keyword lexicon — these
// are referenced by name in emitted code, so the mangler must not re-issue
// them as user-symbol replacements.
// ---------------------------------------------------------------------------

/** @const {!Object<string, boolean>} */
Wasm2Lang.Backend.JavaScriptCodegen.RESERVED_ = Wasm2Lang.Backend.defineLanguageManglerProfile(
  'javascript',
  Wasm2Lang.Backend.JsCommonCodegen.JS_KEYWORDS_.concat([
    'BigInt',
    'BigInt64Array',
    'Math',
    'ArrayBuffer',
    'Int8Array',
    'Uint8Array',
    'Int16Array',
    'Uint16Array',
    'Int32Array',
    'Uint32Array',
    'Float32Array',
    'Float64Array'
  ]),
  false
);
