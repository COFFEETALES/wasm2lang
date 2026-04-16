'use strict';

/**
 * Application logic for the block-loop fusion detection pass.
 *
 * Owns the {@code getBlockFusionPlan} accessor and the postbuild analysis
 * descriptor for BlockFusionPlan metadata produced by BlockLoopFusionPass.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionApplication = {};

Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionApplication.getBlockFusionPlan =
  /** @type {function(?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>, string, string):?Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ (
    Wasm2Lang.Wasm.Tree.CustomPasses.declareNamedPlanAccessor_(
      'blockLoopFusion',
      /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
        return fm.fusedBlocks;
      },
      /** @param {*} plan @return {!Object} */ function (plan) {
        return {'fusionPattern': /** @type {!Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ (plan).fusionVariant};
      }
    )
  );
