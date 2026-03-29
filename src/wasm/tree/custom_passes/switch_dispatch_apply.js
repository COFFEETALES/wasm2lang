'use strict';

/**
 * Application logic for the switch-dispatch detection pass.
 *
 * This module owns the extraction and emission of flat-switch structures
 * detected by SwitchDispatchDetectionPass (sw$ marker) and root-switch
 * structures detected by RootSwitchDetectionPass (rs$ marker).
 *
 * All functions are pure statics operating on binaryen pointers and pass
 * metadata — no backend instance required for extraction/accessors.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication = {};

// ---------------------------------------------------------------------------
// Typedefs
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   caseIndices: !Array<number>,
 *   actionPtrs: !Array<number>,
 *   needsBreak: boolean,
 *   externalTarget: ?string
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup;

/**
 * @typedef {{
 *   conditionPtr: number,
 *   outerName: string,
 *   caseGroups: !Array<!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup>,
 *   defaultGroup: ?Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup,
 *   requiresLabel: boolean
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo;

/**
 * @typedef {{
 *   loopPtr: number,
 *   loopName: string,
 *   rsBlockName: string,
 *   exitPaths: !Object<string, !Array<number>>
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.RootSwitchInfo;

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Returns true if the given block is a switch-dispatch block.
 *
 * @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} passRunResultIndex
 * @param {string} funcName
 * @param {string} blockName
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.isBlockSwitchDispatch = function (
  passRunResultIndex,
  funcName,
  blockName
) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.hasNamedMetadataFlag(
    passRunResultIndex,
    funcName,
    /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
      return fm.switchDispatchNames;
    },
    blockName
  );
};

/**
 * Returns true if the given block is a root-switch block.
 *
 * @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} passRunResultIndex
 * @param {string} funcName
 * @param {string} blockName
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.isBlockRootSwitch = function (
  passRunResultIndex,
  funcName,
  blockName
) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.hasNamedMetadataFlag(
    passRunResultIndex,
    funcName,
    /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
      return fm.rootSwitchNames;
    },
    blockName
  );
};

// ---------------------------------------------------------------------------
// Analysis descriptors
// ---------------------------------------------------------------------------

Wasm2Lang.Wasm.Tree.CustomPasses.registerFieldAnalysisDescriptor(
  'switchDispatch',
  /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
    return fm.switchDispatchNames;
  }
);

Wasm2Lang.Wasm.Tree.CustomPasses.registerFieldAnalysisDescriptor(
  'rootSwitch',
  /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
    return fm.rootSwitchNames;
  }
);

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the flat-switch structure from a br_table dispatch block that has
 * been annotated by the SwitchDispatchDetectionPass.
 *
 * @param {!Binaryen} binaryen
 * @param {number} outerBlockPtr
 * @return {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.extractStructure = function (binaryen, outerBlockPtr) {
  var /** @const {!Object<string, *>} */ outerInfo = /** @type {!Object<string, *>} */ (
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, outerBlockPtr)
    );
  var /** @const {string} */ outerName = /** @type {string} */ (outerInfo['name']);

  // Walk the chain of first-child blocks.
  // Each entry is [name, childPtrs].  chain[0] = outer, chain[N] = innermost wrapper.
  var /** @const {!Array<!Array>} */ chain = [];
  var /** @const {!Object<string, number>} */ nameToIdx = /** @type {!Object<string, number>} */ (Object.create(null));

  var /** @type {!Object<string, *>} */ curInfo = outerInfo;
  for (;;) {
    var /** @const {string} */ curName = /** @type {string} */ (curInfo['name']);
    var /** @const {!Array<number>} */ curChildPtrs = /** @type {!Array<number>} */ (curInfo['children']);
    nameToIdx[curName] = chain.length;
    chain[chain.length] = [curName, curChildPtrs];

    var /** @const {number} */ fcPtr = curChildPtrs[0];
    var /** @const {!Object<string, *>} */ fcInfo = /** @type {!Object<string, *>} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, fcPtr)
      );
    if (/** @type {number} */ (fcInfo['id']) !== binaryen.BlockId) {
      break;
    }
    var /** @const {!Array<number>} */ fcChildren = /** @type {!Array<number>} */ (fcInfo['children'] || []);
    if (1 === fcChildren.length) {
      var /** @const {!Object<string, *>} */ soleInfo = /** @type {!Object<string, *>} */ (
          Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, fcChildren[0])
        );
      if (/** @type {number} */ (soleInfo['id']) === binaryen.SwitchId) {
        // Record innermost wrapper.
        var /** @const {string} */ wrapperName = /** @type {string} */ (fcInfo['name']);
        nameToIdx[wrapperName] = chain.length;
        chain[chain.length] = [wrapperName, fcChildren];

        var /** @const {!Array<string>} */ switchNames = /** @type {!Array<string>} */ (soleInfo['names'] || []);
        var /** @const {string} */ switchDefault = /** @type {string} */ (soleInfo['defaultName'] || '');
        var /** @const {number} */ conditionPtr = /** @type {number} */ (soleInfo['condition']);

        // prettier-ignore
        var /** @const */ buildGroup =
          /** @param {string} target @return {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup} */
          function (target) {
            var /** @type {!Array<number>} */ aPtrs;
            var /** @type {boolean} */ nb;
            var /** @type {?string} */ ext = null;
            var /** @const {number|undefined} */ tIdx = nameToIdx[target];
            if (void 0 !== tIdx && 0 < tIdx) {
              var /** @const {number} */ pIdx = tIdx - 1;
              aPtrs = /** @type {!Array<number>} */ (chain[pIdx][1]).slice(1);
              nb = 0 === pIdx;
            } else if (target === outerName || (void 0 !== tIdx && 0 === tIdx)) {
              // Target is the outermost chain block itself — no actions inside.
              aPtrs = [];
              nb = true;
            } else {
              // External target (not in the dispatch chain).
              aPtrs = [];
              nb = false;
              ext = target;
            }
            // If the last action is an unconditional break, the case is already
            // terminated — no additional switch break is needed.
            if (nb && aPtrs.length > 0) {
              var /** @const {!Object<string, *>} */ lastAct = /** @type {!Object<string, *>} */ (
                  Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen,aPtrs[aPtrs.length - 1])
                );
              if (
                /** @type {number} */ (lastAct['id']) === binaryen.BreakId &&
                0 === /** @type {number} */ (lastAct['condition'] || 0)
              ) {
                nb = false;
              }
            }
            return /** @type {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup} */ ({
              caseIndices: [],
              actionPtrs: aPtrs,
              needsBreak: nb,
              externalTarget: ext
            });
          };

        // Build case groups (adjacent same-target entries merged).
        var /** @const {!Array<!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup>} */ caseGroups = [];
        var /** @type {number} */ si = 0;
        var /** @const {number} */ swNameLen = switchNames.length;
        while (si < swNameLen) {
          var /** @const {string} */ target = switchNames[si];
          var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup} */ group =
              buildGroup(target);
          var /** @const {!Array<number>} */ groupIndices = /** @type {!Array<number>} */ (group.caseIndices);
          while (si < swNameLen && switchNames[si] === target) {
            groupIndices[groupIndices.length] = si;
            ++si;
          }
          caseGroups[caseGroups.length] = group;
        }

        var /** @type {?Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup} */ defaultGroup = null;
        if ('' !== switchDefault) {
          defaultGroup = buildGroup(switchDefault);
        }

        return /** @type {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo} */ ({
          conditionPtr: conditionPtr,
          outerName: outerName,
          caseGroups: caseGroups,
          defaultGroup: defaultGroup,
          // Flat-switch emission consumes the whole outer block, so case exits
          // can use a plain switch break instead of a labeled one.
          requiresLabel: false
        });
      }
    }

    curInfo = fcInfo;
  }

  // Fallback (should not reach here for a correctly annotated block).
  return /** @type {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo} */ ({
    conditionPtr: 0,
    outerName: outerName,
    caseGroups: [],
    defaultGroup: null,
    requiresLabel: true
  });
};

