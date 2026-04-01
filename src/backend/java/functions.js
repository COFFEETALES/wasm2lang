'use strict';

/**
 * Emits a single Java method body.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Object<string, string>} importedNames
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} functionSignatures
 * @param {!Object<string, number>} globalTypes
 * @param {!Object<string, string>} exportNameMap
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_>} functionTables
 * @param {?Object<string, string>=} opt_stdlibNames
 * @param {?Object<string, string>=} opt_stdlibGlobals
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitFunction_ = function (
  wasmModule,
  binaryen,
  funcInfo,
  importedNames,
  functionSignatures,
  globalTypes,
  exportNameMap,
  functionTables,
  opt_stdlibNames,
  opt_stdlibGlobals
) {
  var /** @const {!Array<string>} */ parts = [];
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);
  var /** @const {boolean} */ isExported = funcInfo.name in exportNameMap;
  var /** @const {string} */ fnName = isExported
      ? this.safeName_(exportNameMap[funcInfo.name])
      : this.n_(this.safeName_(funcInfo.name));
  var /** @const {string} */ visibility = isExported ? '' : 'private ';
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(funcInfo.params);
  var /** @const {number} */ numParams = paramTypes.length;
  var /** @const {!Array<number>} */ varTypes = /** @type {!Array<number>} */ (funcInfo.vars) || [];
  var /** @const {number} */ numVars = varTypes.length;
  var /** @const {string} */ returnType = Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, funcInfo.results);

  // Method header (indent 1 = inside class).
  var /** @const {!Array<string>} */ paramDecls = [];
  for (var /** @type {number} */ pi = 0; pi !== numParams; ++pi) {
    paramDecls[paramDecls.length] =
      Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, paramTypes[pi]) + ' ' + this.localN_(pi);
  }
  parts[parts.length] = pad1 + visibility + returnType + ' ' + fnName + '(' + paramDecls.join(', ') + ') {';

  // Local variable declarations.
  if (0 !== numVars) {
    var /** @const {!Array<string>} */ initStrs = this.buildLocalInitStrings_(binaryen, funcInfo.name, varTypes, numParams);
    for (var /** @type {number} */ vi = 0; vi !== numVars; ++vi) {
      var /** @const {number} */ localIdx = numParams + vi;
      parts[parts.length] =
        pad2 +
        Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, varTypes[vi]) +
        ' ' +
        this.localN_(localIdx) +
        ' = ' +
        initStrs[vi] +
        ';';
    }
  }

  // Walk the body with the code-gen visitor.
  if (0 !== funcInfo.body) {
    this.walkAndAppendBody_(
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
        exportNameMap: exportNameMap,
        indent: 2,
        lastExprIsTerminal: false,
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
      pad2
    );
  }

  parts[parts.length] = pad1 + '}';
  return parts.join('\n');
};
