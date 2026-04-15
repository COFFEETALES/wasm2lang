'use strict';

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitCode = function (wasmModule, options) {
  this.initDiagnostics_();

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
  for (var /** @type {number} */ fti = 0, /** @const {number} */ ftLen = ftKeys.length; fti !== ftLen; ++fti) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ftDescI =
        moduleInfo.functionTables[ftKeys[fti]];
    var /** @const {string} */ ifaceName = this.n_('$ftsig_' + ftDescI.signatureKey);
    var /** @const {string} */ ifaceRetType = Wasm2Lang.Backend.JavaCodegen.javaTypeName_(
        binaryen,
        ftDescI.signatureReturnType
      );
    var /** @const {!Array<string>} */ ifaceParams = [];
    for (var /** @type {number} */ ip = 0, /** @const {number} */ ipLen = ftDescI.signatureParams.length; ip !== ipLen; ++ip) {
      ifaceParams[ifaceParams.length] =
        Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, ftDescI.signatureParams[ip]) + ' ' + this.localN_(ip);
    }
    outputParts[outputParts.length] =
      pad1 + '@FunctionalInterface interface ' + ifaceName + ' { ' + ifaceRetType + ' call(' + ifaceParams.join(', ') + '); }';
  }

  // Buffer field.
  outputParts[outputParts.length] = pad1 + 'java.nio.ByteBuffer ' + this.n_('buffer') + ';';

  // Resolve stdlib imports.
  var /** @const */ stdlibBindings = Wasm2Lang.Backend.AbstractCodegen.resolveStdlibBindings_(
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
  var /** @const {!Object<string, string>} */ javaStdlibNames = stdlibBindings.w2lStdlibNames;
  var /** @const {!Object<string, string>} */ javaStdlibGlobals = stdlibBindings.w2lStdlibGlobals;

  // Import fields and global fields are emitted conditionally after function
  // body traversal (see usedBindings_ below).  Reserve an insertion index.
  var /** @const {number} */ fieldInsertIndex = outputParts.length;

  // Function table array fields.
  for (var /** @type {number} */ ftf = 0; ftf !== ftLen; ++ftf) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ftDescF =
        moduleInfo.functionTables[ftKeys[ftf]];
    outputParts[outputParts.length] =
      pad1 + this.n_('$ftsig_' + ftDescF.signatureKey) + '[] ' + this.n_('$ftable_' + ftDescF.signatureKey) + ';';
  }

  // Constructor accepting foreign imports and buffer.
  // Import assignments are deferred until after function body emission.
  var /** @const {string} */ bufferParamName = this.n_('buffer');
  outputParts[outputParts.length] =
    pad1 + className + '(java.util.Map<String, Object> foreign, java.nio.ByteBuffer ' + bufferParamName + ') {';
  outputParts[outputParts.length] = pad2 + 'this.' + bufferParamName + ' = ' + bufferParamName + ';';
  var /** @const {number} */ importAssignInsertIndex = outputParts.length;
  // Reserve a slot for function table array initialisation — method
  // references resolve against methods defined later in the class, but the
  // export-name map is not yet built at this point, so actual init is
  // spliced in after the function bodies have been emitted.
  var /** @const {number} */ ftInitInsertIndex = outputParts.length;
  outputParts[outputParts.length] = pad1 + '}';

  // Build internalName → exportName map so exported methods use their
  // public export name and non-exported methods stay private.
  var /** @const {!Object<string, string>} */ exportNameMap = /** @type {!Object<string, string>} */ (Object.create(null));
  for (var /** @type {number} */ ei = 0, /** @const {number} */ eLen = moduleInfo.expFuncs.length; ei !== eLen; ++ei) {
    exportNameMap[moduleInfo.expFuncs[ei].internalName] = moduleInfo.expFuncs[ei].exportName;
  }

  // Function bodies (emitted first to discover which helpers and bindings are needed).
  this.usedHelpers_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  this.usedBindings_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  this.castNames_ = moduleInfo.castNames;
  var /** @const {!Array<string>} */ functionParts = [];
  for (var /** @type {number} */ f = 0, /** @const {number} */ funcCount = moduleInfo.functions.length; f !== funcCount; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = moduleInfo.functions[f];
    functionParts[functionParts.length] = this.emitFunction_(
      wasmModule,
      binaryen,
      funcInfo,
      moduleInfo.importedNames,
      moduleInfo.functionSignatures,
      moduleInfo.globalTypes,
      exportNameMap,
      moduleInfo.functionTables,
      javaStdlibNames,
      javaStdlibGlobals
    );
  }

  // Helper methods (only those referenced by function bodies).
  var /** @const {!Array<string>} */ helperLines = this.emitHelpers_();
  this.usedHelpers_ = null;
  this.castNames_ = null;
  var /** @const {!Object<string, boolean>} */ jub = /** @type {!Object<string, boolean>} */ (this.usedBindings_);
  this.usedBindings_ = null;

  // Force-mark exported globals as used so their field bindings are emitted.
  for (
    var /** @type {number} */ jegm = 0, /** @const {number} */ jegmLen = moduleInfo.expGlobals.length;
    jegm !== jegmLen;
    ++jegm
  ) {
    jub['$g_' + this.safeName_(moduleInfo.expGlobals[jegm].internalName)] = true;
  }

  for (var /** @type {number} */ hi = 0, /** @const {number} */ helperCount = helperLines.length; hi !== helperCount; ++hi) {
    outputParts[outputParts.length] = helperLines[hi];
  }

  // Splice conditional import fields, global fields, and constructor
  // import assignments now that usedBindings_ is available.
  var /** @const {!Array<string>} */ javaFieldLines = [];
  var /** @const {!Array<string>} */ javaAssignLines = [];
  var /** @const {number} */ javaImpCount = moduleInfo.impFuncs.length;
  for (var /** @type {number} */ ji = 0; ji !== javaImpCount; ++ji) {
    if (moduleInfo.impFuncs[ji].wasmFuncName in javaStdlibNames) {
      continue;
    }
    var /** @const {string} */ jImpKey = '$if_' + this.safeName_(moduleInfo.impFuncs[ji].importBaseName);
    if (!jub[jImpKey]) {
      continue;
    }
    javaFieldLines[javaFieldLines.length] = pad1 + 'Object ' + this.n_(jImpKey) + ';';
    javaAssignLines[javaAssignLines.length] =
      pad2 + 'this.' + this.n_(jImpKey) + ' = foreign.get("' + moduleInfo.impFuncs[ji].importBaseName + '");';
  }
  for (var /** @type {number} */ jgf = 0, /** @const {number} */ jgfLen = moduleInfo.globals.length; jgf !== jgfLen; ++jgf) {
    var /** @const {string} */ jGlobalKey = '$g_' + this.safeName_(moduleInfo.globals[jgf].globalName);
    if (!jub[jGlobalKey]) {
      continue;
    }
    var /** @const {string} */ jGlobalType = Wasm2Lang.Backend.JavaCodegen.javaTypeName_(
        binaryen,
        moduleInfo.globals[jgf].globalType
      );
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_} */ jGlobalInfo = moduleInfo.globals[jgf];
    var /** @const {string} */ jGlobalInit = Wasm2Lang.Backend.ValueType.isI64(binaryen, jGlobalInfo.globalType)
        ? this.renderI64Const_(binaryen, jGlobalInfo.globalInitValue)
        : this.renderConst_(binaryen, /** @type {number} */ (jGlobalInfo.globalInitValue), jGlobalInfo.globalType);
    javaFieldLines[javaFieldLines.length] = pad1 + jGlobalType + ' ' + this.n_(jGlobalKey) + ' = ' + jGlobalInit + ';';
  }
  for (var /** @type {number} */ jfs = javaFieldLines.length - 1; jfs >= 0; --jfs) {
    outputParts.splice(fieldInsertIndex, 0, javaFieldLines[jfs]);
  }
  // Adjust importAssignInsertIndex by the number of field lines inserted before it.
  var /** @const {number} */ adjustedAssignIndex = importAssignInsertIndex + javaFieldLines.length;
  for (var /** @type {number} */ jas = javaAssignLines.length - 1; jas >= 0; --jas) {
    outputParts.splice(adjustedAssignIndex, 0, javaAssignLines[jas]);
  }

  // Function table array initialisation — splice into constructor now that
  // the export-name map exists and method references can be resolved.
  var /** @const {!Array<string>} */ ftInitLines = [];
  for (var /** @type {number} */ fta = 0; fta !== ftLen; ++fta) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ftDescA =
        moduleInfo.functionTables[ftKeys[fta]];
    var /** @const {string} */ ftaSigKey = ftDescA.signatureKey;
    var /** @const {string} */ ftaIfaceName = this.n_('$ftsig_' + ftaSigKey);
    var /** @const {string} */ ftaArrayName = this.n_('$ftable_' + ftaSigKey);
    var /** @const {boolean} */ ftaHasReturn =
        binaryen.none !== ftDescA.signatureReturnType && 0 !== ftDescA.signatureReturnType;
    // Build stub lambda for null entries.
    var /** @const {!Array<string>} */ lambdaParams = [];
    for (var /** @type {number} */ lp = 0, /** @const {number} */ lpLen = ftDescA.signatureParams.length; lp !== lpLen; ++lp) {
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
    for (var /** @type {number} */ te = 0, /** @const {number} */ teLen = ftDescA.tableEntries.length; te !== teLen; ++te) {
      var /** @const {string|null} */ funcName = ftDescA.tableEntries[te].boundName;
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
  for (var /** @type {number} */ fts = ftInitLines.length - 1; fts >= 0; --fts) {
    outputParts.splice(ftInitInsertIndex + javaFieldLines.length + javaAssignLines.length, 0, ftInitLines[fts]);
  }

  // Append function bodies.
  for (var /** @type {number} */ fi = 0, /** @const {number} */ fpLen = functionParts.length; fi !== fpLen; ++fi) {
    outputParts[outputParts.length] = functionParts[fi];
  }

  // Exported global accessor methods.
  for (var /** @type {number} */ jeg = 0, /** @const {number} */ jegLen = moduleInfo.expGlobals.length; jeg !== jegLen; ++jeg) {
    // prettier-ignore
    var /** @const {string} */ jegType =
        Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, moduleInfo.expGlobals[jeg].globalType);
    var /** @const {string} */ jegField = this.n_('$g_' + this.safeName_(moduleInfo.expGlobals[jeg].internalName));
    var /** @const {string} */ jegGetterName = this.safeName_(moduleInfo.expGlobals[jeg].exportName);
    outputParts[outputParts.length] =
      pad1 + 'public ' + jegType + ' ' + jegGetterName + '() {\n' + pad2 + 'return this.' + jegField + ';\n' + pad1 + '}';
    if (moduleInfo.expGlobals[jeg].globalMutable) {
      var /** @const {string} */ jegSetterParam = this.localN_(0);
      outputParts[outputParts.length] =
        pad1 +
        'public void ' +
        this.safeName_(moduleInfo.expGlobals[jeg].exportName + '$set') +
        '(' +
        jegType +
        ' ' +
        jegSetterParam +
        ') {\n' +
        pad2 +
        'this.' +
        jegField +
        ' = ' +
        jegSetterParam +
        ';\n' +
        pad1 +
        '}';
    }
  }

  outputParts[outputParts.length] = '}';

  // Emit Vector API import when any SIMD operation was emitted.
  if (jub['$v128']) {
    outputParts.splice(0, 0, 'import jdk.incubator.vector.*;');
  }

  // Traversal summary from data collected during the codegen traversal above.
  outputParts[outputParts.length] = this.emitDiagnosticSummary_(wasmModule, options);

  return outputParts.join('\n');
};
