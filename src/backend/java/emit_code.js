'use strict';

// ---------------------------------------------------------------------------
// Java spellings for the shared class-shell emitter.  The orchestration —
// declaration order, deferred splices, helper capture, marker publication —
// lives in AbstractCodegen.emitClassCode_; this file holds only what Java
// spells differently from C#.  The single-token divergences are constructor
// fields set in codegen.js.
// ---------------------------------------------------------------------------

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitCode = function (wasmModule, options) {
  return this.emitClassCode_(wasmModule, options);
};

/**
 * @override
 * @param {string} pad1
 * @param {string} sigTypeName
 * @param {string} returnTypeName
 * @param {string} joinedParamDecls
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderFtSigDecl_ = function (pad1, sigTypeName, returnTypeName, joinedParamDecls) {
  return pad1 + '@FunctionalInterface interface ' + sigTypeName + ' { ' + returnTypeName + ' call(' + joinedParamDecls + '); }';
};

/**
 * @override
 * @param {string} pad1
 * @param {string} className
 * @param {string} bufferParamName
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderClassCtorOpen_ = function (pad1, className, bufferParamName) {
  return pad1 + className + '(java.util.Map<String, Object> foreign, java.nio.ByteBuffer ' + bufferParamName + ') {';
};

/**
 * @override
 * @param {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} moduleInfo
 * @return {{w2lStdlibNames: !Object<string, string>, w2lStdlibGlobals: !Object<string, string>}}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.resolveClassStdlib_ = function (moduleInfo) {
  return Wasm2Lang.Backend.AbstractCodegen.resolveStdlibBindings_(
    moduleInfo.impFuncs,
    moduleInfo.impGlobals,
    'Math.',
    {
      'E': 'Math.E',
      'LN10': '2.302585092994046',
      'LN2': '0.6931471805599453',
      'LOG2E': '1.4426950408889634',
      'LOG10E': '0.4342944819032518',
      'PI': 'Math.PI',
      'SQRT1_2': '0.7071067811865476',
      'SQRT2': '1.4142135623730951'
    },
    'Double.POSITIVE_INFINITY',
    'Double.NaN'
  );
};

/**
 * @override
 * @param {string} importBaseName
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderForeignLookup_ = function (importBaseName) {
  return 'foreign.get("' + importBaseName + '")';
};

/**
 * Emit the Vector API import when any SIMD operation was emitted.  It is a JDK
 * incubator module, so it needs --add-modules jdk.incubator.vector at compile
 * and run time, and it is absent from android.jar — which is why v128 support
 * on this backend is a capability, not a portability layer: a module that uses
 * SIMD simply does not target Android.
 *
 * @override
 * @param {!Array<string>} outputParts
 * @param {!Object<string, boolean>} usedBindings
 * @return {void}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.finalizeClassParts_ = function (outputParts, usedBindings) {
  if (usedBindings['$v128']) {
    outputParts.splice(0, 0, 'import jdk.incubator.vector.*;');
  }
};
