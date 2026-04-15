'use strict';

// ---------------------------------------------------------------------------
// Shared module-shell emitter for the JavaScript-family backends.
//
// Both asm.js and modern JavaScript emit a stdlib/foreign/buffer-tripled
// closure with the same overall shape: header, conditional binding
// declarations, conditional helpers, function bodies, function-table stubs +
// declarations, exported global accessors, return object, diagnostic summary.
//
// The point-divergences are:
//   • Module-function name ({@code asmjsModule} vs {@code javascriptModule})
//   • Optional {@code "use asm";} directive
//   • Heap binding table (modern JS adds {@code HEAP64})
//   • Heap / Math / Math-constant / Infinity / NaN initializer syntax
//   • Module-level global init expression (i64-aware in modern JS)
//   • Function-table stub parameter annotations (asm.js only)
//   • Exported global getter return coercion (asm.js only)
//   • Exported global setter parameter annotation (asm.js only)
//
// Each divergence is captured by a protected hook method.  The base class
// here defines the modern-JS defaults; the asm.js backend overrides each
// hook in {@code asmjs/emit_code.js}.
// ---------------------------------------------------------------------------

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.emitCode = function (wasmModule, options) {
  this.initDiagnostics_();

  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {number} */ heapSize = this.resolveHeapSize_(options, 'ASMJS_HEAP_SIZE', 65536);
  var /** @const {number} */ scratchByteOffset = heapSize - 8;
  var /** @const {number} */ scratchWordIndex = scratchByteOffset >>> 2;
  var /** @const {number} */ scratchQwordIndex = scratchByteOffset >>> 3;
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} */ moduleInfo =
      this.collectModuleCodegenInfo_(wasmModule);
  var /** @const {!Array<string>} */ outputParts = [];
  var /** @const {string} */ pad1 = Wasm2Lang.Backend.AbstractCodegen.pad_(1);
  var /** @const {string} */ pad2 = Wasm2Lang.Backend.AbstractCodegen.pad_(2);

  var /** @const {string} */ moduleFnName = this.n_(this.getModuleFunctionBindingName_());
  var /** @const {string} */ stdlibName = this.n_('stdlib');
  var /** @const {string} */ foreignName = this.n_('foreign');
  var /** @const {string} */ bufferName = this.n_('buffer');
  outputParts[outputParts.length] =
    'var ' + moduleName + ' = function ' + moduleFnName + '(' + stdlibName + ', ' + foreignName + ', ' + bufferName + ') {';
  this.emitUseAsmDirective_(outputParts, pad1);

  // Reserve the slot where conditional binding declarations are spliced in
  // after function bodies report which bindings/helpers they reference.
  var /** @const {number} */ bindingsInsertIndex = outputParts.length;

  var /** @const {!Object<string, string>} */ stdlibNames = /** @type {!Object<string, string>} */ (Object.create(null));
  var /** @const {!Object<string, string>} */ stdlibGlobals = /** @type {!Object<string, string>} */ (Object.create(null));
  var /** @const */ classify = Wasm2Lang.Backend.AbstractCodegen.classifyStdlibImport;
  var /** @const {number} */ impFuncCount = moduleInfo.impFuncs.length;
  for (var /** @type {number} */ ii = 0; ii !== impFuncCount; ++ii) {
    if ('math_func' === classify(moduleInfo.impFuncs[ii].importModule, moduleInfo.impFuncs[ii].importBaseName)) {
      stdlibNames[moduleInfo.impFuncs[ii].wasmFuncName] = 'Math_' + moduleInfo.impFuncs[ii].importBaseName;
    }
  }
  var /** @const {number} */ impGlobalCount = moduleInfo.impGlobals.length;
  for (var /** @type {number} */ ig = 0; ig !== impGlobalCount; ++ig) {
    var /** @const {string} */ igKind = classify(
        moduleInfo.impGlobals[ig].importModule,
        moduleInfo.impGlobals[ig].importBaseName
      );
    if ('math_const' === igKind) {
      stdlibGlobals[moduleInfo.impGlobals[ig].globalName] = 'Math_' + moduleInfo.impGlobals[ig].importBaseName;
    } else if ('global_value' === igKind) {
      stdlibGlobals[moduleInfo.impGlobals[ig].globalName] = '$g_' + moduleInfo.impGlobals[ig].importBaseName;
    }
  }

  this.heapPageCount_ = heapSize / 65536;
  this.usedHelpers_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  this.usedBindings_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  this.castNames_ = moduleInfo.castNames;

  var /** @const {!Array<string>} */ functionParts = [];
  var /** @const {number} */ funcCount = moduleInfo.functions.length;
  for (var /** @type {number} */ f = 0; f !== funcCount; ++f) {
    functionParts[functionParts.length] = this.emitFunction_(
      wasmModule,
      binaryen,
      moduleInfo.functions[f],
      moduleInfo.importedNames,
      moduleInfo.functionSignatures,
      moduleInfo.globalTypes,
      moduleInfo.functionTables,
      stdlibNames,
      stdlibGlobals
    );
  }

  var /** @const {!Array<string>} */ helperLines = this.emitHelpers_(
      scratchByteOffset,
      scratchWordIndex,
      scratchQwordIndex,
      this.heapPageCount_
    );
  var /** @const {!Object<string, boolean>} */ ub = /** @type {!Object<string, boolean>} */ (this.usedBindings_);
  this.usedHelpers_ = null;
  this.usedBindings_ = null;
  this.castNames_ = null;
  this.heapPageCount_ = 0;

  // Force-mark exported globals, stdlib functions, and stdlib globals so their
  // bindings emit unconditionally even when no function body references them
  // directly (the runner harness reaches them through the export object).
  var /** @const {number} */ expGlobalCount = moduleInfo.expGlobals.length;
  for (var /** @type {number} */ egm = 0; egm !== expGlobalCount; ++egm) {
    ub['$g_' + this.safeName_(moduleInfo.expGlobals[egm].internalName)] = true;
  }
  var /** @const {!Array<string>} */ stdlibFuncKeys = Object.keys(stdlibNames);
  for (var /** @type {number} */ sf = 0, /** @const {number} */ sfLen = stdlibFuncKeys.length; sf !== sfLen; ++sf) {
    ub[stdlibNames[stdlibFuncKeys[sf]]] = true;
  }
  var /** @const {!Array<string>} */ stdlibGlobalKeys = Object.keys(stdlibGlobals);
  for (var /** @type {number} */ sg = 0, /** @const {number} */ sgLen = stdlibGlobalKeys.length; sg !== sgLen; ++sg) {
    ub[stdlibGlobals[stdlibGlobalKeys[sg]]] = true;
  }

  var /** @const {!Array<string>} */ bindingLines = [];
  var /** @const */ self = this;
  /** @param {string} name @param {string} initExpr @return {void} */
  var pushBinding = function (name, initExpr) {
    if (ub[name]) bindingLines[bindingLines.length] = pad1 + 'var ' + self.n_(name) + ' = ' + initExpr + ';';
  };

  var /** @const {!Array<!Array<string>>} */ heapBindings = this.getHeapBindingTable_();
  for (var /** @type {number} */ hbi = 0, /** @const {number} */ hbLen = heapBindings.length; hbi !== hbLen; ++hbi) {
    pushBinding(heapBindings[hbi][0], this.renderHeapInitializer_(heapBindings[hbi][1], stdlibName, bufferName));
  }

  var /** @const {!Array<string>} */ mathBindings = Wasm2Lang.Backend.JsCommonCodegen.MATH_FUNCTION_BINDINGS_;
  for (var /** @type {number} */ mbi = 0, /** @const {number} */ mbLen = mathBindings.length; mbi !== mbLen; ++mbi) {
    pushBinding(mathBindings[mbi], this.renderMathFunctionInitializer_(mathBindings[mbi], stdlibName));
  }

  var /** @const {!Array<string>} */ mathConstBindings = Wasm2Lang.Backend.JsCommonCodegen.MATH_CONSTANT_BINDINGS_;
  for (var /** @type {number} */ mci = 0, /** @const {number} */ mcLen = mathConstBindings.length; mci !== mcLen; ++mci) {
    pushBinding(mathConstBindings[mci], this.renderMathConstantInitializer_(mathConstBindings[mci], foreignName));
  }

  pushBinding('$g_Infinity', this.renderInfinityInitializer_(foreignName));
  pushBinding('$g_NaN', this.renderNaNInitializer_(foreignName));

  for (var /** @type {number} */ ci = 0; ci !== impFuncCount; ++ci) {
    if (moduleInfo.impFuncs[ci].wasmFuncName in stdlibNames) continue;
    var /** @const {string} */ ciKey = '$if_' + moduleInfo.impFuncs[ci].importBaseName;
    pushBinding(ciKey, foreignName + '.' + moduleInfo.impFuncs[ci].importBaseName);
  }
  pushBinding('$w2l_trap', foreignName + '.__wasm2lang_trap');

  var /** @const {number} */ globalCount = moduleInfo.globals.length;
  for (var /** @type {number} */ cgi = 0; cgi !== globalCount; ++cgi) {
    var /** @const {string} */ cgKey = '$g_' + this.safeName_(moduleInfo.globals[cgi].globalName);
    pushBinding(cgKey, this.renderModuleGlobalInitExpr_(binaryen, moduleInfo.globals[cgi]));
  }

  for (var /** @type {number} */ bi = bindingLines.length - 1; bi >= 0; --bi) {
    outputParts.splice(bindingsInsertIndex, 0, bindingLines[bi]);
  }
  for (var /** @type {number} */ hi = 0, /** @const {number} */ helperCount = helperLines.length; hi !== helperCount; ++hi) {
    outputParts[outputParts.length] = helperLines[hi];
  }
  for (var /** @type {number} */ fi = 0, /** @const {number} */ fpLen = functionParts.length; fi !== fpLen; ++fi) {
    outputParts[outputParts.length] = functionParts[fi];
  }

  var /** @const {!Array<string>} */ ftKeys = Object.keys(moduleInfo.functionTables);
  var /** @const {number} */ ftLen = ftKeys.length;
  for (var /** @type {number} */ fti = 0; fti !== ftLen; ++fti) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ftDesc =
        moduleInfo.functionTables[ftKeys[fti]];
    if (!ftDesc.stubNeeded) continue;
    var /** @const {string} */ ftSigKey = ftDesc.signatureKey;
    var /** @const {string} */ stubName = this.n_('$ftable_' + ftSigKey + '_stub');
    var /** @const {!Array<string>} */ stubParams = [];
    var /** @const {number} */ stubParamCount = ftDesc.signatureParams.length;
    for (var /** @type {number} */ sp = 0; sp !== stubParamCount; ++sp) {
      stubParams[stubParams.length] = this.localN_(sp);
    }
    var /** @const {!Array<string>} */ stubAnnotationLines = [];
    this.emitParameterAnnotations_(stubAnnotationLines, binaryen, ftDesc.signatureParams, stubParamCount, pad2);
    var /** @type {string} */ stubReturn = '';
    if (binaryen.none !== ftDesc.signatureReturnType && 0 !== ftDesc.signatureReturnType) {
      stubReturn = pad2 + 'return ' + this.renderCoercionByType_(binaryen, '0', ftDesc.signatureReturnType) + ';\n';
    }
    outputParts[outputParts.length] =
      pad1 +
      'function ' +
      stubName +
      '(' +
      stubParams.join(', ') +
      ') {\n' +
      stubAnnotationLines.join('\n') +
      (stubAnnotationLines.length ? '\n' : '') +
      stubReturn +
      pad1 +
      '}';
  }

  for (var /** @type {number} */ ftv = 0; ftv !== ftLen; ++ftv) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ftDesc2 =
        moduleInfo.functionTables[ftKeys[ftv]];
    var /** @const {string} */ ftSigKey2 = ftDesc2.signatureKey;
    var /** @const {string} */ ftTableName = this.n_('$ftable_' + ftSigKey2);
    var /** @const {!Array<string>} */ tableEntryNames = [];
    var /** @const {number} */ teLen = ftDesc2.tableEntries.length;
    for (var /** @type {number} */ te = 0; te !== teLen; ++te) {
      var /** @const {string|null} */ funcName = ftDesc2.tableEntries[te].boundName;
      tableEntryNames[tableEntryNames.length] =
        null === funcName ? this.n_('$ftable_' + ftSigKey2 + '_stub') : this.n_(this.safeName_(funcName));
    }
    outputParts[outputParts.length] = pad1 + 'var ' + ftTableName + ' = [' + tableEntryNames.join(', ') + '];';
  }

  for (var /** @type {number} */ eg = 0; eg !== expGlobalCount; ++eg) {
    var /** @const {string} */ egVarName = this.n_('$g_' + this.safeName_(moduleInfo.expGlobals[eg].internalName));
    var /** @const {string} */ egGetterName = this.n_('$get_' + this.safeName_(moduleInfo.expGlobals[eg].exportName));
    outputParts[outputParts.length] =
      pad1 +
      'function ' +
      egGetterName +
      '() {\n' +
      pad2 +
      'return ' +
      this.renderExportedGlobalGetterReturn_(binaryen, egVarName, moduleInfo.expGlobals[eg].globalType) +
      ';\n' +
      pad1 +
      '}';
    if (moduleInfo.expGlobals[eg].globalMutable) {
      var /** @const {string} */ egSetterName = this.n_('$set_' + this.safeName_(moduleInfo.expGlobals[eg].exportName));
      var /** @const {string} */ egParam = this.localN_(0);
      var /** @const {!Array<string>} */ setterAnnotationLines = [];
      this.emitParameterAnnotations_(setterAnnotationLines, binaryen, [moduleInfo.expGlobals[eg].globalType], 1, pad2);
      outputParts[outputParts.length] =
        pad1 +
        'function ' +
        egSetterName +
        '(' +
        egParam +
        ') {\n' +
        setterAnnotationLines.join('\n') +
        (setterAnnotationLines.length ? '\n' : '') +
        pad2 +
        egVarName +
        ' = ' +
        egParam +
        ';\n' +
        pad1 +
        '}';
    }
  }

  var /** @const {!Array<string>} */ returnEntries = [];
  var /** @const {number} */ exportCount = moduleInfo.expFuncs.length;
  for (var /** @type {number} */ r = 0; r !== exportCount; ++r) {
    returnEntries[returnEntries.length] =
      moduleInfo.expFuncs[r].exportName + ': ' + this.n_(this.safeName_(moduleInfo.expFuncs[r].internalName));
  }
  for (var /** @type {number} */ egr = 0; egr !== expGlobalCount; ++egr) {
    returnEntries[returnEntries.length] =
      moduleInfo.expGlobals[egr].exportName + ': ' + this.n_('$get_' + this.safeName_(moduleInfo.expGlobals[egr].exportName));
    if (moduleInfo.expGlobals[egr].globalMutable) {
      returnEntries[returnEntries.length] =
        moduleInfo.expGlobals[egr].exportName +
        '$set: ' +
        this.n_('$set_' + this.safeName_(moduleInfo.expGlobals[egr].exportName));
    }
  }
  outputParts[outputParts.length] = pad1 + 'return { ' + returnEntries.join(', ') + ' };';
  outputParts[outputParts.length] = '};';
  outputParts[outputParts.length] = this.emitDiagnosticSummary_(wasmModule, options);

  return outputParts.join('\n');
};

