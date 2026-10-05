(module
  (func (export "common_suffix") (param $kind i32) (param $skip i32) (result i32)
    (local $r i32)
    (local.set $r (i32.const 1))
    (block $done
      (block $shared
        (block $legacy
          (block $birth
            (br_table $birth $legacy $shared (local.get $kind)))
          (br_if $shared (local.get $skip))
          (local.set $r (i32.const 10))
          (br $done))
        (local.set $r (i32.const 20))
        (br_if $shared (local.get $skip))
        (br $done))
      (local.set $r (i32.add (local.get $r) (i32.const 100))))
    (local.get $r)))