// ---------------------------------------------------------------------------
// Shared emission helpers
// ---------------------------------------------------------------------------

/**
 * Appends the flat-switch opening line, adding a label only when the
 * extracted dispatch structure requires one.
 *
 * @suppress {accessControls}
 * @param {!Array<string>} lines
 * @param {number} indent
 * @param {string} conditionExpr
 * @param {string} switchLabel
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo} info
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitFlatSwitchHeader = function (
  lines,
  indent,
  conditionExpr,
  switchLabel,
  info
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  lines[lines.length] = pad(indent) + (info.requiresLabel ? switchLabel + ': ' : '') + 'switch (' + conditionExpr + ') {\n';
};

/**
 * Appends the exit statement for a flat-switch case group.
 *
 * @suppress {accessControls}
 * @param {!Array<string>} lines
 * @param {number} indent
 * @param {string} switchLabel
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo} info
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitFlatSwitchBreak = function (lines, indent, switchLabel, info) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  lines[lines.length] = pad(indent) + 'break' + (info.requiresLabel ? ' ' + switchLabel : '') + ';\n';
};

/**
 * Sub-walks expression pointers and appends rendered lines.
 *
 * @suppress {accessControls}
 * @param {!Array<string>} lines
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} visitor
 * @param {!Array<number>} ptrs
 * @param {number} count
 * @param {number} indent
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitSubWalkedExpressions_ = function (
  lines,
  wasmModule,
  binaryen,
  funcInfo,
  visitor,
  ptrs,
  count,
  indent
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const */ subWalk = Wasm2Lang.Backend.AbstractCodegen.subWalkExpression_;
  var /** @const */ subStr = Wasm2Lang.Backend.AbstractCodegen.subWalkString_;
  for (var /** number */ i = 0; i < count; ++i) {
    var /** @const {string} */ code = subStr(subWalk(wasmModule, binaryen, funcInfo, visitor, ptrs[i]));
    if ('' !== code) {
      if (-1 === code.indexOf('\n')) {
        lines[lines.length] = pad(indent) + code + ';\n';
      } else {
        lines[lines.length] = code;
      }
    }
  }
};

