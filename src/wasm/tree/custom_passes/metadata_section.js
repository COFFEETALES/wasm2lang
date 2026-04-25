'use strict';

/**
 * Serializes and deserializes wasm2lang codegen pass metadata to/from a WASM
 * custom section named {@code w2l_codegen_meta}.  The metadata survives binary
 * round-trip so that the two-step workflow (normalize -> emit binary -> re-read
 * with --pre-normalized -> emit code) can recover pass analysis results without
 * relying on label-name prefixes.
 *
 * Nodes are identified by their DFS pre-order position among Block and Loop
 * nodes within each function body.  This position is deterministic because the
 * expression tree structure is preserved across WASM binary serialization.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection = {};

/**
 * Custom section name.
 * @const {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.SECTION_NAME = 'w2l_codegen_meta';

// ---------------------------------------------------------------------------
// Type code constants for compact JSON entries.
// ---------------------------------------------------------------------------

/** @private @const {string} */ Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.TYPE_LOOP_PLAN_ = 'lp';
/** @private @const {string} */ Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.TYPE_FUSED_BLOCK_ = 'fb';
/** @private @const {string} */ Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.TYPE_SWITCH_DISPATCH_ = 'sd';
/** @private @const {string} */ Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.TYPE_ROOT_SWITCH_ = 'rs';

// ---------------------------------------------------------------------------
// DFS pre-order node indexing
// ---------------------------------------------------------------------------

/**
 * Walks a function body in DFS pre-order and assigns sequential position
 * indices to every Block and Loop node that survives a WASM binary
 * round-trip.  Returns maps from label name to position and from position
 * to label name.
 *
 * <p><b>Why this is a hand-rolled walker, not
 * {@link Wasm2Lang.Wasm.Tree.TraversalKernel.forEachExpression}.</b>  This
 * routine intentionally <em>simulates</em> binaryen's reader-time
 * canonicalization rules — it must skip unnamed multi-child blocks that
 * binaryen flattens into their parent on read, inline single-child blocks,
 * and so on.  The shared kernel walks the IR <em>as it currently exists</em>;
 * here we need to walk a <em>projection</em> of the IR that matches what
 * binaryen's reader would produce.  Used only by the v2 (DFS-position)
 * deserialize fallback retained for binaries written before the v3 anchor
 * scheme — new code should use the shared kernel via
 * {@link buildLoopPositionToPtrList_} or {@link buildNameToPtrMap_}.
 *
 * <p>Binaryen's binary reader drops or flattens certain block shapes during
 * round-trip.  To keep position numbering stable across the two-step
 * workflow (normalize → emit binary → re-read with --pre-normalized), this
 * walker emulates those rules so that serialize-time positions match the
 * positions observed when the module is re-read from its binary form:
 *
 * <ul>
 *   <li>Unnamed block with 0 children → dropped (not indexed).</li>
 *   <li>Unnamed block with exactly 1 child → inlined (not indexed; its
 *       child takes its place).</li>
 *   <li>Unnamed multi-child block directly inside another block → flattened
 *       into the parent (not indexed; its children are walked inline in the
 *       parent's context).</li>
 *   <li>Unnamed multi-child block inside a single-expression slot (loop
 *       body, if branch, function body root) → preserved.</li>
 *   <li>Named block → always preserved (the name may be stripped during
 *       round-trip if nothing branches to it, but the block node remains).</li>
 *   <li>Loop → always preserved.</li>
 * </ul>
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} rootPtr
 * @return {{nameToPos: !Object<string, number>, posToName: !Object<number, string>, posToPtr: !Object<number, number>}}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.buildNodeIndex_ = function (binaryen, rootPtr) {
  var /** @const {!Object<string, number>} */ nameToPos = Object.create(null);
  var /** @const {!Object<number, string>} */ posToName = Object.create(null);
  var /** @const {!Object<number, number>} */ posToPtr = Object.create(null);
  var /** @type {number} */ counter = 0;
  var /** @const {function(!Binaryen, number): !Wasm2Lang.Wasm.Tree.ExpressionInfo} */ getInfo =
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo;

  /**
   * @param {number} ptr
   * @param {boolean} inBlockContext  True when ptr is a direct child of a
   *     surviving block.  Unnamed multi-child blocks in this context get
   *     flattened into their parent during binary round-trip.
   * @return {void}
   */
  function walk(ptr, inBlockContext) {
    if (0 === ptr) return;
    var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ info = getInfo(binaryen, ptr);
    var /** @const {number} */ id = info.id;

    if (binaryen.BlockId === id) {
      var /** @const {?string} */ bName = /** @type {?string} */ (info.name);
      var /** @const {!Array<number>|void} */ ch = /** @type {!Array<number>|void} */ (info.children);
      var /** @const {number} */ cLen = ch ? ch.length : 0;
      // Unnamed 0-child block: dropped during round-trip.
      if (!bName && 0 === cLen) return;
      // Unnamed 2-child block whose last child is Unreachable: binaryen
      // appends a synthetic trailing Unreachable to a function body root
      // whose effective type (unreachable) differs from the declared
      // return type.  At serialize time the body holds only the real
      // child; the synthetic sibling appears only after binary round-trip.
      // Treat the block as 1-child so positions match across both sides.
      if (!bName && 2 === cLen) {
        var /** @const {number} */ lastId2 = getInfo(binaryen, /** @type {!Array<number>} */ (ch)[1]).id;
        if (binaryen.UnreachableId === lastId2) {
          walk(/** @type {!Array<number>} */ (ch)[0], inBlockContext);
          return;
        }
      }
      // Unnamed 1-child block: inlined during round-trip.  Walk child in
      // the same parent context so flattening propagates correctly.
      if (!bName && 1 === cLen) {
        walk(/** @type {!Array<number>} */ (ch)[0], inBlockContext);
        return;
      }
      // Unnamed multi-child block inside another block: flattened into
      // parent during round-trip.  Walk children inline in block context.
      if (!bName && inBlockContext) {
        for (var /** @type {number} */ fi = 0; fi < cLen; ++fi) {
          walk(/** @type {!Array<number>} */ (ch)[fi], true);
        }
        return;
      }
      // Otherwise: block survives round-trip (named blocks always survive,
      // as do unnamed multi-child blocks in single-expression slots).
      var /** @const {number} */ pos = counter++;
      posToPtr[pos] = ptr;
      if (bName) {
        nameToPos[bName] = pos;
        posToName[pos] = bName;
      }
      if (ch) {
        for (var /** @type {number} */ ci = 0; ci < cLen; ++ci) {
          walk(/** @type {!Array<number>} */ (ch)[ci], true);
        }
      }
      return;
    }

    if (binaryen.LoopId === id) {
      var /** @const {string} */ lName = /** @type {string} */ (info.name);
      var /** @const {number} */ lPos = counter++;
      posToPtr[lPos] = ptr;
      nameToPos[lName] = lPos;
      posToName[lPos] = lName;
      walk(/** @type {number} */ (info.body || 0), false);
      return;
    }

    if (binaryen.IfId === id) {
      walk(/** @type {number} */ (info.condition || 0), false);
      walk(/** @type {number} */ (info.ifTrue || 0), false);
      walk(/** @type {number} */ (info.ifFalse || 0), false);
      return;
    }

    if (binaryen.DropId === id || binaryen.ReturnId === id || binaryen.LocalSetId === id || binaryen.GlobalSetId === id) {
      walk(/** @type {number} */ (info.value || 0), false);
      return;
    }

    if (binaryen.SelectId === id) {
      walk(/** @type {number} */ (info.ifTrue || 0), false);
      walk(/** @type {number} */ (info.ifFalse || 0), false);
      walk(/** @type {number} */ (info.condition || 0), false);
      return;
    }

    if (binaryen.BinaryId === id) {
      walk(/** @type {number} */ (info.left || 0), false);
      walk(/** @type {number} */ (info.right || 0), false);
      return;
    }

    if (binaryen.UnaryId === id) {
      walk(/** @type {number} */ (info.value || 0), false);
      return;
    }

    if (binaryen.BreakId === id) {
      walk(/** @type {number} */ (info.condition || 0), false);
      walk(/** @type {number} */ (info.value || 0), false);
      return;
    }

    if (binaryen.SwitchId === id) {
      walk(/** @type {number} */ (info.condition || 0), false);
      walk(/** @type {number} */ (info.value || 0), false);
      return;
    }

    if (binaryen.CallId === id || binaryen.CallIndirectId === id) {
      var /** @const {!Array<number>|void} */ operands = /** @type {!Array<number>|void} */ (info.operands);
      if (operands) {
        for (var /** @type {number} */ oi = 0, /** @const {number} */ oLen = operands.length; oi < oLen; ++oi) {
          walk(operands[oi], false);
        }
      }
      if (binaryen.CallIndirectId === id) {
        walk(/** @type {number} */ (info.target || 0), false);
      }
      return;
    }

    if (binaryen.LoadId === id || binaryen.StoreId === id) {
      walk(/** @type {number} */ (info.ptr || 0), false);
      if (binaryen.StoreId === id) {
        walk(/** @type {number} */ (info.value || 0), false);
      }
      return;
    }
  }

  walk(rootPtr, false);
  return {nameToPos: nameToPos, posToName: posToName, posToPtr: posToPtr};
};

