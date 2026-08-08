'use strict';

// ---------------------------------------------------------------------------
// C# spellings for the shared class-shell emitter.  The orchestration —
// declaration order, deferred splices, helper capture, marker publication —
// lives in AbstractCodegen.emitClassCode_; this file holds only what C#
// spells differently from Java.  The single-token divergences are constructor
// fields set in codegen.js.
// ---------------------------------------------------------------------------

/**
 * Maps the asm.js stdlib Math function base names onto C#'s {@code Math}
 * methods (PascalCase; {@code ceil} → {@code Ceiling}).  Fully qualified —
 * the emitted compilation unit carries no using directives so the metadata
 * and code artifacts stay order-independent and concatenation-safe.
 *
 * @private
 * @param {string} baseName
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.csharpMathName_ = function (baseName) {
  if ('ceil' === baseName) return 'System.Math.Ceiling';
  return 'System.Math.' + baseName.charAt(0).toUpperCase() + baseName.substring(1);
};

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitCode = function (wasmModule, options) {
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
Wasm2Lang.Backend.CsharpCodegen.prototype.renderFtSigDecl_ = function (pad1, sigTypeName, returnTypeName, joinedParamDecls) {
  return pad1 + 'delegate ' + returnTypeName + ' ' + sigTypeName + '(' + joinedParamDecls + ');';
};

/**
 * @override
 * @param {string} pad1
 * @param {string} className
 * @param {string} bufferParamName
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderClassCtorOpen_ = function (pad1, className, bufferParamName) {
  return (
    pad1 +
    'public ' +
    className +
    '(System.Collections.Generic.IDictionary<string, object> foreign, byte[] ' +
    bufferParamName +
    ') {'
  );
};

/**
 * Resolve stdlib imports: the shared resolver maps the names; the C#
 * method names are derived from the base names afterwards (PascalCase).
 *
 * @override
 * @param {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} moduleInfo
 * @return {{w2lStdlibNames: !Object<string, string>, w2lStdlibGlobals: !Object<string, string>}}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.resolveClassStdlib_ = function (moduleInfo) {
  var /** @const */ stdlibBindings = Wasm2Lang.Backend.AbstractCodegen.resolveStdlibBindings_(
      moduleInfo.impFuncs,
      moduleInfo.impGlobals,
      '',
      {
        'E': 'System.Math.E',
        'LN10': '2.302585092994046',
        'LN2': '0.6931471805599453',
        'LOG2E': '1.4426950408889634',
        'LOG10E': '0.4342944819032518',
        'PI': 'System.Math.PI',
        'SQRT1_2': '0.7071067811865476',
        'SQRT2': '1.4142135623730951'
      },
      'double.PositiveInfinity',
      // Bit-exact wasm-canonical NaN — .NET's double.NaN raw pattern has the
      // sign bit set and would diverge on raw-bit memory stores.
      'System.BitConverter.Int64BitsToDouble(0x7FF8000000000000L)'
    );
  var /** @const {!Object<string, string>} */ csStdlibNames = stdlibBindings.w2lStdlibNames;
  for (var /** @const {string} */ stdlibKey in csStdlibNames) {
    csStdlibNames[stdlibKey] = Wasm2Lang.Backend.CsharpCodegen.csharpMathName_(csStdlibNames[stdlibKey]);
  }
  return stdlibBindings;
};

/**
 * @override
 * @param {string} importBaseName
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderForeignLookup_ = function (importBaseName) {
  return 'foreign["' + importBaseName + '"]';
};
