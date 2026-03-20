'use strict';

/**
 * Application logic for the block-loop fusion detection pass.
 *
 * This module owns the accessor for BlockFusionPlan metadata produced by
 * BlockLoopFusionPass, plus a consolidated fusion-check utility.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionApplication = {};

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Returns the BlockFusionPlan for the given block, or null.
 *
 * @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} passRunResultIndex
 * @param {string} funcName
 * @param {string} blockName
 * @return {?Wasm2Lang.Wasm.Tree.BlockFusionPlan}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionApplication.getBlockFusionPlan = function (
  passRunResultIndex,
  funcName,
  blockName
) {
  if (!passRunResultIndex) {
    return null;
  }
  var /** @const {!Wasm2Lang.Wasm.Tree.PassMetadata|void} */ fm = passRunResultIndex[funcName];
  if (!fm) {
    return null;
  }
  var /** @const {*} */ plans = fm.fusedBlocks;
  if (!plans) {
    return null;
  }
  return /** @type {?Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ (
    /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.BlockFusionPlan>} */ (plans)[blockName] || null
  );
};

/**
 * Returns true if the given block is a fused block (either by plan or lb$ prefix).
 *
 * @suppress {accessControls}
 * @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} passRunResultIndex
 * @param {string} funcName
 * @param {string} blockName
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionApplication.isFusedBlock = function (passRunResultIndex, funcName, blockName) {
  return (
    !!Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionApplication.getBlockFusionPlan(passRunResultIndex, funcName, blockName) ||
    0 === blockName.indexOf(Wasm2Lang.Backend.AbstractCodegen.LB_FUSION_PREFIX_)
  );
};
