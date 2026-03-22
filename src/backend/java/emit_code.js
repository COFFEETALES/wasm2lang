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
      exportNameMap
    );
  }

  // Helper methods (only those referenced by function bodies).
  var /** @const {!Array<string>} */ helperLines = this.emitHelpers_();
  this.usedHelpers_ = null;
  for (var /** number */ hi = 0, /** @const {number} */ helperCount = helperLines.length; hi !== helperCount; ++hi) {
    outputParts[outputParts.length] = helperLines[hi];
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