/**
 * Renders sub-walked action expressions as switch-case body lines, using the
 * same formatting as the BlockId child rendering (single-line gets pad+semi,
 * multi-line used as-is).
 *
 * @suppress {accessControls}
 * @param {!Array<string>} lines  Output array to append to.
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} visitor
 * @param {!Array<number>} actionPtrs
 * @param {number} caseIndent
 * @param {string=} opt_terminalBreakTarget
 * @return {boolean}  True when a terminal break-to-target was stripped.
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitSwitchCaseActions = function (
  lines,
  wasmModule,
  binaryen,
  funcInfo,
  visitor,
  actionPtrs,
  caseIndent,
  opt_terminalBreakTarget
) {
  var /** @type {number} */ actionCount = actionPtrs.length;
  var /** @type {boolean} */ strippedTerminalBreak = false;

  if (0 < actionCount && 'string' === typeof opt_terminalBreakTarget) {
    var /** @const {!Object<string, *>} */ terminalInfo = /** @type {!Object<string, *>} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, actionPtrs[actionCount - 1])
      );
    if (
      terminalInfo['id'] === binaryen.BreakId &&
      terminalInfo['name'] === opt_terminalBreakTarget &&
      0 === /** @type {number} */ (terminalInfo['condition'] || 0) &&
      0 === /** @type {number} */ (terminalInfo['value'] || 0)
    ) {
      --actionCount;
      strippedTerminalBreak = true;

      // If the new last action is itself an unconditional break, the case is
      // already terminated — no additional switch break is needed.  This avoids
      // emitting unreachable code (Java rejects unreachable statements).
      if (0 < actionCount) {
        var /** @const {!Object<string, *>} */ prevInfo = /** @type {!Object<string, *>} */ (
            Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, actionPtrs[actionCount - 1])
          );
        if (
          /** @type {number} */ (prevInfo['id']) === binaryen.BreakId &&
          0 === /** @type {number} */ (prevInfo['condition'] || 0)
        ) {
          strippedTerminalBreak = false;
        }
      }
    }
  }

  Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitSubWalkedExpressions_(
    lines,
    wasmModule,
    binaryen,
    funcInfo,
    visitor,
    actionPtrs,
    actionCount,
    caseIndent
  );

  return strippedTerminalBreak;
};

