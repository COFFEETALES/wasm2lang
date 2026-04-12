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
 * indices to every Block and Loop node.  Returns maps from label name to
 * position and from position to label name.
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
   * @return {void}
   */
  function walk(ptr) {
    if (0 === ptr) return;
    var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ info = getInfo(binaryen, ptr);
    var /** @const {number} */ id = info.id;

    if (binaryen.BlockId === id) {
      var /** @const {?string} */ bName = /** @type {?string} */ (info.name);
      var /** @const {!Array<number>|void} */ ch = /** @type {!Array<number>|void} */ (info.children);
      var /** @const {number} */ cLen = ch ? ch.length : 0;
      // Skip empty unnamed blocks — binaryen drops these during binary
      // round-trip, so they must not affect position numbering.
      if (!bName && 0 === cLen) return;
      var /** @const {number} */ pos = counter++;
      posToPtr[pos] = ptr;
      if (bName) {
        nameToPos[bName] = pos;
        posToName[pos] = bName;
      }
      if (ch) {
        for (var /** @type {number} */ ci = 0; ci < cLen; ++ci) {
          walk(ch[ci]);
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
      walk(/** @type {number} */ (info.body || 0));
      return;
    }

    if (binaryen.IfId === id) {
      walk(/** @type {number} */ (info.condition || 0));
      walk(/** @type {number} */ (info.ifTrue || 0));
      walk(/** @type {number} */ (info.ifFalse || 0));
      return;
    }

    if (binaryen.DropId === id || binaryen.ReturnId === id || binaryen.LocalSetId === id || binaryen.GlobalSetId === id) {
      walk(/** @type {number} */ (info.value || 0));
      return;
    }

    if (binaryen.SelectId === id) {
      walk(/** @type {number} */ (info.ifTrue || 0));
      walk(/** @type {number} */ (info.ifFalse || 0));
      walk(/** @type {number} */ (info.condition || 0));
      return;
    }

    if (binaryen.BinaryId === id) {
      walk(/** @type {number} */ (info.left || 0));
      walk(/** @type {number} */ (info.right || 0));
      return;
    }

    if (binaryen.UnaryId === id) {
      walk(/** @type {number} */ (info.value || 0));
      return;
    }

    if (binaryen.BreakId === id) {
      walk(/** @type {number} */ (info.condition || 0));
      walk(/** @type {number} */ (info.value || 0));
      return;
    }

    if (binaryen.SwitchId === id) {
      walk(/** @type {number} */ (info.condition || 0));
      walk(/** @type {number} */ (info.value || 0));
      return;
    }

    if (binaryen.CallId === id || binaryen.CallIndirectId === id) {
      var /** @const {!Array<number>|void} */ operands = /** @type {!Array<number>|void} */ (info.operands);
      if (operands) {
        for (var /** @type {number} */ oi = 0, /** @const {number} */ oLen = operands.length; oi < oLen; ++oi) {
          walk(operands[oi]);
        }
      }
      if (binaryen.CallIndirectId === id) {
        walk(/** @type {number} */ (info.target || 0));
      }
      return;
    }

    if (binaryen.LoadId === id || binaryen.StoreId === id) {
      walk(/** @type {number} */ (info.ptr || 0));
      if (binaryen.StoreId === id) {
        walk(/** @type {number} */ (info.value || 0));
      }
      return;
    }
  }

  walk(rootPtr);
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

    var /** @type {?Object<string, number>} */ liOverrides = null;
    if (fm.localInitOverrides) {
      var /** @const {!Object<string, number>} */ liSrc = /** @type {!Object<string, number>} */ (fm.localInitOverrides);
      var /** @const {!Array<string>} */ liKeys = Object.keys(liSrc);
      if (0 !== liKeys.length) {
        liOverrides = Object.create(null);
        for (var /** @type {number} */ li = 0, /** @const {number} */ liLen = liKeys.length; li < liLen; ++li) {
          /** @type {!Object<string, number>} */ (liOverrides)[liKeys[li]] = liSrc[liKeys[li]];
        }
      }
    }

    if (0 === entries.length && !liOverrides) continue;

    var /** @const {!Object} */ funcEntry = Object.create(null);
    funcEntry['n'] = funcInfo.name;
    funcEntry['m'] = entries;
    if (liOverrides) {
      funcEntry['li'] = liOverrides;
    }
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
 * Returns the decoded value and the new offset.
 *
 * @private
 * @param {!Uint8Array} data
 * @param {number} offset
 * @return {{value: number, offset: number}}
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
  return {value: result, offset: offset};
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
    var /** @const {{value: number, offset: number}} */ sizeResult = MS.readLEB128_(binaryData, offset);
    var /** @const {number} */ sectionSize = sizeResult.value;
    var /** @const {number} */ sectionEnd = sizeResult.offset + sectionSize;
    offset = sizeResult.offset;

    if (0 === sectionId) {
      // Custom section: read name.
      var /** @const {{value: number, offset: number}} */ nameLen = MS.readLEB128_(binaryData, offset);
      offset = nameLen.offset;
      var /** @type {string} */ sectionName = '';
      for (var /** @type {number} */ ni = 0; ni < nameLen.value; ++ni) {
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

      var /** @type {*} */ rawLi = funcEntry['li'];
      var /** @const {?Object<string, number>} */ liData = /** @type {?Object<string, number>} */ (rawLi || null);
      if (liData) {
        fm.localInitOverrides = liData;
      }
      // Legacy: lfc (localInitFoldCount) is no longer used.  Zero-value
      // folds are handled by nop replacement in the normalization layer;
      // non-zero folds use initOverrides (the 'li' field above).
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
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} rootPtr
 * @param {string} loopName
 * @return {number}  Expression pointer to the Loop, or 0 if not found.
 */
Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.findLoopByName_ = function (binaryen, rootPtr, loopName) {
  if (0 === rootPtr) return 0;
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ info = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      rootPtr
    );
  var /** @const {number} */ id = info.id;

  if (binaryen.LoopId === id && /** @type {string} */ (info.name) === loopName) {
    return rootPtr;
  }

  var /** @const {function(!Binaryen, number, string): number} */ find =
      Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.findLoopByName_;

  if (binaryen.BlockId === id) {
    var /** @const {!Array<number>|void} */ ch = /** @type {!Array<number>|void} */ (info.children);
    if (ch) {
      for (var /** @type {number} */ i = 0, /** @const {number} */ cLen = ch.length; i < cLen; ++i) {
        var /** @const {number} */ found = find(binaryen, ch[i], loopName);
        if (0 !== found) return found;
      }
    }
  } else if (binaryen.LoopId === id) {
    return find(binaryen, /** @type {number} */ (info.body || 0), loopName);
  } else if (binaryen.IfId === id) {
    var /** @type {number} */ r = find(binaryen, /** @type {number} */ (info.ifTrue || 0), loopName);
    if (0 === r) r = find(binaryen, /** @type {number} */ (info.ifFalse || 0), loopName);
    return r;
  }

  return 0;
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

  var /** @const {number} */ loopPtr = MS.findLoopByName_(binaryen, bodyPtr, loopName);
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
