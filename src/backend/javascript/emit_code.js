/**
 * @fileoverview JavaScript-specific emit_code overrides.  JavaScriptCodegen
 * extends AsmjsCodegen for binary-op renderers and i64 helper plumbing, but
 * the asm.js {@code emit_code} overrides (use-asm directive, foreign-routed
 * {@code Math} constants, coerced exported-global getters, raw integer
 * global initializers, etc.) are inappropriate for plain JavaScript.
 *
 * Restoring the JsCommonCodegen prototype defaults reverses each asm.js
 * override one-shot — no override-body duplication required.
 *
 * @suppress {visibility}
 */
'use strict';

Wasm2Lang.Backend.JavaScriptCodegen.prototype.getModuleFunctionBindingName_ =
  Wasm2Lang.Backend.JsCommonCodegen.prototype.getModuleFunctionBindingName_;
Wasm2Lang.Backend.JavaScriptCodegen.prototype.emitUseAsmDirective_ =
  Wasm2Lang.Backend.JsCommonCodegen.prototype.emitUseAsmDirective_;
Wasm2Lang.Backend.JavaScriptCodegen.prototype.getHeapBindingTable_ =
  Wasm2Lang.Backend.JsCommonCodegen.prototype.getHeapBindingTable_;
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderHeapInitializer_ =
  Wasm2Lang.Backend.JsCommonCodegen.prototype.renderHeapInitializer_;
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderMathFunctionInitializer_ =
  Wasm2Lang.Backend.JsCommonCodegen.prototype.renderMathFunctionInitializer_;
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderMathConstantInitializer_ =
  Wasm2Lang.Backend.JsCommonCodegen.prototype.renderMathConstantInitializer_;
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderInfinityInitializer_ =
  Wasm2Lang.Backend.JsCommonCodegen.prototype.renderInfinityInitializer_;
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderNaNInitializer_ =
  Wasm2Lang.Backend.JsCommonCodegen.prototype.renderNaNInitializer_;
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderModuleGlobalInitExpr_ =
  Wasm2Lang.Backend.JsCommonCodegen.prototype.renderModuleGlobalInitExpr_;
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderExportedGlobalGetterReturn_ =
  Wasm2Lang.Backend.JsCommonCodegen.prototype.renderExportedGlobalGetterReturn_;
Wasm2Lang.Backend.JavaScriptCodegen.prototype.emitParameterAnnotations_ =
  Wasm2Lang.Backend.JsCommonCodegen.prototype.emitParameterAnnotations_;
Wasm2Lang.Backend.JavaScriptCodegen.prototype.getHeapSizeDefinitionKey_ =
  Wasm2Lang.Backend.JsCommonCodegen.prototype.getHeapSizeDefinitionKey_;
