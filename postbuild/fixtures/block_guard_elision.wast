(module
  (memory 1)

  ;; Leading br_if guard, no remaining refs → label removed.
  (func $guardSimple (param $x i32) (result i32)
    (local $r i32)
    (block $done
      (br_if $done (i32.le_s (local.get $x) (i32.const 0)))
      (local.set $r (local.get $x)))
    (local.get $r)
  )

  ;; Leading br_if guard with multiple remaining children → label removed.
  (func $guardMultiBody (param $x i32) (result i32)
    (local $r i32)
    (block $done
      (br_if $done (i32.eqz (local.get $x)))
      (local.set $r (i32.mul (local.get $x) (i32.const 2)))
      (local.set $r (i32.add (local.get $r) (i32.const 1))))
    (local.get $r)
  )

  ;; Leading br_if guard with remaining ref to block → label kept.
  (func $guardKeptLabel (param $x i32) (param $y i32) (result i32)
    (local $r i32)
    (block $done
      (br_if $done (i32.le_s (local.get $x) (i32.const 0)))
      (local.set $r (local.get $x))
      (br_if $done (i32.gt_s (local.get $y) (i32.const 50)))
      (local.set $r (i32.mul (local.get $x) (local.get $y))))
    (local.get $r)
  )

  ;; First child is If, not br_if → no guard elision.
  (func $noGuard (param $x i32) (result i32)
    (local $r i32)
    (block $done
      (if (i32.gt_s (local.get $x) (i32.const 0))
        (then
          (local.set $r (local.get $x))
          (br $done)))
      (local.set $r (i32.sub (i32.const 0) (local.get $x))))
    (local.get $r)
  )

  ;; Unconditional br (not br_if) → no guard elision.
  (func $noGuardUnconditional (param $x i32) (result i32)
    (block $done
      (br $done)
      (local.set $x (i32.const 99)))
    (local.get $x)
  )
)