// ---------------------------------------------------------------------------
// Serialization (PassRunResult -> custom section)
// ---------------------------------------------------------------------------

/**
 * Serializes a PassRunResult into a WASM custom section on the module.
 * Called after all wasm2lang:codegen normalization passes have completed.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Wasm.Tree.PassRunResult} passRunResult
 * @param {!Binaryen} binaryen
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.serializePassRunResult = function (wasmModule, passRunResult, binaryen) {
  var /** @const */ MS_PUB = Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection;
  var /** @const {!Object} */ payloadV3 = MS_PUB.serializeWithAnchorsV3_(wasmModule, passRunResult, binaryen);
  var /** @const {!Array<!Object>} */ v3Funcs = /** @type {!Array<!Object>} */ (payloadV3['f']);
  if (0 === v3Funcs.length) return;
  var /** @const {string} */ jsonStrV3 = JSON.stringify(payloadV3);
  var /** @const {!Uint8Array} */ bytesV3 = new Uint8Array(jsonStrV3.length);
  for (var /** @type {number} */ bvi = 0, /** @const {number} */ bvLen = jsonStrV3.length; bvi < bvLen; ++bvi) {
    bytesV3[bvi] = jsonStrV3.charCodeAt(bvi);
  }
  wasmModule.addCustomSection(MS_PUB.SECTION_NAME, bytesV3);
};

/**
 * V2 (DFS-position) serializer.  Retained for compatibility with binaries
 * produced before the v3 anchor-based scheme.  Currently unused at write
 * time (v3 is the default); v2 binaries are still readable by
 * {@code rebuildPassRunResult}.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Wasm.Tree.PassRunResult} passRunResult
 * @param {!Binaryen} binaryen
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.serializePassRunResultV2_ = function (wasmModule, passRunResult, binaryen) {
  var /** @const {!Array<!Wasm2Lang.Wasm.Tree.PassMetadata>} */ funcs = passRunResult.functions;
  var /** @const {number} */ fLen = funcs.length;
  var /** @const {!Array<!Object>} */ serializedFunctions = [];

  for (var /** @type {number} */ fi = 0; fi !== fLen; ++fi) {
    var /** @const {!Wasm2Lang.Wasm.Tree.PassMetadata} */ fm = funcs[fi];
    if (!fm.passFuncPtr) continue;

    var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(/** @type {number} */ (fm.passFuncPtr));
    var /** @const {number} */ bodyPtr = funcInfo.body;
    if (0 === bodyPtr) continue;

    var /** @const {{nameToPos: !Object<string, number>, posToName: !Object<number, string>, posToPtr: !Object<number, number>}} */ nodeIndex =
        Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.buildNodeIndex_(binaryen, bodyPtr);

    var /** @const {!Array<!Object>} */ entries = Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.convertMetadataToEntries_(
        fm,
        nodeIndex.nameToPos
      );

    if (0 === entries.length) continue;

    // localInitOverrides intentionally omitted — its keys are local indices,
    // and binaryen's binary writer regroups locals by type, renumbering the
    // local.set indices.  Re-derived from the canonicalised IR via
    // {@link LocalInitFoldingPass.reanalyzeOverrides} after round-trip.
    var /** @const {!Object} */ funcEntry = Object.create(null);
    funcEntry['n'] = funcInfo.name;
    funcEntry['m'] = entries;
    serializedFunctions[serializedFunctions.length] = funcEntry;
  }

  if (0 === serializedFunctions.length) return;

  var /** @const {!Object} */ payload = Object.create(null);
  payload['v'] = 2;
  payload['f'] = serializedFunctions;

  var /** @const {string} */ jsonStr = JSON.stringify(payload);
  var /** @const {!Uint8Array} */ bytes = new Uint8Array(jsonStr.length);
  for (var /** @type {number} */ bi = 0, /** @const {number} */ bLen = jsonStr.length; bi < bLen; ++bi) {
    bytes[bi] = jsonStr.charCodeAt(bi);
  }

  wasmModule.addCustomSection(Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.SECTION_NAME, bytes);
};

/**
 * Appends compact entries to {@code entries} for each key in {@code src}
 * that is present in {@code nameToPos}.  When {@code fillFn} is non-null it
 * populates the type-specific extras on each entry from the source value.
 *
 * @private
 * @param {!Array<!Object>} entries
 * @param {!Object<string, number>} nameToPos
 * @param {!Object} src
 * @param {string} typeCode
 * @param {?function(*, !Object):void} fillFn
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.appendMapEntries_ = function (entries, nameToPos, src, typeCode, fillFn) {
  var /** @const {!Array<string>} */ keys = Object.keys(src);
  for (var /** @type {number} */ i = 0, /** @const {number} */ n = keys.length; i < n; ++i) {
    var /** @const {string} */ key = keys[i];
    if (key in nameToPos) {
      var /** @const {!Object} */ e = Object.create(null);
      e['p'] = nameToPos[key];
      e['t'] = typeCode;
      if (fillFn) fillFn(src[key], e);
      entries[entries.length] = e;
    }
  }
};

