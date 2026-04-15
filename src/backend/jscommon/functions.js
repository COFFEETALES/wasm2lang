'use strict';

// ---------------------------------------------------------------------------
// Shared function-body emitter for the JavaScript-family backends.
//
// Both asm.js and modern JavaScript share the same skeleton: header, optional
// parameter annotations, local declarations, traversal-driven body, optional
// return stabilizer, closing brace.  The only divergence is parameter
// coercion annotations ({@code x = x | 0;}), which asm.js requires for the
// validator and modern JS skips.  That divergence is captured by the
// {@code emitParameterAnnotations_} hook — a no-op here, overridden by the
// asm.js backend.
// ---------------------------------------------------------------------------

/**
 * Default no-op parameter-annotation hook.  Backends that require boundary
 * coercions on every parameter (asm.js) override this.
 *
 * @protected
 * @param {!Array<string>} parts
 * @param {!Binaryen} binaryen
 * @param {!Array<number>} paramTypes
 * @param {number} numParams
 * @param {string} indentStr
 * @return {void}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.emitParameterAnnotations_ = function (
  parts,
  binaryen,
  paramTypes,
  numParams,
  indentStr
) {};

/**
 * Emits a single function body for the JS-family backends.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Object<string, string>} importedNames
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} functionSignatures
 * @param {!Object<string, number>} globalTypes
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_>} functionTables
 * @param {?Object<string, string>=} opt_stdlibNames
 * @param {?Object<string, string>=} opt_stdlibGlobals
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.emitFunction_ = function (
  wasmModule,
  binaryen,
  funcInfo,
  importedNames,
  functionSignatures,
  globalTypes,
  functionTables,
  opt_stdlibNames,
  opt_stdlibGlobals
) {
  var /** @const {!Array<string>} */ parts = [];
  var /** @const {string} */ fnName = this.n_(this.safeName_(funcInfo.name));
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(funcInfo.params);
  var /** @const {number} */ numParams = paramTypes.length;
  var /** @const {!Array<number>} */ varTypes = /** @type {!Array<number>} */ (funcInfo.vars) || [];
  var /** @const {number} */ numVars = varTypes.length;
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {!Array<string>} */ paramNames = [];
  for (var /** @type {number} */ pi = 0; pi !== numParams; ++pi) {
    paramNames[paramNames.length] = this.localN_(pi);
  }
  parts[parts.length] = pad(1) + 'function ' + fnName + '(' + paramNames.join(', ') + ') {';

  this.emitParameterAnnotations_(parts, binaryen, paramTypes, numParams, pad(2));

  if (0 !== numVars) {
    var /** @const {!Array<string>} */ initStrs = this.buildLocalInitStrings_(binaryen, funcInfo.name, varTypes, numParams);
    var /** @const {!Array<string>} */ varDecls = [];
    for (var /** @type {number} */ vi = 0; vi !== numVars; ++vi) {
      varDecls[varDecls.length] = this.localN_(numParams + vi) + ' = ' + initStrs[vi];
    }
    parts[parts.length] = pad(2) + 'var ' + varDecls.join(', ') + ';';
  }

  var /** @type {boolean} */ bodyEndsWithReturn = false;
  if (0 !== funcInfo.body) {
    bodyEndsWithReturn = this.walkAndAppendBody_(
      parts,
      wasmModule,
      binaryen,
      funcInfo,
      {
        binaryen: binaryen,
        functionInfo: funcInfo,
        functionSignatures: functionSignatures,
        globalTypes: globalTypes,
        functionTables: functionTables,
        labelKinds: /** @type {!Object<string, string>} */ (Object.create(null)),
        labelMap: /** @type {!Object<string, number>} */ (Object.create(null)),
        importedNames: importedNames,
        stdlibNames: opt_stdlibNames || null,
        stdlibGlobals: opt_stdlibGlobals || null,
        indent: 2,
        wasmModule: wasmModule,
        visitor: null,
        fusedBlockToLoop: /** @type {!Object<string, string>} */ (Object.create(null)),
        pendingBlockFusion: '',
        currentLoopName: '',
        rootSwitchExitMap: null,
        rootSwitchRsName: '',
        rootSwitchLoopName: '',
        breakableStack: [],
        usedLabels: /** @type {!Object<string, boolean>} */ (Object.create(null)),
        lastExprIsTerminal: false,
        pendingLoopKind: ''
      },
      pad(2)
    );
  }

  // Asm.js requires a syntactic return at the end of non-void functions; modern
  // JS keeps the same stabilizer so fall-through returns retain a coherent type.
  if (!bodyEndsWithReturn && binaryen.none !== funcInfo.results && 0 !== funcInfo.results) {
    parts[parts.length] = pad(2) + 'return ' + this.renderCoercionByType_(binaryen, '0', funcInfo.results) + ';';
  }

  parts[parts.length] = pad(1) + '}';
  return parts.join('\n');
};
