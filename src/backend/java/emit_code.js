'use strict';

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<!Wasm2Lang.OutputSink.ChunkEntry>}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitCode = function (wasmModule, options) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} */ moduleInfo =
      this.collectModuleCodegenInfo_(wasmModule);
  var /** @const {!Array<string>} */ outputParts = [];
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);

  // Class declaration — capitalise first letter, prefix with Wasm to avoid
  // collisions with java.lang.Module and other JDK classes.
  var /** @const {string} */ className = 'Wasm' + moduleName.charAt(0).toUpperCase() + moduleName.substring(1);
  outputParts[outputParts.length] = 'class ' + className + ' {';

  // Functional interfaces for function table signatures.
  var /** @const {!Array<string>} */ ftKeys = Object.keys(moduleInfo.functionTables);
  for (var /** number */ fti = 0, /** @const {number} */ ftLen = ftKeys.length; fti !== ftLen; ++fti) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ftDescI =
        moduleInfo.functionTables[ftKeys[fti]];
    var /** @const {string} */ ifaceName = this.n_('$ftsig_' + ftDescI.signatureKey);
    var /** @const {string} */ ifaceRetType = Wasm2Lang.Backend.JavaCodegen.javaTypeName_(
        binaryen,
        ftDescI.signatureReturnType
      );
    var /** @const {!Array<string>} */ ifaceParams = [];
    for (var /** number */ ip = 0, /** @const {number} */ ipLen = ftDescI.signatureParams.length; ip !== ipLen; ++ip) {
      ifaceParams[ifaceParams.length] =
        Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, ftDescI.signatureParams[ip]) + ' ' + this.localN_(ip);
    }
    outputParts[outputParts.length] =
      pad1 + '@FunctionalInterface interface ' + ifaceName + ' { ' + ifaceRetType + ' call(' + ifaceParams.join(', ') + '); }';
  }

  // Buffer field.
  outputParts[outputParts.length] = pad1 + 'java.nio.ByteBuffer ' + this.n_('buffer') + ';';

  // Import fields — stored as Object, cast at call sites.
  for (var /** number */ i = 0, /** @const {number} */ importCount = moduleInfo.impFuncs.length; i !== importCount; ++i) {
    outputParts[outputParts.length] =
      pad1 + 'Object ' + this.n_('$if_' + this.safeName_(moduleInfo.impFuncs[i].importBaseName)) + ';';
  }

  // Global fields.
  for (var /** number */ gi = 0, /** @const {number} */ gLen = moduleInfo.globals.length; gi !== gLen; ++gi) {
    var /** @const {string} */ gName = this.safeName_(moduleInfo.globals[gi].globalName);
    var /** @const {string} */ gType = Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, moduleInfo.globals[gi].globalType);
    outputParts[outputParts.length] =
      pad1 + gType + ' ' + this.n_('$g_' + gName) + ' = ' + moduleInfo.globals[gi].globalInitValue + ';';
  }

  // Function table array fields.
  for (var /** number */ ftf = 0; ftf !== ftLen; ++ftf) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ftDescF =
        moduleInfo.functionTables[ftKeys[ftf]];
    outputParts[outputParts.length] =
      pad1 + this.n_('$ftsig_' + ftDescF.signatureKey) + '[] ' + this.n_('$ftable_' + ftDescF.signatureKey) + ';';
  }

  // Constructor accepting foreign imports and buffer.
  var /** @const {string} */ bufferParamName = this.n_('buffer');
  outputParts[outputParts.length] =
    pad1 + className + '(java.util.Map<String, Object> foreign, java.nio.ByteBuffer ' + bufferParamName + ') {';
  outputParts[outputParts.length] = pad2 + 'this.' + bufferParamName + ' = ' + bufferParamName + ';';
  for (var /** number */ ci = 0; ci !== importCount; ++ci) {
    var /** @const {string} */ importSafe = this.safeName_(moduleInfo.impFuncs[ci].importBaseName);
    outputParts[outputParts.length] =
      pad2 + 'this.' + this.n_('$if_' + importSafe) + ' = foreign.get("' + moduleInfo.impFuncs[ci].importBaseName + '");';
  }
  // Reserve a slot for function table array initialisation — method
  // references resolve against methods defined later in the class, but the
  // export-name map is not yet built at this point, so actual init is
  // spliced in after the function bodies have been emitted.
  var /** @const {number} */ ftInitInsertIndex = outputParts.length;
  outputParts[outputParts.length] = pad1 + '}';

  // Build internalName → exportName map so exported methods use their
  // public export name and non-exported methods stay private.
  var /** @const {!Object<string, string>} */ exportNameMap = /** @type {!Object<string, string>} */ (Object.create(null));
  for (var /** number */ ei = 0, /** @const {number} */ eLen = moduleInfo.expFuncs.length; ei !== eLen; ++ei) {
    exportNameMap[moduleInfo.expFuncs[ei].internalName] = moduleInfo.expFuncs[ei].exportName;
  }

  // Function bodies (emitted first to discover which helpers are needed).
  this.usedHelpers_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  var /** @const {!Array<string>} */ functionParts = [];
  for (var /** number */ f = 0, /** @const {number} */ funcCount = moduleInfo.functions.length; f !== funcCount; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = moduleInfo.functions[f];
    functionParts[functionParts.length] = this.emitFunction_(
      wasmModule,
      binaryen,
      funcInfo,
      moduleInfo.importedNames,
      moduleInfo.functionSignatures,
      moduleInfo.globalTypes,
      exportNameMap,
      moduleInfo.functionTables
    );
  }

  // Helper methods (only those referenced by function bodies).
  var /** @const {!Array<string>} */ helperLines = this.emitHelpers_();
  this.usedHelpers_ = null;
  for (var /** number */ hi = 0, /** @const {number} */ helperCount = helperLines.length; hi !== helperCount; ++hi) {
    outputParts[outputParts.length] = helperLines[hi];
  }

  // Function table array initialisation — splice into constructor now that
  // the export-name map exists and method references can be resolved.
  var /** @const {!Array<string>} */ ftInitLines = [];
  for (var /** number */ fta = 0; fta !== ftLen; ++fta) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ftDescA =
        moduleInfo.functionTables[ftKeys[fta]];
    var /** @const {string} */ ftaSigKey = ftDescA.signatureKey;
    var /** @const {string} */ ftaIfaceName = this.n_('$ftsig_' + ftaSigKey);
    var /** @const {string} */ ftaArrayName = this.n_('$ftable_' + ftaSigKey);
    var /** @const {boolean} */ ftaHasReturn =
        ftDescA.signatureReturnType !== binaryen.none && 0 !== ftDescA.signatureReturnType;
    // Build stub lambda for null entries.
    var /** @const {!Array<string>} */ lambdaParams = [];
    for (var /** number */ lp = 0, /** @const {number} */ lpLen = ftDescA.signatureParams.length; lp !== lpLen; ++lp) {
      lambdaParams[lambdaParams.length] = this.localN_(lp);
    }
    var /** @type {string} */ stubLambda;
    if (ftaHasReturn) {
      stubLambda = '(' + lambdaParams.join(', ') + ') -> ' + this.renderLocalInit_(binaryen, ftDescA.signatureReturnType);
    } else {
      stubLambda = '(' + lambdaParams.join(', ') + ') -> {}';
    }
    // Build array entries.
    var /** @const {!Array<string>} */ entryExprs = [];
    for (var /** number */ te = 0, /** @const {number} */ teLen = ftDescA.tableEntries.length; te !== teLen; ++te) {
      var /** @const {string|null} */ funcName = ftDescA.tableEntries[te].functionName;
      if (null === funcName) {
        entryExprs[entryExprs.length] = stubLambda;
      } else {
        var /** @const {boolean} */ fnIsExported = funcName in exportNameMap;
        var /** @const {string} */ resolvedName = fnIsExported ? exportNameMap[funcName] : funcName;
        var /** @const {string} */ methodRefName = fnIsExported
            ? this.safeName_(resolvedName)
            : this.n_(this.safeName_(resolvedName));
        entryExprs[entryExprs.length] = 'this::' + methodRefName;
      }
    }
    ftInitLines[ftInitLines.length] =
      pad2 + 'this.' + ftaArrayName + ' = new ' + ftaIfaceName + '[] { ' + entryExprs.join(', ') + ' };';
  }
  // Splice init lines into the constructor (just before the closing brace).
  for (var /** number */ fts = ftInitLines.length - 1; fts >= 0; --fts) {
    outputParts.splice(ftInitInsertIndex, 0, ftInitLines[fts]);
  }

  // Append function bodies.
  for (var /** number */ fi = 0, /** @const {number} */ fpLen = functionParts.length; fi !== fpLen; ++fi) {
    outputParts[outputParts.length] = functionParts[fi];
  }

  outputParts[outputParts.length] = '}';

  // Traversal summary.
  // prettier-ignore
  outputParts[outputParts.length] = /** @type {string} */ (Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode.call(this, wasmModule, options));

  return Wasm2Lang.OutputSink.interleaveNewlines(outputParts);
};