/**
 * Sub-walks root-switch exit-code expression pointers, appending the rendered
 * lines to {@code lines}.  Returns {@code true} when the last expression is
 * terminal (ReturnId or UnreachableId), meaning no additional break is needed.
 *
 * @suppress {accessControls}
 * @param {!Array<string>} lines
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} visitor
 * @param {!Array<number>} exitPtrs
 * @param {number} indent
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitRootSwitchExitCode = function (
  lines,
  wasmModule,
  binaryen,
  funcInfo,
  visitor,
  exitPtrs,
  indent
) {
  Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitSubWalkedExpressions_(
    lines,
    wasmModule,
    binaryen,
    funcInfo,
    visitor,
    exitPtrs,
    exitPtrs.length,
    indent
  );

  if (0 < exitPtrs.length) {
    var /** @const {number} */ lastId = /** @type {number} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, exitPtrs[exitPtrs.length - 1])['id']
      );
    return lastId === binaryen.ReturnId || lastId === binaryen.UnreachableId;
  }
  return false;
};

// ---------------------------------------------------------------------------
// Root-switch extraction
// ---------------------------------------------------------------------------

/**
 * Walks the first-child chain from an {@code rs$}-prefixed block to locate
 * the inner loop and collect exit-code expression pointers for each
 * intermediate block level.
 *
 * @suppress {accessControls}
 * @param {!Binaryen} binaryen
 * @param {number} rsBlockPtr
 * @return {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.RootSwitchInfo}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.extractRootSwitchStructure = function (binaryen, rsBlockPtr) {
  var /** @const {!Object<string, *>} */ outerInfo = /** @type {!Object<string, *>} */ (
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, rsBlockPtr)
    );
  var /** @const {string} */ rsBlockName = /** @type {string} */ (outerInfo['name']);

  // chain[i] = {name: blockName, childPtrs: Array<number>}
  var /** @const {!Array<!Object>} */ chain = [];
  var /** @type {!Object<string, *>} */ curInfo = outerInfo;
  var /** @type {number} */ loopPtr = 0;
  var /** @type {string} */ loopName = '';

  for (;;) {
    var /** @const {string} */ curName = /** @type {string} */ (curInfo['name']);
    var /** @const {!Array<number>} */ curChildPtrs = /** @type {!Array<number>} */ (curInfo['children'] || []);
    chain[chain.length] = {'n': curName, 'c': curChildPtrs};

    if (0 === curChildPtrs.length) {
      break;
    }

    var /** @const {number} */ fcPtr = curChildPtrs[0];
    var /** @const {!Object<string, *>} */ fcInfo = /** @type {!Object<string, *>} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, fcPtr)
      );
    var /** @const {number} */ fcId = /** @type {number} */ (fcInfo['id']);

    // Direct loop child.
    if (fcId === binaryen.LoopId) {
      loopPtr = fcPtr;
      loopName = /** @type {string} */ (fcInfo['name']);
      break;
    }

    if (fcId !== binaryen.BlockId) {
      break;
    }

    var /** @const {string} */ fcName = /** @type {string} */ (fcInfo['name'] || '');

    // lb$ fused block containing a loop.
    if (Wasm2Lang.Backend.AbstractCodegen.hasPrefix_(fcName, Wasm2Lang.Backend.AbstractCodegen.LB_FUSION_PREFIX_)) {
      var /** @const {!Array<number>} */ fusedCh = /** @type {!Array<number>} */ (fcInfo['children'] || []);
      if (1 === fusedCh.length) {
        var /** @const {!Object<string, *>} */ fusedChild = /** @type {!Object<string, *>} */ (
            Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, fusedCh[0])
          );
        if (/** @type {number} */ (fusedChild['id']) === binaryen.LoopId) {
          // Add lb$ block to the chain so that br $lb$... targets inside
          // the flat switch are intercepted by the root-switch exit map.
          chain[chain.length] = {'n': fcName, 'c': fusedCh};
          loopPtr = fusedCh[0];
          loopName = /** @type {string} */ (fusedChild['name']);
          break;
        }
      }
    }

    curInfo = fcInfo;
  }

  // Build exit paths for each intermediate block.
  // For br chain[j].name (j >= 1):
  //   exit code = chain[j-1].childPtrs[1..] ∪ chain[j-2].childPtrs[1..] ∪ ... ∪ chain[0].childPtrs[1..]
  //   (stop early if a ReturnId or UnreachableId is encountered)
  var /** @const {!Object<string, !Array<number>>} */ exitPaths = /** @type {!Object<string, !Array<number>>} */ (
      Object.create(null)
    );

  for (var /** number */ j = 1, /** @const {number} */ chainLen = chain.length; j < chainLen; ++j) {
    var /** @const {string} */ targetName = /** @type {string} */ (chain[j]['n']);
    var /** @const {!Array<number>} */ exitPtrs = [];
    var /** @type {boolean} */ hitTerminal = false;

    for (var /** number */ k = j - 1; 0 <= k && !hitTerminal; --k) {
      var /** @const {!Array<number>} */ levelPtrs = /** @type {!Array<number>} */ (chain[k]['c']);
      for (var /** number */ p = 1, /** @const {number} */ ptrLen = levelPtrs.length; p < ptrLen; ++p) {
        exitPtrs[exitPtrs.length] = levelPtrs[p];
        var /** @const {number} */ ptrId = /** @type {number} */ (
            Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, levelPtrs[p])['id']
          );
        if (ptrId === binaryen.ReturnId || ptrId === binaryen.UnreachableId) {
          hitTerminal = true;
          break;
        }
      }
    }

    exitPaths[targetName] = exitPtrs;
  }

  return /** @type {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.RootSwitchInfo} */ ({
    loopPtr: loopPtr,
    loopName: loopName,
    rsBlockName: rsBlockName,
    exitPaths: exitPaths
  });
};

