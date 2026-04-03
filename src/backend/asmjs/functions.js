'use strict';

/**
 * Emits a single asm.js function body.
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
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitFunction_ = function (
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

  // Function header (indent 1 = inside module).
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {!Array<string>} */ paramNames = [];
  for (var /** @type {number} */ pi = 0; pi !== numParams; ++pi) {
    paramNames[paramNames.length] = this.localN_(pi);
  }
  parts[parts.length] = pad(1) + 'function ' + fnName + '(' + paramNames.join(', ') + ') {';

  // Parameter annotations.
  for (var /** @type {number} */ pa = 0; pa !== numParams; ++pa) {
    var /** @const {string} */ pName = this.localN_(pa);
    parts[parts.length] = pad(2) + pName + ' = ' + this.renderCoercionByType_(binaryen, pName, paramTypes[pa]) + ';';
  }

  // Local variable declarations.
  if (0 !== numVars) {
    var /** @const {!Array<string>} */ initStrs = this.buildLocalInitStrings_(binaryen, funcInfo.name, varTypes, numParams);
    var /** @const {!Array<string>} */ varDecls = [];
    for (var /** @type {number} */ vi = 0; vi !== numVars; ++vi) {
      varDecls[varDecls.length] = this.localN_(numParams + vi) + ' = ' + initStrs[vi];
    }
    parts[parts.length] = pad(2) + 'var ' + varDecls.join(', ') + ';';
  }

  // Walk the body with the code-gen visitor.
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
        usedLabels: /** @type {!Object<string, boolean>} */ (Object.create(null))
      },
      pad(2)
    );
  }

  // asm.js requires a syntactic return at the end of non-void functions.
  // Skip when the body already ends with a return to avoid unreachable-code warnings.
  if (!bodyEndsWithReturn && binaryen.none !== funcInfo.results && 0 !== funcInfo.results) {
    parts[parts.length] = pad(2) + 'return ' + this.renderCoercionByType_(binaryen, '0', funcInfo.results) + ';';
  }

  parts[parts.length] = pad(1) + '}';
  return parts.join('\n');
};
