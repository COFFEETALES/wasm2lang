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
      moduleInfo.globalTypes,
      moduleInfo.functionTables
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
  var /** @const {!Array<!Array<string>>} */ heapBindings = [
      ['HEAP8', 'Int8Array'],
      ['HEAPU8', 'Uint8Array'],
      ['HEAP16', 'Int16Array'],
      ['HEAPU16', 'Uint16Array'],
      ['HEAP32', 'Int32Array'],
      ['HEAPF32', 'Float32Array'],
      ['HEAPF64', 'Float64Array']
    ];
  for (var /** number */ hbi = 0, /** @const {number} */ hbLen = heapBindings.length; hbi !== hbLen; ++hbi) {
    if (ub[heapBindings[hbi][0]]) {
      bindingLines[bindingLines.length] =
        pad1 +
        'var ' +
        this.n_(heapBindings[hbi][0]) +
        ' = new ' +
        stdlibName +
        '.' +
        heapBindings[hbi][1] +
        '(' +
        bufferName_ +
        ');';
    }
  }
  var /** @const {!Array<string>} */ mathBindings = [
      'Math_imul',
      'Math_clz32',
      'Math_fround',
      'Math_abs',
      'Math_ceil',
      'Math_floor',
      'Math_min',
      'Math_max',
      'Math_sqrt'
    ];
  for (var /** number */ mbi = 0, /** @const {number} */ mbLen = mathBindings.length; mbi !== mbLen; ++mbi) {
    if (ub[mathBindings[mbi]]) {
      bindingLines[bindingLines.length] =
        pad1 + 'var ' + this.n_(mathBindings[mbi]) + ' = ' + stdlibName + '.Math.' + mathBindings[mbi].substring(5) + ';';
    }
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

  // Function table stubs (must come before table var declarations in asm.js).
  var /** @const {!Array<string>} */ ftKeys = Object.keys(moduleInfo.functionTables);
  for (var /** number */ fti = 0, /** @const {number} */ ftLen = ftKeys.length; fti !== ftLen; ++fti) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ftDesc =
        moduleInfo.functionTables[ftKeys[fti]];
    if (ftDesc.stubNeeded) {
      var /** @const {string} */ ftSigKey = ftDesc.signatureKey;
      var /** @const {string} */ stubName = this.n_('$ftable_' + ftSigKey + '_stub');
      var /** @const {!Array<string>} */ stubParams = [];
      var /** @const {!Array<string>} */ stubAnnotations = [];
      for (var /** number */ sp = 0, /** @const {number} */ spLen = ftDesc.signatureParams.length; sp !== spLen; ++sp) {
        var /** @const {string} */ spName = this.localN_(sp);
        stubParams[stubParams.length] = spName;
        stubAnnotations[stubAnnotations.length] =
          pad1 + pad1 + spName + ' = ' + this.renderCoercionByType_(binaryen, spName, ftDesc.signatureParams[sp]) + ';';
      }
      var /** @type {string} */ stubReturn = '';
      if (ftDesc.signatureReturnType !== binaryen.none && 0 !== ftDesc.signatureReturnType) {
        stubReturn = pad1 + pad1 + 'return ' + this.renderCoercionByType_(binaryen, '0', ftDesc.signatureReturnType) + ';\n';
      }
      outputParts[outputParts.length] =
        pad1 +
        'function ' +
        stubName +
        '(' +
        stubParams.join(', ') +
        ') {\n' +
        stubAnnotations.join('\n') +
        (stubAnnotations.length ? '\n' : '') +
        stubReturn +
        pad1 +
        '}';
    }
  }

  // Function table var declarations (after all function definitions).
  for (var /** number */ ftv = 0; ftv !== ftLen; ++ftv) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ftDesc2 =
        moduleInfo.functionTables[ftKeys[ftv]];
    var /** @const {string} */ ftSigKey2 = ftDesc2.signatureKey;
    var /** @const {string} */ ftTableName = this.n_('$ftable_' + ftSigKey2);
    var /** @const {!Array<string>} */ tableEntryNames = [];
    for (var /** number */ te = 0, /** @const {number} */ teLen = ftDesc2.tableEntries.length; te !== teLen; ++te) {
      var /** @const {string|null} */ funcName = ftDesc2.tableEntries[te].functionName;
      if (null === funcName) {
        tableEntryNames[tableEntryNames.length] = this.n_('$ftable_' + ftSigKey2 + '_stub');
      } else {
        tableEntryNames[tableEntryNames.length] = this.n_(this.safeName_(funcName));
      }
    }
    outputParts[outputParts.length] = pad1 + 'var ' + ftTableName + ' = [' + tableEntryNames.join(', ') + '];';
  }

  // Return object.
  var /** @const {!Array<string>} */ returnEntries = [];
  for (var /** number */ r = 0, /** @const {number} */ exportCount = moduleInfo.expFuncs.length; r !== exportCount; ++r) {
    returnEntries[returnEntries.length] =
      moduleInfo.expFuncs[r].exportName + ': ' + this.n_(this.safeName_(moduleInfo.expFuncs[r].internalName));
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
