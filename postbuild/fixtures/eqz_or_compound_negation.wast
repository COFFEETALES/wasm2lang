;; Regression fixture for the quic.js AES-GCM decryption failure.
;;
;; `(if (i32.eqz (i32.or (cmp) (cmp))) ...)` is the reduced form that
;; binaryen:max produces when it folds two consecutive br_if exit guards
;; into a single OR and wraps them in an eqz for inversion.
;;
;; The backend emitter must negate the compound condition via a full
;; `!(...)` wrapper or a De Morgan swap — a partial operator flip like
;; `v != X | v == Y` is semantically wrong and was the cause of every
;; QUIC packet's version check returning "unsupported".
(module
  (memory $mem 1)
  (export "mem" (memory $mem))
  (func (export "versionGate") (param $version i32) (result i32)
    (if (i32.eqz (i32.or
          (i32.eq (local.get $version) (i32.const 1))
          (i32.eq (local.get $version) (i32.const 1798521807))))
        (then (return (i32.const -1))))
    (i32.const 1))
)