/**
 * Converts pass metadata maps into compact entries keyed by DFS position.
 *
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm
 * @param {!Object<string, number>} nameToPos
 * @return {!Array<!Object>}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.convertMetadataToEntries_ = function (fm, nameToPos) {
  var /** @const {!Array<!Object>} */ entries = [];
  var /** @const */ MS = Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection;

  if (fm.loopPlans) {
    MS.appendMapEntries_(
      entries,
      nameToPos,
      /** @type {!Object} */ (fm.loopPlans),
      MS.TYPE_LOOP_PLAN_,
      /** @param {*} v @param {!Object} e */ function (v, e) {
        var /** @const {!Wasm2Lang.Wasm.Tree.LoopPlan} */ plan = /** @type {!Wasm2Lang.Wasm.Tree.LoopPlan} */ (v);
        e['k'] = plan.simplifiedLoopKind;
        e['l'] = plan.needsLabel ? 1 : 0;
      }
    );
  }
  if (fm.fusedBlocks) {
    MS.appendMapEntries_(
      entries,
      nameToPos,
      /** @type {!Object} */ (fm.fusedBlocks),
      MS.TYPE_FUSED_BLOCK_,
      /** @param {*} v @param {!Object} e */ function (v, e) {
        e['v'] = /** @type {!Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ (v).fusionVariant;
      }
    );
  }
  if (fm.switchDispatchNames) {
    MS.appendMapEntries_(entries, nameToPos, /** @type {!Object} */ (fm.switchDispatchNames), MS.TYPE_SWITCH_DISPATCH_, null);
  }
  if (fm.rootSwitchNames) {
    MS.appendMapEntries_(entries, nameToPos, /** @type {!Object} */ (fm.rootSwitchNames), MS.TYPE_ROOT_SWITCH_, null);
  }

  return entries;
};

// ---------------------------------------------------------------------------
// WASM binary parser (custom section extraction)
// ---------------------------------------------------------------------------

/**
 * Reads one unsigned LEB128 value from a Uint8Array at the given offset.
 * Returns the decoded value and the new offset.  Struct field names use
 * {@code w2l}-prefixed identifiers to avoid collision with Binaryen externs
 * like {@code .value} and {@code .offset}, which would otherwise prevent
 * Closure from mangling these keys.
 *
 * @private
 * @param {!Uint8Array} data
 * @param {number} offset
 * @return {{w2lLebValue: number, w2lLebOffset: number}}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.readLEB128_ = function (data, offset) {
  var /** @type {number} */ result = 0;
  var /** @type {number} */ shift = 0;
  var /** @type {number} */ byte;
  do {
    byte = data[offset++];
    result |= (byte & 0x7f) << shift;
    shift += 7;
  } while (0 !== (byte & 0x80));
  return {w2lLebValue: result, w2lLebOffset: offset};
};

/**
 * Parses a raw WASM binary to extract the {@code w2l_codegen_meta} custom
 * section payload.  Returns the parsed JSON object, or null if the section
 * is not found.
 *
 * @param {!Uint8Array} binaryData
 * @return {?Object}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.deserializeFromBinary = function (binaryData) {
  var /** @const */ MS = Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection;
  var /** @const {string} */ targetName = MS.SECTION_NAME;
  var /** @const {number} */ dataLen = binaryData.length;

  // Skip WASM magic (4 bytes) + version (4 bytes).
  if (dataLen < 8) return null;
  var /** @type {number} */ offset = 8;

  while (offset < dataLen) {
    var /** @const {number} */ sectionId = binaryData[offset++];
    var /** @const {{w2lLebValue: number, w2lLebOffset: number}} */ sizeResult = MS.readLEB128_(binaryData, offset);
    var /** @const {number} */ sectionSize = sizeResult.w2lLebValue;
    var /** @const {number} */ sectionEnd = sizeResult.w2lLebOffset + sectionSize;
    offset = sizeResult.w2lLebOffset;

    if (0 === sectionId) {
      // Custom section: read name.
      var /** @const {{w2lLebValue: number, w2lLebOffset: number}} */ nameLen = MS.readLEB128_(binaryData, offset);
      offset = nameLen.w2lLebOffset;
      var /** @type {string} */ sectionName = '';
      for (var /** @type {number} */ ni = 0; ni < nameLen.w2lLebValue; ++ni) {
        sectionName += String.fromCharCode(binaryData[offset++]);
      }

      if (sectionName === targetName) {
        // Remaining bytes in section are the payload.
        var /** @const {number} */ payloadLen = sectionEnd - offset;
        var /** @type {string} */ jsonStr = '';
        for (var /** @type {number} */ pi = 0; pi < payloadLen; ++pi) {
          jsonStr += String.fromCharCode(binaryData[offset++]);
        }
        try {
          return /** @type {!Object} */ (JSON.parse(jsonStr));
        } catch (e) {
          return null;
        }
      }
    }

    offset = sectionEnd;
  }

  return null;
};

// ---------------------------------------------------------------------------
// Deserialization (custom section -> PassRunResult)
// ---------------------------------------------------------------------------

/**
 * Rebuilds a PassRunResult from a parsed custom section payload and the
 * loaded WASM module.  Walks each function's body in the same DFS pre-order
 * used during serialization to map position indices back to current label
 * names.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Object} parsedMeta  Parsed JSON from the custom section.
 * @param {!Binaryen} binaryen
 * @return {!Wasm2Lang.Wasm.Tree.PassRunResult}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.rebuildPassRunResult = function (wasmModule, parsedMeta, binaryen) {
  var /** @const */ MS = Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection;
  var /** @type {*} */ rawVersion = parsedMeta['v'];
  var /** @const {number} */ versionField = 'number' === typeof rawVersion ? /** @type {number} */ (rawVersion) : 2;
  if (3 === versionField) {
    return MS.rebuildWithAnchorsV3_(wasmModule, parsedMeta, binaryen);
  }
  // Fall through to v2 path below.
  var /** @const {number} */ funcCount = wasmModule.getNumFunctions();

  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.PassRunResult} */ runResult =
    /** @type {!Wasm2Lang.Wasm.Tree.PassRunResult} */ ({
      functionCount: funcCount,
      processedCount: 0,
      functions: []
    });
  // prettier-ignore
  var /** @const {!Array<!Wasm2Lang.Wasm.Tree.PassMetadata>} */ funcsArray =
    /** @type {!Array<!Wasm2Lang.Wasm.Tree.PassMetadata>} */ (runResult.functions);

  // Build a lookup from function name to serialized function entry.
  // Function names are stable across binary round-trip, unlike indices
  // which shift when binaryen reorders imports added by lowering passes.
  var /** @type {*} */ rawFuncs = parsedMeta['f'];
  var /** @const {!Array<!Object>} */ serializedFuncs = /** @type {!Array<!Object>} */ (rawFuncs || []);
  var /** @const {!Object<string, !Object>} */ funcEntryByName = Object.create(null);
  for (var /** @type {number} */ si = 0, /** @const {number} */ sLen = serializedFuncs.length; si < sLen; ++si) {
    var /** @const {string} */ sName = /** @type {string} */ (serializedFuncs[si]['n']);
    funcEntryByName[sName] = serializedFuncs[si];
  }

  for (var /** @type {number} */ f = 0; f !== funcCount; ++f) {
    var /** @const {number} */ funcPtr = wasmModule.getFunctionByIndex(f);
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(funcPtr);

    // Skip imports.
    if ('' !== funcInfo.base) continue;

    var /** @const {number} */ bodyPtr = funcInfo.body;
    if (0 === bodyPtr) continue;

    // prettier-ignore
    var /** @const {!Wasm2Lang.Wasm.Tree.PassMetadata} */ fm = /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata} */ (
      Object.create(null)
    );
    fm.passFuncName = funcInfo.name;
    fm.passFuncPtr = funcPtr;
    fm.passTreeModule = wasmModule;
    fm.bodyReplaced = false;

    var /** @const {?Object} */ funcEntry = funcEntryByName[funcInfo.name] || null;
    if (funcEntry) {
      var /** @const {{nameToPos: !Object<string, number>, posToName: !Object<number, string>, posToPtr: !Object<number, number>}} */ nodeIndex =
          MS.buildNodeIndex_(binaryen, bodyPtr);

      // Restore names on unnamed blocks that have metadata entries.
      // WASM binary round-trip strips names from blocks that are not branch
      // targets (e.g. w2l_switch$ wrapper blocks).  Assign synthetic names
      // so the metadata can be stored and looked up by name.
      var /** @type {*} */ rawEntries = funcEntry['m'];
      var /** @const {!Array<!Object>} */ metaEntries = /** @type {!Array<!Object>} */ (rawEntries || []);
      MS.restoreUnnamedPositions_(metaEntries, nodeIndex, binaryen);

      MS.applyMetadataEntries_(fm, metaEntries, nodeIndex.posToName, binaryen, wasmModule, bodyPtr, funcInfo.name);
    }

    funcsArray[funcsArray.length] = fm;
    ++runResult.processedCount;
  }

  return runResult;
};

