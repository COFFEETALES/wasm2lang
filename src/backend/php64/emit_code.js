'use strict';

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitCode = function (wasmModule, options) {
  this.initDiagnostics_();

  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} */ moduleInfo =
      this.collectModuleCodegenInfo_(wasmModule);
  var /** @const {!Array<string>} */ outputParts = [];

  // Collect internal function names (safe identifiers, unmangled keys).
  var /** @const {!Array<string>} */ internalFuncNames = [];
  for (var /** @type {number} */ fn = 0, /** @const {number} */ fnCount = moduleInfo.functions.length; fn !== fnCount; ++fn) {
    internalFuncNames[internalFuncNames.length] = this.safeName_(moduleInfo.functions[fn].name);
  }

  // Resolve stdlib imports.
  var /** @const */ stdlibBindings = Wasm2Lang.Backend.AbstractCodegen.resolveStdlibBindings_(
      moduleInfo.impFuncs,
      moduleInfo.impGlobals,
      '',
      {
        'E': 'M_E',
        'LN10': 'M_LN10',
        'LN2': 'M_LN2',
        'LOG2E': 'M_LOG2E',
        'LOG10E': 'M_LOG10E',
        'PI': 'M_PI',
        'SQRT1_2': 'M_SQRT1_2',
        'SQRT2': 'M_SQRT2'
      },
      'INF',
      'NAN'
    );
  var /** @const {!Object<string, string>} */ phpStdlibNames = stdlibBindings.w2lStdlibNames;
  var /** @const {!Object<string, string>} */ phpStdlibGlobals = stdlibBindings.w2lStdlibGlobals;

  // Emit function bodies first to discover which helpers and bindings are needed.
  this.castNames_ = moduleInfo.castNames;
  this.usedHelpers_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  this.usedBindings_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  var /** @const {!Array<string>} */ functionParts = [];
  for (var /** @type {number} */ f = 0, /** @const {number} */ funcCount = moduleInfo.functions.length; f !== funcCount; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = moduleInfo.functions[f];
    functionParts[functionParts.length] = this.emitFunction_(
      wasmModule,
      binaryen,
      funcInfo,
      moduleInfo.importedNames,
      moduleInfo.globals,
      moduleInfo.impFuncs,
      internalFuncNames,
      moduleInfo.functionSignatures,
      moduleInfo.globalTypes,
      moduleInfo.flatTableEntries.length > 0,
      phpStdlibNames,
      phpStdlibGlobals
    );
  }
  this.castNames_ = null;
  var /** @const {!Object<string, boolean>} */ usedB = /** @type {!Object<string, boolean>} */ (this.usedBindings_);
  this.usedBindings_ = null;

  // Force-mark exported globals as used so their bindings are emitted.
  for (
    var /** @type {number} */ pegm = 0, /** @const {number} */ pegmLen = moduleInfo.expGlobals.length;
    pegm !== pegmLen;
    ++pegm
  ) {
    usedB['$g_' + this.safeName_(moduleInfo.expGlobals[pegm].internalName)] = true;
  }

  // Helper emission — core unconditional + opcode-specific gated on usedHelpers_.
  var /** @const {!Array<string>} */ helperLines = this.emitHelpers_(0, 0, 0, 0);
  for (var /** @type {number} */ hi = 0, /** @const {number} */ hLen = helperLines.length; hi !== hLen; ++hi) {
    outputParts[outputParts.length] = helperLines[hi];
  }
  this.usedHelpers_ = null;

  // Module header.
  var /** @const {string} */ pad1 = Wasm2Lang.Backend.AbstractCodegen.pad_(1);
  var /** @const {string} */ nBuf = this.phpVar_('buffer');
  outputParts[outputParts.length] = '$' + moduleName + ' = function(array $foreign, string &' + nBuf + '): array {';

  // Imported function bindings — skip stdlib and unused imports.
  for (
    var /** @type {number} */ i = 0, /** @const {number} */ importCount = moduleInfo.impFuncs.length;
    i !== importCount;
    ++i
  ) {
    if (moduleInfo.impFuncs[i].wasmFuncName in phpStdlibNames) {
      continue;
    }
    var /** @const {string} */ phpImpKey = '$if_' + this.safeName_(moduleInfo.impFuncs[i].importBaseName);
    if (!usedB[phpImpKey]) {
      continue;
    }
    outputParts[outputParts.length] =
      pad1 + this.phpVar_(phpImpKey) + " = $foreign['" + moduleInfo.impFuncs[i].importBaseName + "'] ?? null;";
  }

  // Module-level globals (only those referenced by function bodies).
  for (var /** @type {number} */ gi = 0, /** @const {number} */ gLen = moduleInfo.globals.length; gi !== gLen; ++gi) {
    var /** @const {string} */ phpGlobalKey = '$g_' + this.safeName_(moduleInfo.globals[gi].globalName);
    if (!usedB[phpGlobalKey]) {
      continue;
    }
    outputParts[outputParts.length] = pad1 + this.phpVar_(phpGlobalKey) + ' = ' + moduleInfo.globals[gi].globalInitValue + ';';
  }

  // Forward declarations for internal functions.
  for (var /** @type {number} */ fi = 0, /** @const {number} */ fNameLen = internalFuncNames.length; fi !== fNameLen; ++fi) {
    outputParts[outputParts.length] = pad1 + this.phpVar_(internalFuncNames[fi]) + ' = null;';
  }

  // Function table forward declaration.
  if (moduleInfo.flatTableEntries.length > 0) {
    outputParts[outputParts.length] = pad1 + this.phpVar_('ftable') + ' = [];';
  }

  // Append function bodies.
  for (var /** @type {number} */ fp = 0, /** @const {number} */ fpLen = functionParts.length; fp !== fpLen; ++fp) {
    outputParts[outputParts.length] = functionParts[fp];
  }

  // Function table population.
  if (moduleInfo.flatTableEntries.length > 0) {
    var /** @const {!Array<string>} */ ftEntries = [];
    for (
      var /** @type {number} */ fte = 0, /** @const {number} */ fteLen = moduleInfo.flatTableEntries.length;
      fte !== fteLen;
      ++fte
    ) {
      var /** @const {string|null} */ fteName = moduleInfo.flatTableEntries[fte];
      if (null === fteName) {
        ftEntries[ftEntries.length] = 'null';
      } else {
        ftEntries[ftEntries.length] = this.phpVar_(this.safeName_(fteName));
      }
    }
    outputParts[outputParts.length] = pad1 + this.phpVar_('ftable') + ' = [' + ftEntries.join(', ') + '];';
  }

  // Exported global accessor closures.
  for (var /** @type {number} */ peg = 0, /** @const {number} */ pegLen = moduleInfo.expGlobals.length; peg !== pegLen; ++peg) {
    var /** @const {string} */ pegVar = this.phpVar_('$g_' + this.safeName_(moduleInfo.expGlobals[peg].internalName));
    var /** @const {string} */ pegGetterVar = this.phpVar_('$get_' + this.safeName_(moduleInfo.expGlobals[peg].exportName));
    outputParts[outputParts.length] = pad1 + pegGetterVar + ' = function() use (&' + pegVar + ') { return ' + pegVar + '; };';
    if (moduleInfo.expGlobals[peg].globalMutable) {
      var /** @const {string} */ pegSetterVar = this.phpVar_('$set_' + this.safeName_(moduleInfo.expGlobals[peg].exportName));
      var /** @const {string} */ pegSetterParam = this.localN_(0);
      outputParts[outputParts.length] =
        pad1 +
        pegSetterVar +
        ' = function(' +
        pegSetterParam +
        ') use (&' +
        pegVar +
        ') { ' +
        pegVar +
        ' = ' +
        pegSetterParam +
        '; };';
    }
  }

  // Return array.
  var /** @const {!Array<string>} */ returnEntries = [];
  for (
    var /** @type {number} */ r = 0, /** @const {number} */ exportCount = moduleInfo.expFuncs.length;
    r !== exportCount;
    ++r
  ) {
    returnEntries[returnEntries.length] =
      "'" + moduleInfo.expFuncs[r].exportName + "' => " + this.phpVar_(this.safeName_(moduleInfo.expFuncs[r].internalName));
  }
  for (var /** @type {number} */ pegr = 0; pegr !== pegLen; ++pegr) {
    returnEntries[returnEntries.length] =
      "'" +
      moduleInfo.expGlobals[pegr].exportName +
      "' => " +
      this.phpVar_('$get_' + this.safeName_(moduleInfo.expGlobals[pegr].exportName));
    if (moduleInfo.expGlobals[pegr].globalMutable) {
      returnEntries[returnEntries.length] =
        "'" +
        moduleInfo.expGlobals[pegr].exportName +
        '$set' +
        "' => " +
        this.phpVar_('$set_' + this.safeName_(moduleInfo.expGlobals[pegr].exportName));
    }
  }
  outputParts[outputParts.length] = pad1 + 'return [' + returnEntries.join(', ') + '];';
  outputParts[outputParts.length] = '};';

  return outputParts.join('\n');
};
