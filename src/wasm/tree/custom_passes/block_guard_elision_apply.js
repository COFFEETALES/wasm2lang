'use strict';

/**
 * Application logic for the block-guard elision pass.
 *
 * Owns the {@code getBlockGuardElisionPlan} accessor and the postbuild
 * analysis descriptor for BlockGuardElisionPlan metadata produced by
 * BlockGuardElisionPass.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionApplication = {};

Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionApplication.getBlockGuardElisionPlan =
  /** @type {function(?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>, string, string):?Wasm2Lang.Wasm.Tree.BlockGuardElisionPlan} */ (
    Wasm2Lang.Wasm.Tree.CustomPasses.declareNamedPlanAccessor_(
      'blockGuardElision',
      /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
        return fm.blockGuardElisions;
      },
      /** @param {*} plan @return {!Object} */ function (plan) {
        return {'labelRemoved': /** @type {!Wasm2Lang.Wasm.Tree.BlockGuardElisionPlan} */ (plan).labelRemoved};
      }
    )
  );