/**
 * Applies deserialized metadata entries to a PassMetadata object, mapping
 * position indices back to current label names.
 *
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm
 * @param {!Array<!Object>} entries
 * @param {!Object<number, string>} posToName
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wasmModule
 * @param {number} bodyPtr
 * @param {string} funcName
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.applyMetadataEntries_ = function (
  fm,
  entries,
  posToName,
  binaryen,
  wasmModule,
  bodyPtr,
  funcName
) {
  var /** @const */ MS = Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection;
  void funcName;

  for (var /** @type {number} */ ei = 0, /** @const {number} */ eLen = entries.length; ei < eLen; ++ei) {
    var /** @const {!Object} */ entry = entries[ei];
    var /** @const {number} */ pos = /** @type {number} */ (entry['p']);
    var /** @const {string} */ type = /** @type {string} */ (entry['t']);
    var /** @const {string|void} */ name = posToName[pos];
    if (!name) continue;

    if (MS.TYPE_LOOP_PLAN_ === type) {
      if (!fm.loopPlans) {
        fm.loopPlans = /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.LoopPlan>} */ (Object.create(null));
      }
      var /** @const {string} */ loopKind = /** @type {string} */ (entry['k']);
      var /** @const {boolean} */ needsLabel = 1 === /** @type {number} */ (entry['l']);
      var /** @const {number} */ condPtr = MS.extractLoopConditionPtr_(binaryen, wasmModule, bodyPtr, name, loopKind);
      /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.LoopPlan>} */ (fm.loopPlans)[name] =
        /** @type {!Wasm2Lang.Wasm.Tree.LoopPlan} */ ({
          simplifiedLoopKind: loopKind,
          needsLabel: needsLabel,
          conditionPtr: condPtr
        });
    } else if (MS.TYPE_FUSED_BLOCK_ === type) {
      if (!fm.fusedBlocks) {
        fm.fusedBlocks = /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.BlockFusionPlan>} */ (Object.create(null));
      }
      /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.BlockFusionPlan>} */ (fm.fusedBlocks)[name] =
        /** @type {!Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ ({
          fusionVariant: /** @type {string} */ (entry['v'])
        });
    } else if (MS.TYPE_SWITCH_DISPATCH_ === type) {
      if (!fm.switchDispatchNames) {
        fm.switchDispatchNames = /** @type {!Object<string, boolean>} */ (Object.create(null));
      }
      /** @type {!Object<string, boolean>} */ (fm.switchDispatchNames)[name] = true;
    } else if (MS.TYPE_ROOT_SWITCH_ === type) {
      if (!fm.rootSwitchNames) {
        fm.rootSwitchNames = /** @type {!Object<string, boolean>} */ (Object.create(null));
      }
      /** @type {!Object<string, boolean>} */ (fm.rootSwitchNames)[name] = true;
    }
  }
};

// ---------------------------------------------------------------------------
// Unnamed-block restoration
// ---------------------------------------------------------------------------

/**
 * Assigns synthetic names to unnamed Block nodes at positions referenced by
 * metadata entries.  WASM binary round-trip strips label names from blocks
 * that are not branch targets (e.g. {@code w2l_switch$} wrapper blocks added
 * by normalization passes).  Without a name, the metadata entry would be
 * silently skipped in {@code applyMetadataEntries_}.
 *
 * @private
 * @param {!Array<!Object>} entries  Metadata entries with position ('p') fields.
 * @param {{posToName: !Object<number, string>, posToPtr: !Object<number, number>}} nodeIndex
 * @param {!Binaryen} binaryen
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.restoreUnnamedPositions_ = function (entries, nodeIndex, binaryen) {
  var /** @const {function(!Binaryen, number): !Wasm2Lang.Wasm.Tree.ExpressionInfo} */ getInfo =
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo;
  var /** @const */ MS = Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection;

  for (var /** @type {number} */ i = 0, /** @const {number} */ len = entries.length; i < len; ++i) {
    var /** @const {number} */ pos = /** @type {number} */ (entries[i]['p']);
    if (nodeIndex.posToName[pos]) continue;
    var /** @const {number|void} */ ptr = nodeIndex.posToPtr[pos];
    if (!ptr) continue;
    // Only restore names on Block nodes (loops always keep their names).
    var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ info = getInfo(binaryen, ptr);
    if (binaryen.BlockId !== info.id) continue;

    var /** @type {string} */ syntheticName;
    var /** @const {string} */ entryType = /** @type {string} */ (entries[i]['t']);

    if (MS.TYPE_SWITCH_DISPATCH_ === entryType) {
      // Switch dispatch wrapper blocks need the w2l_switch$ prefix so
      // extractStructure detects the epilogue wrapping pattern.  The
      // convention is w2l_switch$<innerBlockName>.
      var /** @const {!Array<number>|void} */ ch = /** @type {!Array<number>|void} */ (info.children);
      var /** @type {string} */ innerName = 'w2l_p' + pos;
      if (ch && ch.length > 0) {
        var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ fcInfo = getInfo(binaryen, ch[0]);
        if (binaryen.BlockId === fcInfo.id && fcInfo.name) {
          innerName = /** @type {string} */ (fcInfo.name);
        }
      }
      syntheticName = 'w2l_switch$' + innerName;
    } else {
      syntheticName = 'w2l_p' + pos;
    }

    binaryen.Block.setName(ptr, syntheticName);
    nodeIndex.posToName[pos] = syntheticName;
  }
};

