(module
  (memory 1)

  ;; Single if-then-break + else body → chain=1, label removed.
  (func $singleIfElse (param $x i32) (result i32)
    (local $r i32)
    (block $done
      (if (i32.gt_s (local.get $x) (i32.const 0))
        (then
          (local.set $r (local.get $x))
          (br $done)))
      (local.set $r (i32.sub (i32.const 0) (local.get $x))))
    (local.get $r)
  )

  ;; Three chained if-then-break patterns + else body → chain=3, label removed.
  (func $chainedIfElse (param $x i32) (result i32)
    (local $r i32)
    (block $done
      (if (i32.gt_s (local.get $x) (i32.const 100))
        (then
          (local.set $r (i32.const 3))
          (br $done)))
      (if (i32.gt_s (local.get $x) (i32.const 10))
        (then
          (local.set $r (i32.const 2))
          (br $done)))
      (if (i32.gt_s (local.get $x) (i32.const 0))
        (then
          (local.set $r (i32.const 1))
          (br $done)))
      (local.set $r (i32.const 0)))
    (local.get $r)
  )

  ;; First child is br_if, not If → no recovery.
  (func $noRecovery (param $x i32) (result i32)
    (local $r i32)
    (block $done
      (br_if $done (i32.le_s (local.get $x) (i32.const 0)))
      (local.set $r (local.get $x)))
    (local.get $r)
  )

  ;; Intermediate br $done inside then-arm → chain=1, label kept.
  (func $recoveryLabelKept (param $x i32) (param $y i32) (result i32)
    (local $r i32)
    (block $done
      (if (i32.gt_s (local.get $x) (i32.const 0))
        (then
          (if (i32.gt_s (local.get $y) (i32.const 50))
            (then (br $done)))
          (local.set $r (i32.mul (local.get $x) (local.get $y)))
          (br $done)))
      (local.set $r (i32.add (local.get $x) (local.get $y))))
    (local.get $r)
  )
)
