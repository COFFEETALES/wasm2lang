'use strict';

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<!Wasm2Lang.OutputSink.ChunkEntry>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitCode = function (wasmModule, options) {
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

  // Module header.
  var /** @const {string} */ asmjsModuleName = this.n_('asmjsModule');
  var /** @const {string} */ stdlibName = this.n_('stdlib');
  var /** @const {string} */ foreignName = this.n_('foreign');
  var /** @const {string} */ bufferName_ = this.n_('buffer');
  outputParts[outputParts.length] =
    'var ' + moduleName + ' = function ' + asmjsModuleName + '(' + stdlibName + ', ' + foreignName + ', ' + bufferName_ + ') {';
  outputParts[outputParts.length] = pad1 + '"use asm";';

  // Heap views and stdlib imports are emitted conditionally after function
  // body and helper emission — see usedBindings_ below.  Reserve an index
  // so the declarations appear in the correct position.
  var /** @const {number} */ bindingsInsertIndex = outputParts.length;

  // Imported function bindings.
  for (var /** number */ i = 0, /** @const {number} */ importCount = moduleInfo.impFuncs.length; i !== importCount; ++i) {
    outputParts[outputParts.length] =
      pad1 +
      'var ' +
      this.n_('$if_' + moduleInfo.impFuncs[i].importBaseName) +
      ' = ' +
      foreignName +
      '.' +
      moduleInfo.impFuncs[i].importBaseName +
      ';';
  }

  // Module-level globals.
  for (var /** number */ gi = 0, /** @const {number} */ gLen = moduleInfo.globals.length; gi !== gLen; ++gi) {
    outputParts[outputParts.length] =
      pad1 + 'var ' + this.n_('$g_' + moduleInfo.globals[gi].globalName) + ' = ' + moduleInfo.globals[gi].globalInitValue + ';';
  }

  // Function bodies (emitted first to discover which helpers and bindings are needed).
  this.usedHelpers_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  this.usedBindings_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  var /** @const {!Array<string>} */ functionParts = [];
  for (var /** number */ f = 0, /** @const {number} */ funcCount = moduleInfo.functions.length; f !== funcCount; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = moduleInfo.functions[f];
    functionParts[functionParts.length] = this.emitFunction_(
      wasmModule,
      binaryen,
      funcInfo,
      moduleInfo.importedNames,
      moduleInfo.functionSignatures,
      moduleInfo.globalTypes
    );
  }

  // Numeric helper bundle (only helpers referenced by function bodies).
  // emitHelpers_ also marks binding dependencies for each emitted helper.
  var /** @const {!Array<string>} */ helperLines = this.emitHelpers_(scratchByteOffset, scratchWordIndex, scratchQwordIndex);
  this.usedHelpers_ = null;

  // Insert conditional heap views and stdlib imports at the reserved position.
  var /** @const {!Object<string, boolean>} */ ub = /** @type {!Object<string, boolean>} */ (this.usedBindings_);
  this.usedBindings_ = null;
  var /** @const {!Array<string>} */ bindingLines = [];
  if (ub['HEAP8']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAP8') + ' = new ' + stdlibName + '.Int8Array(' + bufferName_ + ');';
  }
  if (ub['HEAPU8']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAPU8') + ' = new ' + stdlibName + '.Uint8Array(' + bufferName_ + ');';
  }
  if (ub['HEAP16']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAP16') + ' = new ' + stdlibName + '.Int16Array(' + bufferName_ + ');';
  }
  if (ub['HEAPU16']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAPU16') + ' = new ' + stdlibName + '.Uint16Array(' + bufferName_ + ');';
  }
  if (ub['HEAP32']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAP32') + ' = new ' + stdlibName + '.Int32Array(' + bufferName_ + ');';
  }
  if (ub['HEAPF32']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAPF32') + ' = new ' + stdlibName + '.Float32Array(' + bufferName_ + ');';
  }
  if (ub['HEAPF64']) {
    bindingLines[bindingLines.length] =
      pad1 + 'var ' + this.n_('HEAPF64') + ' = new ' + stdlibName + '.Float64Array(' + bufferName_ + ');';
  }
  if (ub['Math_imul']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_imul') + ' = ' + stdlibName + '.Math.imul;';
  }
  if (ub['Math_clz32']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_clz32') + ' = ' + stdlibName + '.Math.clz32;';
  }
  if (ub['Math_fround']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_fround') + ' = ' + stdlibName + '.Math.fround;';
  }
  if (ub['Math_abs']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_abs') + ' = ' + stdlibName + '.Math.abs;';
  }
  if (ub['Math_ceil']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_ceil') + ' = ' + stdlibName + '.Math.ceil;';
  }
  if (ub['Math_floor']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_floor') + ' = ' + stdlibName + '.Math.floor;';
  }
  if (ub['Math_min']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_min') + ' = ' + stdlibName + '.Math.min;';
  }
  if (ub['Math_max']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_max') + ' = ' + stdlibName + '.Math.max;';
  }
  if (ub['Math_sqrt']) {
    bindingLines[bindingLines.length] = pad1 + 'var ' + this.n_('Math_sqrt') + ' = ' + stdlibName + '.Math.sqrt;';
  }
  // Splice binding declarations into the reserved position.
  for (var /** number */ bi = bindingLines.length - 1; bi >= 0; --bi) {
    outputParts.splice(bindingsInsertIndex, 0, bindingLines[bi]);
  }

  for (var /** number */ hi = 0, /** @const {number} */ helperCount = helperLines.length; hi !== helperCount; ++hi) {
    outputParts[outputParts.length] = helperLines[hi];
  }

  // Append function bodies.
  for (var /** number */ fi = 0, /** @const {number} */ fpLen = functionParts.length; fi !== fpLen; ++fi) {
    outputParts[outputParts.length] = functionParts[fi];
  }

  // Return object.
  var /** @const {!Array<string>} */ returnEntries = [];
  for (var /** number */ r = 0, /** @const {number} */ exportCount = moduleInfo.expFuncs.length; r !== exportCount; ++r) {
    returnEntries[returnEntries.length] =
      moduleInfo.expFuncs[r].exportName +
      ': ' +
      this.n_(Wasm2Lang.Backend.AsmjsCodegen.asmjsSafeName_(moduleInfo.expFuncs[r].internalName));
  }
  outputParts[outputParts.length] = pad1 + 'return { ' + returnEntries.join(', ') + ' };';
  outputParts[outputParts.length] = '};';

  // Traversal summary — delegates to AbstractCodegen which walks all
  // non-imported function bodies and appends per-function node counts and a
  // combined seen-ids line.
  // prettier-ignore
  outputParts[outputParts.length] = /** @type {string} */ (Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode.call(this, wasmModule, options));

  return Wasm2Lang.OutputSink.interleaveNewlines(outputParts);
};
