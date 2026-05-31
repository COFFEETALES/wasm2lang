(module
  (memory 1)

  ;; Regression: kernel-level guarantee that a leave callback sees the
  ;; up-to-date children list of its node, including replacements that
  ;; child leave callbacks made via REPLACE_NODE.
  ;;
  ;; This fixture exercises *nested* block-guard-elision candidates: the
  ;; outer block's first child is itself a BGE-eligible inner block.  When
  ;; BlockGuardElisionPass fires on the inner block, the outer's child slot
  ;; is updated in the binaryen heap.  If the outer's own leave callback
  ;; later reads a stale cached snapshot of `expr.children`, it will
  ;; reconstruct the outer block carrying the *original* inner block
  ;; pointer — silently keeping the inner block's `(br_if $inner cond)`
  ;; pattern alive and erasing the inner pass's work.
  ;;
  ;; A correct kernel refreshes `nodeCtx.expression` after walking children
  ;; and before the leave callback fires, so the outer pass sees the post-
  ;; replacement child slot and builds its new wrapper out of fresh
  ;; pointers — preserving the inner transformation.
  (export "nestedGuardEverFresh" (func $nestedGuardEverFresh))
  (func $nestedGuardEverFresh (param $x i32) (result i32)
    (local $r i32)
    (block $outer
      (block $inner
        (br_if $inner (i32.eqz (local.get $x)))
        (local.set $r (i32.const 100)))
      (br_if $outer (i32.eqz (local.get $r)))
      (local.set $r (i32.add (local.get $r) (i32.const 1))))
    (local.get $r)
  )
)
