(module
  (memory 1)

  ;; Pattern A: named block whose sole child is a loop.
  ;; Block $outer should be fused (lb$outer) with fusionPattern 'a'.
  (func $fusionA (result i32)
    (local $i i32)
    (block $outer
      (loop $inner
        (br_if $outer (i32.ge_s (local.get $i) (i32.const 10)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $inner)))
    (local.get $i)
  )

  ;; Pattern B: loop whose sole body is a named block.
  ;; Block $inner should be fused (lb$inner) with fusionPattern 'b'.
  (func $fusionB (result i32)
    (local $i i32)
    (loop $outer
      (block $inner
        (br_if $inner (i32.ge_s (local.get $i) (i32.const 10)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $outer)))
    (local.get $i)
  )

  ;; No fusion: block has two children (not a sole loop).
  (func $noFusion (result i32)
    (local $i i32)
    (block $outer
      (local.set $i (i32.const 5))
      (loop $inner
        (br_if $outer (i32.ge_s (local.get $i) (i32.const 10)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $inner)))
    (local.get $i)
  )

  ;; Pattern A with outer exit: loop's first br_if targets an outer block
  ;; ($done) rather than the wrapping block ($found).  Fusion is safe because
  ;; the loop-simplification pass keeps distant-exit loops as 'for' (not
  ;; 'while'), preserving the explicit break-to-outer semantics.
  (func $fusionOuterExit (result i32)
    (local $i i32)
    (local $result i32)
    (local.set $result (i32.const -1))
    (block $done
      (block $found
        (loop $loop
          (br_if $done (i32.ge_s (local.get $i) (i32.const 10)))
          (if (i32.eq (local.get $i) (i32.const 5))
            (then (br $found)))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $loop)))
      (local.set $result (local.get $i)))
    (local.get $result)
  )
)
