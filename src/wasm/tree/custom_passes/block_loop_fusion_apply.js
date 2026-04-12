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

/** @const {function(!Wasm2Lang.Wasm.Tree.PassMetadata):*} */
var extractFusedBlocks_ = /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
  return fm.fusedBlocks;
};

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
  return /** @type {?Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ (
    Wasm2Lang.Wasm.Tree.CustomPasses.getNamedMetadataEntry(passRunResultIndex, funcName, extractFusedBlocks_, blockName)
  );
};

Wasm2Lang.Wasm.Tree.CustomPasses.registerProjectedPlanAnalysis_(
  'blockLoopFusion',
  extractFusedBlocks_,
  /** @param {*} plan @return {!Object} */ function (plan) {
    return {'fusionPattern': /** @type {!Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ (plan).fusionVariant};
  }
);
