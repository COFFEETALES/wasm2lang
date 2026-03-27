'use strict';

// ---------------------------------------------------------------------------
// Function emission.
// ---------------------------------------------------------------------------

/**
 * Builds the PHP {@code use} clause entries for a function closure,
 * including only variables that the function body actually references.
 *
 * @param {!Object<string, boolean>} usedCaptures
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>} globals
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} imports
 * @param {!Array<string>} internalFuncNames
 * @param {boolean} hasFunctionTable
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.buildUseClause_ = function (
  usedCaptures,
  globals,
  imports,
  internalFuncNames,
  hasFunctionTable
) {
  var /** @const {!Array<string>} */ entries = [];
  var /** @const {string} */ bufVar = this.phpVar_('buffer');
  if (usedCaptures[bufVar]) {
    entries[entries.length] = '&' + bufVar;
  }
  for (var /** number */ gi = 0, /** @const {number} */ gLen = globals.length; gi !== gLen; ++gi) {
    var /** @const {string} */ gVar = this.phpVar_('$g_' + this.safeName_(globals[gi].globalName));
    if (usedCaptures[gVar]) {
      entries[entries.length] = '&' + gVar;
    }
  }
  for (var /** number */ ii = 0, /** @const {number} */ iLen = imports.length; ii !== iLen; ++ii) {
    var /** @const {string} */ iVar = this.phpVar_('$if_' + this.safeName_(imports[ii].importBaseName));
    if (usedCaptures[iVar]) {
      entries[entries.length] = '&' + iVar;
    }
  }
  for (var /** number */ fi = 0, /** @const {number} */ fLen = internalFuncNames.length; fi !== fLen; ++fi) {
    var /** @const {string} */ fVar = this.phpVar_(internalFuncNames[fi]);
    if (usedCaptures[fVar]) {
      entries[entries.length] = '&' + fVar;
    }
  }
  if (hasFunctionTable) {
    var /** @const {string} */ ftVar = this.phpVar_('ftable');
    if (usedCaptures[ftVar]) {
      entries[entries.length] = '&' + ftVar;
    }
  }
  return entries.join(', ');
};

/**
 * Emits a single PHP function body as a closure assignment.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Object<string, string>} importedNames
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>} globals
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} imports
 * @param {!Array<string>} internalFuncNames
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} functionSignatures
 * @param {!Object<string, number>} globalTypes
 * @param {boolean} hasFunctionTable
 * @param {?Object<string, string>=} opt_stdlibNames
 * @param {?Object<string, string>=} opt_stdlibGlobals
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitFunction_ = function (
  wasmModule,
  binaryen,
  funcInfo,
  importedNames,
  globals,
  imports,
  internalFuncNames,
  functionSignatures,
  globalTypes,
  hasFunctionTable,
  opt_stdlibNames,
  opt_stdlibGlobals
) {
  var /** @const {!Array<string>} */ parts = [];
  var /** @const {string} */ fnName = this.phpVar_(this.safeName_(funcInfo.name));
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(funcInfo.params);
  var /** @const {number} */ numParams = paramTypes.length;
  var /** @const {!Array<number>} */ varTypes = /** @type {!Array<number>} */ (funcInfo.vars) || [];
  var /** @const {number} */ numVars = varTypes.length;

  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;

  // Parameter list.
  var /** @const {!Array<string>} */ paramNames = [];
  for (var /** number */ pi = 0; pi !== numParams; ++pi) {
    paramNames[paramNames.length] = this.localN_(pi);
  }
  // Reserve slot for the function header; the use clause is finalised after
  // the body walk so that &$ftable is only captured when actually needed.
  var /** @const {number} */ headerIndex = parts.length;
  parts[parts.length] = '';

  // Coerce parameters to their wasm types.
  for (var /** number */ pa = 0; pa !== numParams; ++pa) {
    var /** @const {string} */ pName = this.localN_(pa);
    parts[parts.length] = pad(2) + pName + ' = ' + this.renderCoercionByType_(binaryen, pName, paramTypes[pa]) + ';';
  }

  // Local variable declarations.
  if (0 !== numVars) {
    var /** @const {?Object<string, number>} */ initOverrides = this.getLocalInitOverrides_(funcInfo.name);
    var /** @const {!Array<string>} */ varDecls = [];
    for (var /** number */ vi = 0; vi !== numVars; ++vi) {
      var /** @const {number} */ localType = varTypes[vi];
      var /** @const {number} */ localIdx = numParams + vi;
      var /** @const {number|void} */ overrideValue = initOverrides ? initOverrides[String(localIdx)] : void 0;
      // prettier-ignore
      var /** @const {string} */ initStr = overrideValue !== void 0
        ? this.renderConst_(binaryen, /** @type {number} */ (overrideValue), localType)
        : this.renderLocalInit_(binaryen, localType);
      varDecls[varDecls.length] = this.localN_(localIdx) + ' = ' + initStr;
    }
    parts[parts.length] = pad(2) + varDecls.join('; ') + ';';
  }

  // Walk the body with the code-gen visitor.
  /** @type {!Object<string, boolean>} */
  var usedCaptures = /** @type {!Object<string, boolean>} */ (Object.create(null));
  if (0 !== funcInfo.body) {
    this.walkAndAppendBody_(
      parts,
      wasmModule,
      binaryen,
      funcInfo,
      /** @type {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} */ ({
        binaryen: binaryen,
        functionInfo: funcInfo,
        functionSignatures: functionSignatures,
        globalTypes: globalTypes,
        inlineTempOffset: numParams + numVars,
        labelStack: [],
        importedNames: importedNames,
        stdlibNames: opt_stdlibNames || null,
        stdlibGlobals: opt_stdlibGlobals || null,
        indent: 2,
        usedCaptures: usedCaptures,
        wasmModule: wasmModule,
        visitor: null,
        pendingBlockFusion: '',
        rootSwitchExitMap: null,
        rootSwitchRsName: '',
        rootSwitchLoopName: ''
      }),
      pad(2)
    );
  }

  // Finalise the function header now that we know which captures are needed.
  var /** @const {string} */ useClause = this.buildUseClause_(
      usedCaptures,
      globals,
      imports,
      internalFuncNames,
      hasFunctionTable
    );
  var /** @const {string} */ usePart = '' !== useClause ? ' use (' + useClause + ')' : '';
  parts[headerIndex] = pad(1) + fnName + ' = function(' + paramNames.join(', ') + ')' + usePart + ' {';

  parts[parts.length] = pad(1) + '};';
  return parts.join('\n');
};
