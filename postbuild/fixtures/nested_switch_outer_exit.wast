(module
  (memory 1)
  ;; A br_table case AND its default leave the enclosing dispatch. The
  ;; post-inner +5 must be skipped, while the post-outer +100 must execute.
  (func $nestedSwitchOuterExit (export "nestedSwitchOuterExit")
    (param $outerIndex i32) (param $innerIndex i32) (result i32)
    (local $result i32)
    (local.set $result (i32.const 1))
    (block $outerExit
      (block $outerCaseOne
        (block $outerCaseZero
          (br_table $outerCaseZero $outerCaseOne $outerExit (local.get $outerIndex)))
        (local.set $result (i32.const 10))
        (br $outerExit))
      (block $innerExit
        (block $innerCaseOne
          (block $innerCaseZero
            (br_table $innerCaseZero $innerCaseOne $outerExit $outerExit (local.get $innerIndex)))
          (local.set $result (i32.const 20))
          (br $innerExit))
        (local.set $result (i32.const 30)))
      (local.set $result (i32.add (local.get $result) (i32.const 5))))
    (i32.add (local.get $result) (i32.const 100)))
)
