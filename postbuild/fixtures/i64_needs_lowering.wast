;; Fixture for the "i64 reached a backend that cannot express it" refusal.
;;
;; asm.js and PHP have no native i64: they rely on binaryen's
;; `i64-to-i32-lowering`, which runs during NORMALIZATION and is selected from
;; the target backend.  Under `binaryen:none` that pass never runs, so an i64
;; operation reaches an emitter with no renderer for it.
;;
;; That used to emit `__unknown_i64_binop(...)` — a call to a function that is
;; never defined.  On a real module it produced 13 753 of them in output that
;; looked perfectly ordinary and threw ReferenceError on the first i64
;; operation.  The same shape is reachable through a fully supported route:
;; normalize a module for JavaScript/Java/C#, then emit it as asm.js or PHP
;; with `--pre-normalized`.
;;
;; `i64.add` is the smallest operation that reaches `renderI64BinaryOp_`; the
;; module needs nothing else to prove the contract.
(module
  (func $addI64 (export "addI64") (param $a i64) (param $b i64) (result i64)
    (i64.add (local.get $a) (local.get $b)))
)
