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
  return /** @type {?Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ (
    Wasm2Lang.Wasm.Tree.CustomPasses.getNamedMetadataEntry(
      passRunResultIndex,
      funcName,
      /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
        return fm.fusedBlocks;
      },
      blockName
    )
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

// ---------------------------------------------------------------------------
// Analysis descriptor
// ---------------------------------------------------------------------------

Wasm2Lang.Wasm.Tree.CustomPasses.registerFieldAnalysisDescriptor(
  'blockLoopFusion',
  /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
    return fm.fusedBlocks;
  },
  /** @param {!Object} raw @return {!Object} */ function (raw) {
    return Wasm2Lang.Wasm.Tree.CustomPasses.serializeProjectedPlanMap(
      raw,
      /** @param {*} plan @return {!Object} */ function (plan) {
        return {'fusionPattern': /** @type {!Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ (plan).fusionVariant};
      }
    );
  }
);