// ---------------------------------------------------------------------------
// Loop conditionPtr reconstruction
// ---------------------------------------------------------------------------

/**
 * Finds the Loop expression with the given name within a function body.
 * Driven by the shared traversal kernel; early-terminates via skip-subtree
 * once the match is captured.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {number} rootPtr
 * @param {string} loopName
 * @return {number}  Expression pointer to the Loop, or 0 if not found.
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.findLoopByName_ = function (wasmModule, binaryen, rootPtr, loopName) {
  if (0 === rootPtr) return 0;
  var /** @type {number} */ found = 0;
  Wasm2Lang.Wasm.Tree.TraversalKernel.forEachExpression(
    binaryen,
    wasmModule,
    rootPtr,
    /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
        @return {(string|undefined)} */ function (nodeCtx) {
      if (found) return 'skip-subtree';
      var /** @const {!BinaryenExpressionInfo} */ info = /** @type {!BinaryenExpressionInfo} */ (nodeCtx.expression);
      if (binaryen.LoopId === info.id && /** @type {?string} */ (info.name) === loopName) {
        found = /** @type {number} */ (nodeCtx.expressionPointer);
        return 'skip-subtree';
      }
      return undefined;
    }
  );
  return found;
};

/**
 * Extracts the condition expression pointer for a simplified loop from the
 * current IR, matching the logic in LoopSimplificationPass.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wasmModule
 * @param {number} bodyPtr  Function body pointer.
 * @param {string} loopName  Current label name of the loop.
 * @param {string} loopKind  'for', 'dowhile', or 'while'.
 * @return {number}  Condition expression pointer, or 0.
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.extractLoopConditionPtr_ = function (
  binaryen,
  wasmModule,
  bodyPtr,
  loopName,
  loopKind
) {
  if ('for' === loopKind) return 0;

  var /** @const */ MS = Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection;
  var /** @const {function(!Binaryen, number): !Wasm2Lang.Wasm.Tree.ExpressionInfo} */ getInfo =
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo;

  var /** @const {number} */ loopPtr = MS.findLoopByName_(wasmModule, binaryen, bodyPtr, loopName);
  if (0 === loopPtr) return 0;

  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ loopInfo = getInfo(binaryen, loopPtr);
  var /** @const {number} */ loopBodyPtr = /** @type {number} */ (loopInfo.body || 0);
  if (0 === loopBodyPtr) return 0;

  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ loopBodyInfo = getInfo(binaryen, loopBodyPtr);

  if ('while' === loopKind) {
    // Pattern LW/LY: loop body is a Block, first child is br_if to exit.
    // Condition is inverted (the br_if exits on the negated condition).
    if (binaryen.BlockId === loopBodyInfo.id) {
      var /** @const {!Array<number>|void} */ wCh = /** @type {!Array<number>|void} */ (loopBodyInfo.children);
      if (wCh && wCh.length > 0) {
        var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ firstChild = getInfo(binaryen, wCh[0]);
        if (binaryen.BreakId === firstChild.id && firstChild.condition) {
          return Wasm2Lang.Wasm.Tree.CustomPasses.invertCondition(
            binaryen,
            wasmModule,
            /** @type {number} */ (firstChild.condition)
          );
        }
      }
    }
    // Pattern LWI/LYI: loop body is an If node.
    if (binaryen.IfId === loopBodyInfo.id) {
      return /** @type {number} */ (loopBodyInfo.condition || 0);
    }
    return 0;
  }

  if ('dowhile' === loopKind) {
    // Pattern LDB/LEB: last child of loop body block is br_if targeting the loop.
    // Pattern LDA/LEA: second-to-last child is br_if targeting the loop.
    if (binaryen.BlockId === loopBodyInfo.id) {
      var /** @const {!Array<number>|void} */ dCh = /** @type {!Array<number>|void} */ (loopBodyInfo.children);
      if (dCh && dCh.length > 0) {
        // Try last child first (variant B).
        var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ lastChild = getInfo(binaryen, dCh[dCh.length - 1]);
        if (binaryen.BreakId === lastChild.id && lastChild.condition && /** @type {?string} */ (lastChild.name) === loopName) {
          return /** @type {number} */ (lastChild.condition);
        }
        // Try second-to-last child (variant A).
        if (dCh.length > 1) {
          var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ penultChild = getInfo(binaryen, dCh[dCh.length - 2]);
          if (
            binaryen.BreakId === penultChild.id &&
            penultChild.condition &&
            /** @type {?string} */ (penultChild.name) === loopName
          ) {
            return /** @type {number} */ (penultChild.condition);
          }
        }
      }
    }
    // Fallback: loop body is itself a br_if (rare single-expression body).
    if (binaryen.BreakId === loopBodyInfo.id && loopBodyInfo.condition) {
      return /** @type {number} */ (loopBodyInfo.condition);
    }
    return 0;
  }

  return 0;
};

// ---------------------------------------------------------------------------
// V3 anchor-based serialize / deserialize
//
// Format v3 keys block-typed metadata (sd / rs / fb) by anchor IDs that are
// inserted into the IR as {@code call $w2l_anchor (i32.const id)} markers.
// Anchors survive every binaryen pass and binary round-trip because imported
// calls are opaque side-effects to the optimizer, which gives this scheme
// drift-free node identity without depending on DFS-position invariants.
// Loop-typed metadata (lp) keeps its name-based key — loop names are
// preserved by the binary writer so an anchor would be redundant.
// ---------------------------------------------------------------------------

/**
 * Walks a function body via the shared traversal kernel and records every
 * named Block / Loop with its expression pointer.  Used at serialize-time
 * (when w2l_-prefixed names are still on the in-memory IR) to find each
 * marked node by name.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {number} rootPtr
 * @return {!Object<string, number>}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.buildNameToPtrMap_ = function (wasmModule, binaryen, rootPtr) {
  var /** @const {!Object<string, number>} */ nameToPtr = /** @type {!Object<string, number>} */ (Object.create(null));
  Wasm2Lang.Wasm.Tree.TraversalKernel.forEachExpression(
    binaryen,
    wasmModule,
    rootPtr,
    /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
        @return {(string|undefined)} */ function (nodeCtx) {
      var /** @const {!BinaryenExpressionInfo} */ info = /** @type {!BinaryenExpressionInfo} */ (nodeCtx.expression);
      var /** @const {number} */ id = info.id;
      if (binaryen.BlockId === id || binaryen.LoopId === id) {
        var /** @const {?string} */ name = /** @type {?string} */ (info.name);
        if (name) nameToPtr[name] = /** @type {number} */ (nodeCtx.expressionPointer);
      }
      return undefined;
    }
  );
  return nameToPtr;
};

