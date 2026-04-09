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

  ;; Do-while with direct br_if body (no block wrapper).
  ;; After binaryen optimization, loops with a single conditional self-continue
  ;; have the br_if as the direct body without a block wrapper.
  ;; Loop $loop should become le$ with loopKind 'dowhile'.
  (func $doWhileDirectBrIf (param $limit i32) (result i32)
    (local $i i32)
    (loop $loop
      (br_if $loop
        (i32.lt_s
          (local.tee $i (i32.add (local.get $i) (i32.const 1)))
          (local.get $limit))))
    (local.get $i)
  )

  ;; If-guarded while: loop body is an if with no else, then-arm ends with br $loop.
  ;; Produced by binaryen:max optimization. Should become lw$/ly$ with loopKind 'while'.
  (func $ifGuardedWhile (param $limit i32) (result i32)
    (local $i i32)
    (loop $loop
      (if (i32.lt_s (local.get $i) (local.get $limit))
        (then
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $loop))))
    (local.get $i)
  )

  ;; Not a while: loop's exit guard targets $done which is NOT the immediately
  ;; enclosing block ($found wraps the loop).  Should remain as for-loop (lc$/lf$).
  (func $noWhileDistantExit (result i32)
    (local $i i32)
    (local $result i32)
    (block $done
      (block $found
        (loop $loop
          (br_if $done (i32.ge_s (local.get $i) (i32.const 10)))
          (if (i32.eq (local.get $i) (i32.const 5))
            (then (br $found)))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $loop)))
      (local.set $result (local.get $i)))
    (local.get $result)
  )

  ;; Multi-guard while: two consecutive br_if exit guards at the top of the
  ;; loop body, both targeting the immediately enclosing block.  The pass
  ;; must combine them into a single while condition (i32.and of inverted
  ;; guards) and restructure the IR to while-if form.
  ;; Loop $loop should become lw$ or ly$ with loopKind 'while'.
  (func $multiGuardWhile (param $limit i32) (param $threshold i32) (result i32)
    (local $i i32)
    (local $sum i32)
    (block $exit
      (loop $loop
        (br_if $exit (i32.ge_s (local.get $i) (local.get $limit)))
        (br_if $exit (i32.eq (local.get $sum) (local.get $threshold)))
        (local.set $sum (i32.add (local.get $sum) (local.get $i)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)))
    (local.get $sum)
  )

  ;; Terminal-exit loop: last child is unconditional br to outer, body has
  ;; internal continue paths via inner if branches.  Should become for-loop.
  ;; (nop prevents block-loop fusion — block has 2 children, not 1.)
  (func $terminalExitLoop (param $limit i32) (result i32)
    (local $i i32)
    (local $sum i32)
    (block $exit
      (nop)
      (loop $loop
        (if (i32.lt_s (local.get $i) (local.get $limit))
          (then
            (local.set $sum (i32.add (local.get $sum) (local.get $i)))
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $loop)))
        (br $exit)))
    (local.get $sum)
  )
)
