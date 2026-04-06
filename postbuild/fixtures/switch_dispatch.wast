(module
  (memory 1)

  ;; Flat switch dispatch: nested blocks + br_table at innermost level.
  ;; Block $exit should be detected as sw$exit.
  (func $flatSwitch (param $idx i32) (result i32)
    (local $result i32)
    (block $exit
      (block $case2
        (block $case1
          (block $case0
            (br_table $case0 $case1 $case2 $exit (local.get $idx)))
          (local.set $result (i32.const 10))
          (br $exit))
        (local.set $result (i32.const 20))
        (br $exit))
      (local.set $result (i32.const 30)))
    (local.get $result)
  )

  ;; Flat switch dispatch where case action code breaks to the outer
  ;; dispatch block — requiresLabel must be true so the emitted switch
  ;; gets a label that the inner break can resolve against.
  (func $flatSwitchRequiresLabel (param $idx i32) (result i32)
    (local $result i32)
    (block $exit
      (block $case2
        (block $case1
          (block $case0
            (br_table $case0 $case1 $case2 $exit (local.get $idx)))
          ;; case 0: conditional early exit — breaks to $exit (the outer dispatch).
          (if (i32.eq (local.get $idx) (i32.const 99))
            (then (local.set $result (i32.const 77)) (br $exit)))
          (local.set $result (i32.const 10))
          (br $exit))
        (local.set $result (i32.const 20))
        (br $exit))
      (local.set $result (i32.const 30)))
    (local.get $result)
  )

  ;; Root switch: outer blocks wrapping a loop whose body contains a
  ;; switch dispatch followed by unconditional break to an outer block.
  ;; Requires >=2 outer wrapper blocks with exit code (children.length >= 2)
  ;; so the root-switch detection has a valid chain structure.
  ;; $rsOuter should be detected as rs$rsOuter.
  (func $rootSwitch (param $idx i32) (result i32)
    (local $result i32)
    (block $rsOuter
      (block $rsMiddle
        (block $rsInner
          (loop $loop
            (block $sw_exit
              (block $case2
                (block $case1
                  (block $case0
                    (br_table $case0 $case1 $case2 $sw_exit (local.get $idx)))
                  (local.set $result (i32.const 10))
                  (br $sw_exit))
                (local.set $result (i32.const 20))
                (br $sw_exit))
              (local.set $result (i32.const 30)))
            (br $rsOuter)))
        (i32.store (i32.const 0) (i32.const 111)))
      (i32.store (i32.const 0) (i32.const 222)))
    (local.get $result)
  )
)