// ---------------------------------------------------------------------------
// Static binding tables.
// ---------------------------------------------------------------------------

/** @const {!Array<string>} */
Wasm2Lang.Backend.JsCommonCodegen.MATH_FUNCTION_BINDINGS_ = [
  'Math_imul',
  'Math_clz32',
  'Math_fround',
  'Math_abs',
  'Math_acos',
  'Math_asin',
  'Math_atan',
  'Math_atan2',
  'Math_ceil',
  'Math_cos',
  'Math_exp',
  'Math_floor',
  'Math_log',
  'Math_min',
  'Math_max',
  'Math_pow',
  'Math_sin',
  'Math_sqrt',
  'Math_tan'
];

/** @const {!Array<string>} */
Wasm2Lang.Backend.JsCommonCodegen.MATH_CONSTANT_BINDINGS_ = [
  'Math_E',
  'Math_LN10',
  'Math_LN2',
  'Math_LOG2E',
  'Math_LOG10E',
  'Math_PI',
  'Math_SQRT1_2',
  'Math_SQRT2'
];

// ---------------------------------------------------------------------------
// Hooks (default = modern-JS behavior; asm.js overrides each).
// ---------------------------------------------------------------------------

/**
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.getModuleFunctionBindingName_ = function () {
  return 'javascriptModule';
};

/**
 * @protected
 * @param {!Array<string>} parts
 * @param {string} pad1
 * @return {void}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.emitUseAsmDirective_ = function (parts, pad1) {};

/**
 * Modern JS includes a {@code BigInt64Array} view for aligned i64 traffic.
 *
 * @protected
 * @return {!Array<!Array<string>>}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.getHeapBindingTable_ = function () {
  return Wasm2Lang.Backend.JsCommonCodegen.JS_HEAP_BINDINGS_;
};

/** @const {!Array<!Array<string>>} */
Wasm2Lang.Backend.JsCommonCodegen.JS_HEAP_BINDINGS_ = [
  ['HEAP8', 'Int8Array'],
  ['HEAPU8', 'Uint8Array'],
  ['HEAP16', 'Int16Array'],
  ['HEAPU16', 'Uint16Array'],
  ['HEAP32', 'Int32Array'],
  ['HEAP64', 'BigInt64Array'],
  ['HEAPF32', 'Float32Array'],
  ['HEAPF64', 'Float64Array']
];

