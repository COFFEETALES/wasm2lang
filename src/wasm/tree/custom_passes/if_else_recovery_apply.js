'use strict';

/**
 * Application logic for the if-else recovery pass.
 *
 * Owns the {@code getIfElseRecoveryPlan} accessor and the postbuild analysis
 * descriptor for IfElseRecoveryPlan metadata produced by IfElseRecoveryPass.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.IfElseRecoveryApplication = {};

Wasm2Lang.Wasm.Tree.CustomPasses.IfElseRecoveryApplication.getIfElseRecoveryPlan =
  /** @type {function(?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>, string, string):?Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan} */ (
    Wasm2Lang.Wasm.Tree.CustomPasses.declareNamedPlanAccessor_(
      'ifElseRecovery',
      /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
        return fm.ifElseRecoveries;
      },
      /** @param {*} plan @return {!Object} */ function (plan) {
        var /** @const {!Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan} */ p = /** @type {!Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan} */ (
            plan
          );
        return {'chainLength': p.chainLength, 'labelRemoved': p.labelRemoved};
      }
    )
  );