/**
 * V3 serializer.  For each function in the PassRunResult:
 *   - For every block-typed marker (sd / rs / fb), find the marked block by
 *     name, insert an anchor with a fresh global id at its first-child
 *     position, and emit an entry {@code {id, t, n, ...}} into the section.
 *   - For every loop plan, emit an entry {@code {t: 'lp', n, k, l}} keyed by
 *     loop name (no anchor — loop names survive round-trip).
 * Returns the JSON-ready payload (which the caller serializes into the
 * {@code w2l_codegen_meta} custom section).
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Wasm.Tree.PassRunResult} passRunResult
 * @param {!Binaryen} binaryen
 * @return {!Object}  Payload ready for JSON.stringify.
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.serializeWithAnchorsV3_ = function (wasmModule, passRunResult, binaryen) {
  var /** @const */ MS = Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection;
  var /** @const */ AM = Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers;
  var /** @const {!Array<!Wasm2Lang.Wasm.Tree.PassMetadata>} */ funcs = passRunResult.functions;
  var /** @const {number} */ fLen = funcs.length;
  var /** @const {!Array<!Object>} */ outFuncs = [];
  var /** @type {number} */ nextAnchorId = 1;

  for (var /** @type {number} */ fi = 0; fi !== fLen; ++fi) {
    var /** @const {!Wasm2Lang.Wasm.Tree.PassMetadata} */ fm = funcs[fi];
    if (!fm.passFuncPtr) continue;
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(/** @type {number} */ (fm.passFuncPtr));
    var /** @const {number} */ bodyPtr = funcInfo.body;
    if (0 === bodyPtr) continue;

    var /** @const {!Object<string, number>} */ nameToPtr = MS.buildNameToPtrMap_(wasmModule, binaryen, bodyPtr);
    var /** @const {!Array<!Object>} */ entries = [];

    // Block-typed entries get anchor IDs.
    var /** @const */ insertBlockAnchor =
        /** @param {string} name @param {string} type @param {?function(!Object):void} fillFn @return {void} */ function (
          name,
          type,
          fillFn
        ) {
          var /** @const {number|void} */ ptr = nameToPtr[name];
          if (!ptr) return;
          var /** @const {!BinaryenExpressionInfo} */ info = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
              binaryen,
              ptr
            );
          if (binaryen.BlockId !== info.id) return;
          var /** @const {number} */ aid = nextAnchorId++;
          AM.insertAtBlockStart(wasmModule, binaryen, /** @type {number} */ (ptr), aid);
          var /** @const {!Object} */ e = Object.create(null);
          e['id'] = aid;
          e['t'] = type;
          e['n'] = name;
          if (fillFn) fillFn(e);
          entries[entries.length] = e;
        };

    if (fm.switchDispatchNames) {
      var /** @const {!Array<string>} */ sdKeys = Object.keys(/** @type {!Object} */ (fm.switchDispatchNames));
      for (var /** @type {number} */ sdi = 0; sdi !== sdKeys.length; ++sdi) {
        insertBlockAnchor(sdKeys[sdi], MS.TYPE_SWITCH_DISPATCH_, null);
      }
    }
    if (fm.rootSwitchNames) {
      var /** @const {!Array<string>} */ rsKeys = Object.keys(/** @type {!Object} */ (fm.rootSwitchNames));
      for (var /** @type {number} */ rsi = 0; rsi !== rsKeys.length; ++rsi) {
        insertBlockAnchor(rsKeys[rsi], MS.TYPE_ROOT_SWITCH_, null);
      }
    }
    if (fm.fusedBlocks) {
      var /** @const {!Object} */ fb = /** @type {!Object} */ (fm.fusedBlocks);
      var /** @const {!Array<string>} */ fbKeys = Object.keys(fb);
      for (var /** @type {number} */ fbi = 0; fbi !== fbKeys.length; ++fbi) {
        var /** @const {string} */ fbName = fbKeys[fbi];
        insertBlockAnchor(
          fbName,
          MS.TYPE_FUSED_BLOCK_,
          /** @param {!Object} e */ function (e) {
            e['v'] = /** @type {!Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ (fb[fbName]).fusionVariant;
          }
        );
      }
    }

    // Loop-typed entries keyed by DFS loop-position.  Loop NAMES are nulled
    // by binaryen 125's binary round-trip whenever the loop has no back-edge
    // (e.g. a "for(;;)" with only forward exits) — but the LoopId node itself
    // always survives.  Walk the function body, count loops in pre-order,
    // record each marked loop's position.  Deserialize finds the Nth loop
    // and restores its name.  This is a strict subset of v2's DFS scheme:
    // only loops, no blocks, and binaryen's serialization treats loops as a
    // structural primitive (no flatten / inline / drop rules apply to them),
    // making the position invariant under round-trip.
    if (fm.loopPlans) {
      var /** @const {!Object<string, number>} */ loopPositions = MS.buildLoopPositionMap_(wasmModule, binaryen, bodyPtr);
      var /** @const {!Object} */ lp2 = /** @type {!Object} */ (fm.loopPlans);
      var /** @const {!Array<string>} */ lpKeys2 = Object.keys(lp2);
      for (var /** @type {number} */ lpi2 = 0; lpi2 !== lpKeys2.length; ++lpi2) {
        var /** @const {string} */ lpName2 = lpKeys2[lpi2];
        if (!(lpName2 in loopPositions)) continue;
        var /** @const {!Wasm2Lang.Wasm.Tree.LoopPlan} */ plan2 = /** @type {!Wasm2Lang.Wasm.Tree.LoopPlan} */ (lp2[lpName2]);
        var /** @const {!Object} */ pe2 = Object.create(null);
        pe2['t'] = MS.TYPE_LOOP_PLAN_;
        pe2['n'] = lpName2;
        pe2['p'] = loopPositions[lpName2];
        pe2['k'] = plan2.simplifiedLoopKind;
        pe2['l'] = plan2.needsLabel ? 1 : 0;
        entries[entries.length] = pe2;
      }
    }

    if (0 === entries.length) continue;
    var /** @const {!Object} */ funcEntry = Object.create(null);
    funcEntry['n'] = funcInfo.name;
    funcEntry['m'] = entries;
    outFuncs[outFuncs.length] = funcEntry;
  }

  var /** @const {!Object} */ payload = Object.create(null);
  payload['v'] = 3;
  payload['f'] = outFuncs;
  return payload;
};

/**
 * V3 deserializer.  Walks the loaded module's IR for anchor calls, looks up
 * each anchor's entry in {@code parsedMeta}, restores the marked block's
 * synthetic name (binary writer strips names that aren't branch targets),
 * and populates {@code PassMetadata} for the codegen.  Loop-typed entries
 * are applied by name lookup (loop names survive round-trip).
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Object} parsedMeta
 * @param {!Binaryen} binaryen
 * @return {!Wasm2Lang.Wasm.Tree.PassRunResult}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.rebuildWithAnchorsV3_ = function (wasmModule, parsedMeta, binaryen) {
  var /** @const */ MS = Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection;
  var /** @const */ AM = Wasm2Lang.Wasm.Tree.CustomPasses.AnchorMarkers;
  var /** @const {number} */ funcCount = wasmModule.getNumFunctions();

  // Build {funcName: {anchor: {id: entry}, byName: [entries]}} from payload.
  var /** @const {!Object<string, {anchor: !Object<string, !Object>, byName: !Array<!Object>}>} */ perFunc =
      /** @type {!Object<string, {anchor: !Object<string, !Object>, byName: !Array<!Object>}>} */ (Object.create(null));
  var /** @type {*} */ rawFuncs = parsedMeta['f'];
  var /** @const {!Array<!Object>} */ funcs = /** @type {!Array<!Object>} */ (rawFuncs || []);
  for (var /** @type {number} */ fi = 0; fi !== funcs.length; ++fi) {
    var /** @const {!Object} */ fe = funcs[fi];
    var /** @const {string} */ fname = /** @type {string} */ (fe['n']);
    var /** @type {*} */ rawEntries = fe['m'];
    var /** @const {!Array<!Object>} */ es = /** @type {!Array<!Object>} */ (rawEntries || []);
    var /** @const {!Object<string, !Object>} */ anchorMap = /** @type {!Object<string, !Object>} */ (Object.create(null));
    var /** @const {!Array<!Object>} */ byName = [];
    for (var /** @type {number} */ ei = 0; ei !== es.length; ++ei) {
      var /** @const {!Object} */ ent = es[ei];
      if (void 0 !== ent['id']) {
        anchorMap[String(ent['id'])] = ent;
      } else {
        byName[byName.length] = ent;
      }
    }
    perFunc[fname] = {anchor: anchorMap, byName: byName};
  }

  // Walk anchors in IR; restore block names; populate per-function PassMetadata.
  var /** @const {!Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} */ fmByName =
      /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} */ (Object.create(null));

  AM.forEachAnchor(
    wasmModule,
    binaryen,
    /** @param {number} funcPtr @param {!BinaryenFunctionInfo} funcInfo @param {number} parentPtr @param {number} anchorIndex @param {number} anchorId */ function (
      funcPtr,
      funcInfo,
      parentPtr,
      anchorIndex,
      anchorId
    ) {
      void anchorIndex;
      var /** @const {string} */ fname = funcInfo.name;
      var /** @const */ fdata = perFunc[fname];
      if (!fdata) return;
      var /** @const {!Object|void} */ entry = fdata.anchor[String(anchorId)];
      if (!entry) return;
      if (!parentPtr) return;

      var /** @const {!BinaryenExpressionInfo} */ parentInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
          binaryen,
          parentPtr
        );
      if (binaryen.BlockId !== parentInfo.id) return;

      var /** @const {string} */ name = /** @type {string} */ (entry['n']);
      // Always restore the original w2l_-prefixed name.  Binary round-trip
      // renames non-target blocks to synthetic identifiers like $block, $block1
      // (NOT null), so checking for missing name would skip the restore and
      // the codegen's prefix-based dispatch detection would silently miss it.
      var /** @const {?string} */ oldName = /** @type {?string} */ (parentInfo.name);
      if (oldName !== name) {
        binaryen.Block.setName(parentPtr, name);
        // br/br_table targets that previously pointed at oldName are now
        // dangling — rewrite them to the restored label so the IR stays
        // self-consistent for codegen and validation.
        if (oldName) {
          MS.renameLabelRefs_(
            wasmModule,
            binaryen,
            /** @type {number} */ (binaryen.getFunctionInfo(funcPtr).body),
            oldName,
            name
          );
        }
      }

      var /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata|void} */ fm = fmByName[fname];
      if (!fm) {
        fm = MS.makeFreshPassMetadata_(funcPtr, funcInfo, wasmModule);
        fmByName[fname] = fm;
      }
      var /** @const {string} */ etype = /** @type {string} */ (entry['t']);
      if (MS.TYPE_SWITCH_DISPATCH_ === etype) {
        if (!fm.switchDispatchNames) fm.switchDispatchNames = /** @type {!Object<string, boolean>} */ (Object.create(null));
        /** @type {!Object<string, boolean>} */ (fm.switchDispatchNames)[name] = true;
      } else if (MS.TYPE_ROOT_SWITCH_ === etype) {
        if (!fm.rootSwitchNames) fm.rootSwitchNames = /** @type {!Object<string, boolean>} */ (Object.create(null));
        /** @type {!Object<string, boolean>} */ (fm.rootSwitchNames)[name] = true;
      } else if (MS.TYPE_FUSED_BLOCK_ === etype) {
        if (!fm.fusedBlocks)
          fm.fusedBlocks = /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.BlockFusionPlan>} */ (Object.create(null));
        /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.BlockFusionPlan>} */ (fm.fusedBlocks)[name] =
          /** @type {!Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ ({
            fusionVariant: /** @type {string} */ (entry['v'])
          });
      }
    }
  );

  // Apply position-keyed entries (loop plans).  Walk each function's body
  // to build the position→ptr list, then for every byName entry look up the
  // loop pointer at the recorded position, restore the loop's name (binary
  // round-trip nulls names of loops with no back-edge), and rewrite any
  // dangling br/br_table references to the new name.
  var /** @const {!Array<string>} */ funcNames = Object.keys(perFunc);
  for (var /** @type {number} */ fnIdx = 0; fnIdx !== funcNames.length; ++fnIdx) {
    var /** @const {string} */ fnKey = funcNames[fnIdx];
    var /** @const */ fdata2 = perFunc[fnKey];
    if (0 === fdata2.byName.length) continue;
    var /** @const {number} */ funcPtr2 = MS.findFunctionByName_(wasmModule, fnKey);
    if (!funcPtr2) continue;
    var /** @const {!BinaryenFunctionInfo} */ funcInfo2 = binaryen.getFunctionInfo(funcPtr2);
    if ('' !== funcInfo2.base) continue;
    var /** @const {number} */ bodyPtr2 = funcInfo2.body;
    if (!bodyPtr2) continue;
    var /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata|void} */ fm2 = fmByName[fnKey];
    if (!fm2) {
      fm2 = MS.makeFreshPassMetadata_(funcPtr2, funcInfo2, wasmModule);
      fmByName[fnKey] = fm2;
    }
    var /** @const {!Array<number>} */ loopPtrList = MS.buildLoopPositionToPtrList_(wasmModule, binaryen, bodyPtr2);
    for (var /** @type {number} */ bi = 0; bi !== fdata2.byName.length; ++bi) {
      var /** @const {!Object} */ bne = fdata2.byName[bi];
      if (MS.TYPE_LOOP_PLAN_ !== bne['t']) continue;
      var /** @const {string} */ loopName = /** @type {string} */ (bne['n']);
      var /** @const {string} */ loopKind = /** @type {string} */ (bne['k']);
      var /** @const {boolean} */ needsLabel = 1 === /** @type {number} */ (bne['l']);
      var /** @const {number} */ loopPos = /** @type {number} */ (bne['p']);
      var /** @const {number} */ loopPtr = loopPos < loopPtrList.length ? loopPtrList[loopPos] : 0;
      if (loopPtr) {
        var /** @const {!BinaryenExpressionInfo} */ loopFi = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
            binaryen,
            loopPtr
          );
        var /** @const {?string} */ loopOldName = /** @type {?string} */ (loopFi.name);
        if (loopOldName !== loopName) {
          binaryen.Loop.setName(loopPtr, loopName);
          if (loopOldName) {
            MS.renameLabelRefs_(wasmModule, binaryen, bodyPtr2, loopOldName, loopName);
          }
        }
      }
      if (!fm2.loopPlans) fm2.loopPlans = /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.LoopPlan>} */ (Object.create(null));
      /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.LoopPlan>} */ (fm2.loopPlans)[loopName] =
        /** @type {!Wasm2Lang.Wasm.Tree.LoopPlan} */ ({
          simplifiedLoopKind: loopKind,
          needsLabel: needsLabel,
          conditionPtr: MS.extractLoopConditionPtr_(binaryen, wasmModule, bodyPtr2, loopName, loopKind)
        });
    }
  }

  // Build PassRunResult shape including all functions (some may have no
  // metadata but the codegen still needs the entry).
  var /** @const {!Wasm2Lang.Wasm.Tree.PassRunResult} */ runResult = /** @type {!Wasm2Lang.Wasm.Tree.PassRunResult} */ ({
      functionCount: funcCount,
      processedCount: 0,
      functions: []
    });
  var /** @const {!Array<!Wasm2Lang.Wasm.Tree.PassMetadata>} */ outArr =
      /** @type {!Array<!Wasm2Lang.Wasm.Tree.PassMetadata>} */ (runResult.functions);
  for (var /** @type {number} */ f = 0; f !== funcCount; ++f) {
    var /** @const {number} */ fp = wasmModule.getFunctionByIndex(f);
    var /** @const {!BinaryenFunctionInfo} */ fi2 = binaryen.getFunctionInfo(fp);
    if ('' !== fi2.base) continue;
    if (!fi2.body) continue;
    var /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata|void} */ existing = fmByName[fi2.name];
    if (!existing) {
      existing = MS.makeFreshPassMetadata_(fp, fi2, wasmModule);
    }
    outArr[outArr.length] = existing;
    ++runResult.processedCount;
  }
  return runResult;
};

