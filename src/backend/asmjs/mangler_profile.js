'use strict';

// ---------------------------------------------------------------------------
// Reserved words and mangler profile.  Inherits the shared JS keyword
// lexicon from {@code jscommon/mangler_profile.js}; asm.js needs no
// additional host-global names beyond the bare lexicon.
// ---------------------------------------------------------------------------

/** @const {!Object<string, boolean>} */
Wasm2Lang.Backend.AsmjsCodegen.RESERVED_ = Wasm2Lang.Backend.defineLanguageManglerProfile(
  'asmjs',
  Wasm2Lang.Backend.JsCommonCodegen.JS_KEYWORDS_,
  false
);
