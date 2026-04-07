(module
  (memory 1)

  ;; Single-child block with unreferenced label → unwrapped.
  (func $singleChildRemoved (param $x i32) (result i32)
    (local $r i32)
    (block $wrapper
      (local.set $r (i32.add (local.get $x) (i32.const 1))))
    (local.get $r)
  )

  ;; Multi-child block with unreferenced label → label stripped.
  (func $multiChildLabelRemoved (param $x i32) (result i32)
    (local $r i32)
    (block $wrapper
      (local.set $r (i32.add (local.get $x) (i32.const 10)))
      (local.set $r (i32.mul (local.get $r) (i32.const 2))))
    (local.get $r)
  )

  ;; Single-child block with referenced label → NOT removed.
  (func $singleChildKept (param $x i32) (result i32)
    (local $r i32)
    (block $done
      (if (i32.gt_s (local.get $x) (i32.const 0))
        (then
          (local.set $r (local.get $x))
          (br $done)))
      (local.set $r (i32.const 0)))
    (local.get $r)
  )

  ;; Unnamed block → not touched (no label to remove).
  (func $unnamedBlock (param $x i32) (result i32)
    (local $r i32)
    (block
      (local.set $r (i32.add (local.get $x) (i32.const 5))))
    (local.get $r)
  )
)