/**
 * @private
 * @param {number} funcPtr
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!BinaryenModule} wasmModule
 * @return {!Wasm2Lang.Wasm.Tree.PassMetadata}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.makeFreshPassMetadata_ = function (funcPtr, funcInfo, wasmModule) {
  var /** @const {!Wasm2Lang.Wasm.Tree.PassMetadata} */ fm = /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata} */ (
      Object.create(null)
    );
  fm.passFuncName = funcInfo.name;
  fm.passFuncPtr = funcPtr;
  fm.passTreeModule = wasmModule;
  fm.bodyReplaced = false;
  return fm;
};

/**
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {string} name
 * @return {number}  Function pointer or 0.
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.findFunctionByName_ = function (wasmModule, name) {
  return wasmModule.getFunction(name) || 0;
};

/**
 * Walks the function body in DFS pre-order via the shared traversal kernel
 * and assigns sequential indices to every Loop node.  Returns name→position
 * for currently-named loops; the inverse (position→ptr) is built on the
 * deserialize side via {@code buildLoopPositionToPtrList_}.  The shared
 * kernel uses {@code NodeSchema.expressionEdgeSpecs_} to cover every
 * expression slot consistently — no need to enumerate IfId / DropId / etc.
 * locally.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {number} rootPtr
 * @return {!Object<string, number>}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.buildLoopPositionMap_ = function (wasmModule, binaryen, rootPtr) {
  var /** @const {!Object<string, number>} */ out = /** @type {!Object<string, number>} */ (Object.create(null));
  var /** @type {number} */ counter = 0;
  Wasm2Lang.Wasm.Tree.TraversalKernel.forEachExpression(
    binaryen,
    wasmModule,
    rootPtr,
    /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
        @return {(string|undefined)} */ function (nodeCtx) {
      var /** @const {!BinaryenExpressionInfo} */ info = /** @type {!BinaryenExpressionInfo} */ (nodeCtx.expression);
      if (binaryen.LoopId === info.id) {
        var /** @const {?string} */ ln = /** @type {?string} */ (info.name);
        if (ln) out[ln] = counter;
        counter++;
      }
      return undefined;
    }
  );
  return out;
};

