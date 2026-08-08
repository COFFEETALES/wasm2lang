;; A module that uses SIMD but contains NO SIMDBinary and NO SIMDUnary op.
;;
;; That combination is the one the old per-renderer refusal missed entirely:
;; only the arithmetic ops routed through refuseSIMDOp_, so a module of pure
;; v128 data movement — swizzle, a v128 param, a v128 store, v128 constants —
;; emitted a complete, syntactically valid artifact with the SIMD silently
;; dropped.  Measured on asm.js 2026-08-03 from exactly this module: exit 0, and
;; the emitted call site passed the 16 mask bytes as 16 arguments to a
;; one-parameter function while calling a store helper nothing defined.
;;
;; It is also the reason the fixture keeps an align=1 v128.store: the asm.js
;; memory path computes a helper name from the access width, so an unaligned
;; v128 store is what fabricates a helper that has no body.
(module
  (memory 1 1)
  (func $w0 (param $v v128) (result i32)
    (v128.store offset=0 align=1 (i32.const 256) (local.get $v))
    (i32.load offset=0 align=4 (i32.const 256)))
  (func $w3 (param $v v128) (result i32)
    (v128.store offset=0 align=1 (i32.const 256) (local.get $v))
    (i32.load offset=12 align=4 (i32.const 256)))
  ;; Index lane 0 is 20 (>= 16) so wasm must yield 0 there, and lane 1 is 0xFF
  ;; so a signed byte read of the index would go negative instead of out of range.
  (func (export "swz_lo") (result i32)
    (call $w0 (i8x16.swizzle
      (v128.const i8x16 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25)
      (v128.const i8x16 20 0xff 3 2 1 0 5 4 7 6 9 8 11 10 13 12))))
  (func (export "swz_hi") (result i32)
    (call $w3 (i8x16.swizzle
      (v128.const i8x16 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25)
      (v128.const i8x16 20 0xff 3 2 1 0 5 4 7 6 9 8 11 10 13 12))))
)
