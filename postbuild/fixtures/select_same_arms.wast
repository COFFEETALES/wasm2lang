(module
  (memory 1)
  (global $trace (mut i32) (i32.const 0))

  ;; The late optimize-instructions pass used to rebuild a nested value
  ;; block: (drop condition), then the common select value.  Emitting that
  ;; block as statements inside a store/call produced invalid host source.
  (func (export "same_select_load") (param $p i32) (result i32)
    (local $value i32)
    (local.set $value (i32.const 4096))
    (i32.store (i32.const 8)
      (select (local.get $value) (local.get $value)
        (i32.load (local.get $p))))
    (i32.load (i32.const 8)))

  ;; Observable digits prove operand order and exactly-once evaluation,
  ;; including the condition whose value cannot affect the select result.
  (func $mark (param $digit i32) (param $value i32) (result i32)
    (global.set $trace
      (i32.add (i32.mul (global.get $trace) (i32.const 10)) (local.get $digit)))
    (local.get $value))

  (func $combine (param $a i32) (param $b i32) (param $c i32) (result i32)
    (i32.add
      (i32.add (i32.mul (local.get $a) (i32.const 100))
        (i32.mul (local.get $b) (i32.const 10)))
      (local.get $c)))

  (func (export "same_select_store") (param $condition i32) (result i32)
    (global.set $trace (i32.const 0))
    (i32.store
      (call $mark (i32.const 1) (i32.const 0))
      (select (i32.const 4096) (i32.const 4096)
        (call $mark (i32.const 2) (local.get $condition))))
    (i32.add (i32.load (i32.const 0))
      (i32.mul (global.get $trace) (i32.const 10000))))

  (func (export "same_select_argument") (param $condition i32) (result i32)
    (local $result i32)
    (global.set $trace (i32.const 0))
    (local.set $result
      (call $combine
        (call $mark (i32.const 1) (i32.const 7))
        (select (i32.const 9) (i32.const 9)
          (call $mark (i32.const 2) (local.get $condition)))
        (call $mark (i32.const 3) (i32.const 11))))
    (i32.add (local.get $result)
      (i32.mul (global.get $trace) (i32.const 10000)))))
