(module
  (memory 1)

  ;; Single foldable local: local $x starts with (i32.const 42) before any read.
  (func $singleFold (param $p i32) (result i32)
    (local $x i32)
    (local.set $x (i32.const 42))
    (i32.add (local.get $x) (local.get $p))
  )

  ;; Two foldable locals with different init values.
  (func $multiFold (result i32)
    (local $a i32)
    (local $b i32)
    (local.set $a (i32.const 10))
    (local.set $b (i32.const 20))
    (i32.add (local.get $a) (local.get $b))
  )

  ;; No folding: local is read before the const-set.
  (func $noFold (result i32)
    (local $x i32)
    (i32.store (i32.const 0) (local.get $x))
    (local.set $x (i32.const 99))
    (local.get $x)
  )

  ;; Mixed: one zero-value fold (no override) and one non-zero fold.
  (func $mixedFold (result i32)
    (local $a i32)
    (local $b i32)
    (local.set $a (i32.const 0))
    (local.set $b (i32.const 7))
    (i32.add (local.get $a) (local.get $b))
  )

  ;; Zero-only folds: all const-sets are zero, so no overrides produced.
  (func $zeroOnlyFold (result i32)
    (local $x i32)
    (local $y i32)
    (local.set $x (i32.const 0))
    (local.set $y (i32.const 0))
    (i32.add (local.get $x) (local.get $y))
  )
)
