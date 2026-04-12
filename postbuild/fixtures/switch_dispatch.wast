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

  ;; Non-wrapping dispatch: the dispatch outer has trailing children
  ;; (case action code) but is NOT the first child of its parent,
  ;; so the detection pass renames rather than wrapping.  The trailing
  ;; children are case actions, not epilogue.
  (func $nonWrappingDispatch (param $idx i32) (result i32)
    (local $result i32)
    (local.set $result (i32.const 100))
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

  ;; Wrapping dispatch with epilogue: the dispatch outer IS the first child
  ;; of the loop body with trailing siblings.  The detection pass wraps the
  ;; dispatch + epilogue into a new sw$-prefixed block.  Epilogue breaks
  ;; must target the outer exit block with correct depth.
  (func $wrappingDispatchEpilogue (param $idx i32) (param $state i32) (result i32)
    (local $result i32)
    (block $completed
      (loop $loop
        (block $stateTwo
          (block $stateOne
            (block $stateZero
              (br_table $stateZero $stateOne $stateTwo $completed
                (local.get $state)))
            (local.set $idx (i32.mul (local.get $idx) (i32.const 2)))
            (local.set $state (i32.const 1))
            (br $loop))
          (local.set $idx (i32.sub (local.get $idx) (i32.const 1)))
          (local.set $state (i32.const 2))
          (br $loop))
        ;; epilogue: runs when stateTwo falls through
        (if (i32.gt_s (local.get $idx) (i32.const 50))
          (then
            (local.set $result (i32.const -1))
            (br $completed)))
        (local.set $idx (i32.add (local.get $idx) (i32.const 25)))
        (local.set $state (i32.const 0))
        (br $loop)))
    (if (i32.eqz (local.get $result))
      (then (local.set $result (local.get $idx))))
    (local.get $result)
  )

  ;; Terminator-ended dispatch: intermediate blocks end with return
  ;; (not unconditional break).  All case actions are terminal, so no
  ;; synthetic fall-through breaks are needed — the detection pass must
  ;; accept return/unreachable as valid chain terminators.
  (func $terminatorDispatch (param $a i32) (param $b i32) (param $op i32) (result i32)
    (block $default
      (block $mod
        (block $div
          (block $mul
            (block $sub
              (block $add
                (br_table $add $sub $mul $div $mod $default (local.get $op)))
              (return (i32.add (local.get $a) (local.get $b))))
            (return (i32.sub (local.get $a) (local.get $b))))
          (return (i32.mul (local.get $a) (local.get $b))))
        (return (i32.div_s (local.get $a) (local.get $b))))
      (return (i32.rem_s (local.get $a) (local.get $b))))
    (i32.const 0)
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
