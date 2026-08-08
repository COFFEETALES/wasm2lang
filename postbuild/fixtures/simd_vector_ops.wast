(module
  (memory 1 1)

  ;; A direct v128.store(v128.load(...)) — the shape renderStore_ peepholes into
  ;; $w2l_v128_copy.  It is the one v128 helper reachable without any lanewise
  ;; operation, so it is also the only place the Vector API import can be needed
  ;; without a SIMD opcode having been emitted.  Nothing else in the suite marks
  ;; it.
  (func (export "copy")
    (v128.store offset=0 align=1 (i32.const 32) (v128.load offset=0 align=1 (i32.const 0))))

  ;; A helper-routed integer op, so the helper roster is actually emitted and the
  ;; family cannot pass vacuously on an empty module.
  (func (export "arith") (result i32)
    (v128.store offset=0 align=1 (i32.const 48)
      (i8x16.avgr_u (v128.load offset=0 align=1 (i32.const 0))
                    (v128.load offset=0 align=1 (i32.const 16))))
    (i32.load offset=0 align=4 (i32.const 48)))

  ;; bitselect names its mask twice in the (a & c) | (b & ~c) formula, so the
  ;; inline form evaluated a call-valued mask twice.  Both representations must
  ;; route it through a helper.
  (func (export "bitsel") (result i32)
    (v128.store offset=0 align=1 (i32.const 48)
      (v128.bitselect (v128.load offset=0 align=1 (i32.const 0))
                      (v128.load offset=0 align=1 (i32.const 16))
                      (v128.load offset=0 align=1 (i32.const 32))))
    (i32.load offset=0 align=4 (i32.const 48)))

  ;; A genuine BYTE shuffle: the indices are not four 4-byte-aligned groups, so
  ;; an implementation that reads every fourth mask byte and rearranges four
  ;; 32-bit lanes produces the wrong 16 bytes.  The only shuffle fixture that
  ;; existed before used an aligned mask and therefore agreed with that bug.
  (func (export "shuf") (result i32)
    (v128.store offset=0 align=1 (i32.const 48)
      (i8x16.shuffle 31 0 17 2 15 4 13 6 11 8 9 10 7 12 5 14
        (v128.load offset=0 align=1 (i32.const 0))
        (v128.load offset=0 align=1 (i32.const 16))))
    (i32.load offset=0 align=4 (i32.const 48)))

  ;; A float op and a narrowing load, so the float and memory helper families
  ;; are pulled in too.
  (func (export "fl") (result i32)
    (v128.store offset=0 align=1 (i32.const 48)
      (f32x4.min (v128.load offset=0 align=1 (i32.const 0))
                 (v128.load offset=0 align=1 (i32.const 16))))
    (i32.load offset=0 align=4 (i32.const 48)))
  (func (export "ld") (result i32)
    (v128.store offset=0 align=1 (i32.const 48) (v128.load8x8_u offset=0 align=1 (i32.const 0)))
    (i32.load offset=0 align=4 (i32.const 48)))
)