// ---------------------------------------------------------------------------
// Labeled emission (prototype delegates)
// ---------------------------------------------------------------------------

/**
 * Emits a case/default group's action code and exit statement for labeled-break
 * backends.
 *
 * @suppress {accessControls}
 * @param {!Array<string>} lines
 * @param {!Wasm2Lang.Backend.AbstractCodegen} codegen
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} vis
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup} group
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo} info
 * @param {string} outerLabel
 * @param {number} indent
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitLabeledGroupBody_ = function (
  lines,
  codegen,
  state,
  vis,
  group,
  info,
  outerLabel,
  indent
) {
  var /** @const */ S = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication;
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @type {?Object<string, !Array<number>>} */ rsExitMap = state.rootSwitchExitMap;
  var /** @type {string} */ rsRsName = state.rootSwitchRsName;
  var /** @type {string} */ rsLoopName = state.rootSwitchLoopName;

  var /** @const {number} */ savedIndent = state.indent;
  state.indent = indent;
  var /** @const {boolean} */ strippedBreak = S.emitSwitchCaseActions(
      lines,
      state.wasmModule,
      binaryen,
      state.functionInfo,
      vis,
      group.actionPtrs,
      indent,
      info.outerName
    );
  state.indent = savedIndent;

  if (group.externalTarget) {
    if (rsExitMap && group.externalTarget in rsExitMap) {
      var /** @const {number} */ savedInd2 = state.indent;
      state.indent = indent;
      var /** @const {boolean} */ terminal = S.emitRootSwitchExitCode(
          lines,
          state.wasmModule,
          binaryen,
          state.functionInfo,
          vis,
          rsExitMap[group.externalTarget],
          indent
        );
      state.indent = savedInd2;
      if (!terminal) {
        lines[lines.length] = pad(indent) + codegen.renderLabeledJump_(state.labelMap, 'break', rsLoopName);
      }
    } else if (rsRsName && group.externalTarget === rsRsName) {
      lines[lines.length] = pad(indent) + codegen.renderLabeledJump_(state.labelMap, 'break', rsLoopName);
    } else {
      lines[lines.length] =
        pad(indent) +
        codegen.resolveBreakTarget_(state.labelKinds, state.fusedBlockToLoop, state.labelMap, group.externalTarget);
    }
  } else if (group.needsBreak || strippedBreak) {
    S.emitFlatSwitchBreak(lines, indent, outerLabel, info);
  }
};

