(module
  (memory 1)

  ;; Trailing self-continue → for(;;) pattern.
  ;; Loop $loop should become lf$ or lc$ with loopKind 'for'.
  (func $forLoop (result i32)
    (local $i i32)
    (block $exit
      (loop $loop
        (br_if $exit (i32.ge_s (local.get $i) (i32.const 10)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)))
    (local.get $i)
  )

  ;; Do-while variant B: conditional continue at end.
  ;; Loop $loop should become ld$ or le$ with loopKind 'dowhile'.
  (func $doWhileLoop (result i32)
    (local $i i32)
    (loop $loop
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $loop (i32.lt_s (local.get $i) (i32.const 10))))
    (local.get $i)
  )

  ;; While pattern: entry guard + trailing self-continue.
  ;; Loop $loop should become lw$ or ly$ with loopKind 'while'.
  (func $whileLoop (param $limit i32) (result i32)
    (local $i i32)
    (block $exit
      (loop $loop
        (br_if $exit (i32.ge_s (local.get $i) (local.get $limit)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)))
    (local.get $i)
  )
)
