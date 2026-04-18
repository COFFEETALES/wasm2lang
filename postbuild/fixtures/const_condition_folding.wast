(module
  (memory 1)

  ;; i32.eqz on a constant zero → folds to (i32.const 1).
  (func $eqzZero (result i32)
    (i32.eqz (i32.const 0))
  )

  ;; i32.eqz on a non-zero constant → folds to (i32.const 0).
  (func $eqzNonZero (result i32)
    (i32.eqz (i32.const 42))
  )

  ;; i64.eqz on a constant zero → folds to (i32.const 1).
  (func $eqzZeroI64 (result i32)
    (i64.eqz (i64.const 0))
  )

  ;; Two i32.eqz folds in one function plus an unrelated expression — the
  ;; metric must reach 2 and the downstream expression must be preserved.
  (func $eqzMulti (param $x i32) (result i32)
    (i32.add
      (i32.eqz (i32.const 0))
      (i32.add (i32.eqz (i32.const 7)) (local.get $x))
    )
  )

  ;; br_if (valueless) with always-false constant condition → rewritten to nop.
  (func $brIfNever (result i32)
    (local $x i32)
    (block $exit
      (br_if $exit (i32.const 0))
      (local.set $x (i32.const 99))
    )
    (local.get $x)
  )

  ;; br_if (valueless) with always-true constant condition → rewritten to
  ;; an unconditional br.
  (func $brIfAlways (result i32)
    (local $x i32)
    (block $exit
      (br_if $exit (i32.const 1))
      (local.set $x (i32.const 99))
    )
    (local.get $x)
  )

  ;; select with const-zero condition and side-effect-free arms → keeps ifFalse.
  (func $selectZero (param $x i32) (result i32)
    (select (i32.const 11) (local.get $x) (i32.const 0))
  )

  ;; select with const-nonzero condition and side-effect-free arms → keeps ifTrue.
  (func $selectOne (param $x i32) (result i32)
    (select (local.get $x) (i32.const 22) (i32.const 1))
  )

  ;; select whose dropped side has a side effect (call) must NOT fold.
  (func $sideEffect (result i32) (call $sideEffect))
  (func $selectBlocked (result i32)
    (select (call $sideEffect) (i32.const 0) (i32.const 0))
  )

  ;; No-op control: no constant conditions anywhere — metric must stay null.
  (func $noFold (param $x i32) (result i32)
    (i32.eqz (local.get $x))
  )
)