/**
 * Emits a flat switch statement for backends using labeled break semantics
 * (asm.js, Java).  PHP overrides {@code emitFlatSwitch_} entirely because
 * it uses numeric break depths instead of labels.
 *
 * @suppress {accessControls}
 * @param {!Wasm2Lang.Backend.AbstractCodegen} codegen
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {{emittedString: string, hasDefault: boolean}}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitLabeledFlatSwitch = function (codegen, state, nodeCtx) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ S = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication;
  var /** @const */ pad = A.pad_;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {number} */ ind = state.indent;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ vis =
    /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor);
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo} */ info =
    /** @type {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo} */ (
      S.extractStructure(binaryen, nodeCtx.expressionPointer)
    );
  var /** @const {string} */ outerLabel = codegen.labelN_(state.labelMap, info.outerName);

  var /** @const {{s: string, c: number}} */ condResult = A.subWalkExpressionWithCategory_(state, info.conditionPtr);
  var /** @type {string} */ condInput = condResult.s;
  if (Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32 === condResult.c) {
    condInput = codegen.renderNumericComparisonResult_(condInput);
  }
  var /** @const {string} */ condStr = codegen.coerceSwitchCondition_(condInput);

  var /** @const {!Array<string>} */ lines = [];
  S.emitFlatSwitchHeader(lines, ind, condStr, outerLabel, info);

  var /** @const {!Array<!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup>} */ groups =
      info.caseGroups;
  for (var /** number */ gi = 0, /** @const {number} */ groupLen = groups.length; gi < groupLen; ++gi) {
    var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup} */ group = groups[gi];
    var /** @const {!Array<number>} */ indices = group.caseIndices;
    for (var /** number */ ii = 0, /** @const {number} */ idxLen = indices.length; ii < idxLen; ++ii) {
      lines[lines.length] = pad(ind + 1) + 'case ' + indices[ii] + ':\n';
    }
    S.emitLabeledGroupBody_(lines, codegen, state, vis, group, info, outerLabel, ind + 2);
  }

  var /** @type {?Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup} */ defGroup = info.defaultGroup;
  if (defGroup) {
    lines[lines.length] = pad(ind + 1) + 'default:\n';
    S.emitLabeledGroupBody_(lines, codegen, state, vis, defGroup, info, outerLabel, ind + 2);
  }

  lines[lines.length] = pad(ind) + '}\n';
  return {emittedString: lines.join(''), hasDefault: !!defGroup};
};

/**
 * Emits a root-switch-loop structure for backends using labeled break semantics.
 * Shared by asm.js and Java; PHP overrides {@code emitRootSwitch_} entirely.
 *
 * @suppress {accessControls}
 * @param {!Wasm2Lang.Backend.AbstractCodegen} codegen
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitLabeledRootSwitch = function (codegen, state, nodeCtx) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ S = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.RootSwitchInfo} */ info =
    /** @type {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.RootSwitchInfo} */ (
      S.extractRootSwitchStructure(binaryen, nodeCtx.expressionPointer)
    );

  state.rootSwitchExitMap = info.exitPaths;
  state.rootSwitchRsName = info.rsBlockName;
  state.rootSwitchLoopName = info.loopName;

  state.labelKinds[info.loopName] = 'loop';
  for (var /** @type {string} */ exitName in info.exitPaths) {
    state.labelKinds[exitName] = 'block';
  }

  var /** @const {string} */ loopCode = A.subWalkExpressionString_(state, info.loopPtr);

  state.rootSwitchExitMap = null;
  state.rootSwitchRsName = '';
  state.rootSwitchLoopName = '';

  return loopCode;
};