/**
 * Same DFS pre-order walk as {@code buildLoopPositionMap_}, but produces
 * the position-indexed list of Loop pointers — the inverse needed at
 * deserialize time when names may have been stripped.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {number} rootPtr
 * @return {!Array<number>}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.buildLoopPositionToPtrList_ = function (wasmModule, binaryen, rootPtr) {
  var /** @const {!Array<number>} */ out = [];
  Wasm2Lang.Wasm.Tree.TraversalKernel.forEachExpression(
    binaryen,
    wasmModule,
    rootPtr,
    /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
        @return {(string|undefined)} */ function (nodeCtx) {
      var /** @const {!BinaryenExpressionInfo} */ info = /** @type {!BinaryenExpressionInfo} */ (nodeCtx.expression);
      if (binaryen.LoopId === info.id) {
        out[out.length] = /** @type {number} */ (nodeCtx.expressionPointer);
      }
      return undefined;
    }
  );
  return out;
};

/**
 * Walks the function body via the shared traversal kernel and rewrites every
 * {@code br} / {@code br_if} / {@code br_table} reference to {@code oldName}
 * so it points to {@code newName} instead.  Used after {@code Block.setName}
 * (or {@code Loop.setName}) restores a w2l_-prefixed label — binary
 * round-trip renames the block/loop AND its references consistently to
 * synthetic names like {@code $block4}; flipping the original name back
 * leaves the references dangling unless we patch them in tandem.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {number} rootPtr  Function body pointer.
 * @param {string} oldName  Name binaryen assigned during round-trip.
 * @param {string} newName  Name we just restored on the marked block/loop.
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.renameLabelRefs_ = function (wasmModule, binaryen, rootPtr, oldName, newName) {
  Wasm2Lang.Wasm.Tree.TraversalKernel.forEachExpression(
    binaryen,
    wasmModule,
    rootPtr,
    /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
        @return {(string|undefined)} */ function (nodeCtx) {
      var /** @const {!BinaryenExpressionInfo} */ info = /** @type {!BinaryenExpressionInfo} */ (nodeCtx.expression);
      var /** @const {number} */ id = info.id;
      if (binaryen.BreakId === id) {
        if (/** @type {?string} */ (info.name) === oldName) {
          binaryen.Break.setName(/** @type {number} */ (nodeCtx.expressionPointer), newName);
        }
      } else if (binaryen.SwitchId === id) {
        var /** @const {!Array<string>|void} */ names = /** @type {!Array<string>|void} */ (info.names);
        if (names) {
          var /** @type {boolean} */ swChanged = false;
          var /** @const {!Array<string>} */ newNames = [];
          for (var /** @type {number} */ ni = 0, /** @const {number} */ nLen = names.length; ni < nLen; ++ni) {
            if (names[ni] === oldName) {
              newNames[newNames.length] = newName;
              swChanged = true;
            } else {
              newNames[newNames.length] = names[ni];
            }
          }
          if (swChanged) {
            binaryen.Switch.setNames(/** @type {number} */ (nodeCtx.expressionPointer), newNames);
          }
        }
        if (/** @type {?string} */ (info.defaultName) === oldName) {
          binaryen.Switch.setDefaultName(/** @type {number} */ (nodeCtx.expressionPointer), newName);
        }
      }
      return undefined;
    }
  );
};
