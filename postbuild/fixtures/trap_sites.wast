;; Fixture for the `--trap-sites` families.
;;
;; $twoTrapsOneFunc is the non-trivial case the feature exists for: two
;; DISTINCT trap sites inside a SINGLE function.  Before per-site ids, both
;; collapsed onto the same argument-less `$w2l_trap()` and a host could not
;; tell which one fired — the exact ambiguity that made a real crash take
;; hours to locate.  The two `unreachable`s must receive different site ids.
;;
;; $divByVariable keeps a NON-CONSTANT divisor so the checked-division guard
;; is actually emitted; a literal divisor is deliberately not instrumented
;; (it cannot trap) and would test nothing.
;;
;; $divByConstant is the control for that elision: its divisor is a non-zero
;; literal, so it must keep the plain inline form even with the flag on.
;;
;; Runs under binaryen:none so the shapes survive to the emitters instead of
;; being folded away by the optimizer.
(module
  (memory 1)

  (func $twoTrapsOneFunc (export "twoTrapsOneFunc") (param $x i32) (result i32)
    (if (local.get $x) (then (unreachable)))
    (if (i32.eqz (local.get $x)) (then (unreachable)))
    (i32.const 3))

  (func $divByVariable (export "divByVariable") (param $a i32) (param $b i32) (result i32)
    (i32.div_s (local.get $a) (local.get $b)))

  ;; One export per remaining division kind, so the runtime half of the
  ;; `trap-sites-on` family can provoke EVERY kind the build can raise rather
  ;; than a representative sample.  All four divisors are non-constant for the
  ;; same reason $divByVariable's is.
  (func $divUByVariable (export "divUByVariable") (param $a i32) (param $b i32) (result i32)
    (i32.div_u (local.get $a) (local.get $b)))

  (func $remSByVariable (export "remSByVariable") (param $a i32) (param $b i32) (result i32)
    (i32.rem_s (local.get $a) (local.get $b)))

  (func $remUByVariable (export "remUByVariable") (param $a i32) (param $b i32) (result i32)
    (i32.rem_u (local.get $a) (local.get $b)))

  (func $divByConstant (export "divByConstant") (param $a i32) (result i32)
    (i32.div_s (local.get $a) (i32.const 10)))

  (func $truncOutOfRange (export "truncOutOfRange") (param $x f64) (result i32)
    (i32.trunc_f64_s (local.get $x)))
)
