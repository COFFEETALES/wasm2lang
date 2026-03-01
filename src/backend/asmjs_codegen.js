'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.AsmjsCodegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
};

Wasm2Lang.Backend.AsmjsCodegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.AsmjsCodegen.prototype.constructor = Wasm2Lang.Backend.AsmjsCodegen;

/**
 * Resolves the initial asm.js ArrayBuffer size.
 *
 * Supports overriding the default via --define ASMJS_HEAP_SIZE=<number>.
 *
 * @private
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {number}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.resolveHeapSize_ = function (options) {
  var /** @const {number} */ defaultHeapSize = 65536;
  var /** @const {!Object<string, string>} */ definitions = options.definitions;

  if (!Object.prototype.hasOwnProperty.call(definitions, 'ASMJS_HEAP_SIZE')) {
    return defaultHeapSize;
  }

  var /** @const {number} */ candidate = Number(definitions['ASMJS_HEAP_SIZE']);
  if (!isFinite(candidate) || 0 >= candidate) {
    return defaultHeapSize;
  }

  return Math.floor(candidate);
};

/**
 * Emits i32 static-memory initialization lines in asm.js syntax using the
 * shared {@code collectI32InitOps_} classification:
 *   'fill' → {@code i32_array.fill(value, start, end);}
 *   'set'  → {@code i32_array.set([v0, v1, ...], offset);}
 *
 * @private
 * @param {!Int32Array} i32
 * @param {number} startWordIndex
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitStaticI32InitLines_ = function (i32, startWordIndex) {
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.I32InitOp_>} */ ops = this.collectI32InitOps_(i32, startWordIndex);
  var /** @const {!Array<string>} */ lines = [];

  for (var /** number */ i = 0, /** @const {number} */ opsLen = ops.length; i !== opsLen; ++i) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.I32InitOp_} */ op = ops[i];
    var /** @const {string} */ opKind = op.opKind;
    var /** @const {number} */ wordIndex = op.startWordIndex;

    if ('fill' === opKind) {
      var /** @const {number} */ value = op.fillValueI32;
      var /** @const {number} */ count = op.fillCountWords;
      lines[lines.length] =
        'i32_array.fill(' + String(value) + ', ' + String(wordIndex) + ', ' + String(wordIndex + count) + ');';
    } else {
      var /** @const {!Array<number>} */ words = op.setWordsI32;
      var /** @const {!Array<string>} */ wordStrs = [];
      for (var /** number */ j = 0, /** @const {number} */ wLen = words.length; j !== wLen; ++j) {
        wordStrs[wordStrs.length] = String(words[j]);
      }
      lines[lines.length] = 'i32_array.set([' + wordStrs.join(', ') + '], ' + String(wordIndex) + ');';
    }
  }

  return lines;
};

/**
 * Emits the static memory block as a JavaScript string declaring an
 * ArrayBuffer and initializing it from the wasm module's data segments.
 *
 * Called when {@code options.emitMetadata} is a string.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitMetadata = function (wasmModule, options) {
  var /** @const {string} */ bufferName = /** @type {string} */ (options.emitMetadata);
  var /** @const {number} */ heapSize = this.resolveHeapSize_(options);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_} */ staticMemory = this.collectStaticMemory_(wasmModule);
  var /** @const {number} */ startWordIndex = staticMemory.startWordIndex;
  var /** @const {!Int32Array} */ i32 = staticMemory.words;
  var /** @const {!Array<string>} */ lines = [];

  lines[lines.length] = 'var ' + bufferName + ' = new ArrayBuffer(' + heapSize + ');';
  lines[lines.length] = 'var i32_array = new Int32Array(' + bufferName + ');';

  if (0 !== i32.length) {
    var /** @const {!Array<string>} */ initLines = this.emitStaticI32InitLines_(i32, startWordIndex);
    for (var /** number */ i = 0, /** @const {number} */ initLinesCount = initLines.length; i !== initLinesCount; ++i) {
      lines[lines.length] = initLines[i];
    }
  }

  return lines.join('\n');
};

/**
 * Mutable state threaded through the codegen traversal enter callback.
 *
 * @private
 * @typedef {{
 *   nodeCount: number,
 *   seenIds: !Object<string, boolean>,
 *   seenIdNames: !Array<string>,
 *   binaryen: !Binaryen
 * }}
 */
Wasm2Lang.Backend.AsmjsCodegen.TraversalState_;

/**
 * Visitor enter callback for the codegen traversal.  Counts nodes and
 * records each distinct expression-id encountered.
 *
 * Designed to be partially applied via {@code .bind(null, state)} so the
 * resulting function matches the {@code TraversalEnterCallback} signature.
 *
 * @private
 * @param {!Wasm2Lang.Backend.AsmjsCodegen.TraversalState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.traversalEnterAsmjs_ = function (state, nodeCtx) {
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression = /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ (
      nodeCtx.expression
    );
  var /** @const {number} */ id = expression.id;
  var /** @const {string} */ idKey = String(id);
  ++state.nodeCount;

  if (!state.seenIds[idKey]) {
    state.seenIds[idKey] = true;
    state.seenIdNames[state.seenIdNames.length] = this.idName_(state.binaryen, id);
  }

  return null;
};

/**
 * Emits the asm.js module shell plus a traversal summary comment block.
 * Signature matches {@link Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode}.
 *
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitCode = function (wasmModule, options) {
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {number} */ numFuncs = wasmModule.getNumFunctions();
  var /** @const {!Array<string>} */ outputParts = [];
  var /** @const {!Wasm2Lang.Backend.AsmjsCodegen.TraversalState_} */ traversalState = {
      nodeCount: 0,
      seenIds: /** @type {!Object<string, boolean>} */ (Object.create(null)),
      seenIdNames: [],
      binaryen: binaryen
    };

  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
    /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
      enter: this.traversalEnterAsmjs_.bind(this, traversalState)
    });

  // Minimal asm.js module shell — variable name comes from --emit-code value.
  outputParts[outputParts.length] = 'var ' + moduleName + ' = function asmjsModule(stdlib, foreign, buffer) {';
  outputParts[outputParts.length] = '  "use asm";';
  outputParts[outputParts.length] = '  function hello() {';
  outputParts[outputParts.length] = '    return 0;';
  outputParts[outputParts.length] = '  }';
  outputParts[outputParts.length] = '  return { hello: hello };';
  outputParts[outputParts.length] = '};';

  // Traversal summary — walk all non-imported function bodies.
  for (var /** number */ f = 0; f !== numFuncs; ++f) {
    var /** @const {number} */ funcPtr = wasmModule.getFunctionByIndex(f);
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(funcPtr);

    // Skip imported functions — they have a non-empty import base name.
    if ('' !== funcInfo.base) {
      continue;
    }

    traversalState.nodeCount = 0;
    var /** @const {number} */ bodyPtr = funcInfo.body;

    if (0 !== bodyPtr) {
      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalContext} */ ctx = {
          treeModule: wasmModule,
          functionInfo: funcInfo,
          treeMetadata: /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata} */ (Object.create(null)),
          ancestors: []
        };

      Wasm2Lang.Wasm.Tree.TraversalKernel.walkExpression(bodyPtr, ctx, visitor);
    }

    outputParts[outputParts.length] = '// ' + funcInfo.name + ' [nodes:' + traversalState.nodeCount + ']';
  }

  outputParts[outputParts.length] =
    '// [ids seen: ' + (0 !== traversalState.seenIdNames.length ? traversalState.seenIdNames.join(', ') : '(none)') + ']';

  return outputParts.join('\n');
};
