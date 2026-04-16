'use strict';

/**
 * Application logic for the loop simplification detection pass.
 *
 * Owns the {@code getLoopPlan} accessor and the postbuild analysis descriptor
 * for LoopPlan metadata produced by LoopSimplificationPass.  Loop plans encode
 * the optimization kind (for-loop, do-while, while) and label-elision decision
 * as structured data, eliminating the need for prefix-string parsing.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationApplication = {};

Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationApplication.getLoopPlan =
  /** @type {function(?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>, string, string):?Wasm2Lang.Wasm.Tree.LoopPlan} */ (
    Wasm2Lang.Wasm.Tree.CustomPasses.declareNamedPlanAccessor_(
      'loopSimplification',
      /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
        return fm.loopPlans;
      },
      /** @param {*} plan @return {!Object} */ function (plan) {
        return {'loopKind': /** @type {!Wasm2Lang.Wasm.Tree.LoopPlan} */ (plan).simplifiedLoopKind};
      }
    )
  );