/**
 * @protected
 * @param {string} typedArrayName
 * @param {string} stdlibName
 * @param {string} bufferName
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderHeapInitializer_ = function (typedArrayName, stdlibName, bufferName) {
  return 'new ' + typedArrayName + '(' + bufferName + ')';
};

/**
 * @protected
 * @param {string} mathBindingName  e.g. {@code "Math_imul"}
 * @param {string} stdlibName
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderMathFunctionInitializer_ = function (mathBindingName, stdlibName) {
  return 'Math.' + mathBindingName.substring(5);
};

/**
 * @protected
 * @param {string} mathBindingName
 * @param {string} foreignName
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderMathConstantInitializer_ = function (mathBindingName, foreignName) {
  return 'Math.' + mathBindingName.substring(5);
};

/**
 * @protected
 * @param {string} foreignName
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderInfinityInitializer_ = function (foreignName) {
  return 'Infinity';
};

/**
 * @protected
 * @param {string} foreignName
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderNaNInitializer_ = function (foreignName) {
  return 'NaN';
};

/**
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_} globalInfo
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderModuleGlobalInitExpr_ = function (binaryen, globalInfo) {
  if (Wasm2Lang.Backend.ValueType.isI64(binaryen, globalInfo.globalType)) {
    return this.renderI64Const_(binaryen, globalInfo.globalInitValue);
  }
  return this.renderConst_(binaryen, /** @type {number} */ (globalInfo.globalInitValue), globalInfo.globalType);
};

/**
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} varName
 * @param {number} type
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderExportedGlobalGetterReturn_ = function (binaryen, varName, type) {
  return varName;
};
