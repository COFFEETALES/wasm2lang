'use strict';

// ---------------------------------------------------------------------------
// Trap-kind contract shared by every backend and by the host.
//
// A wasm trap is a cold, unrecoverable abort.  Before `--trap-sites`, every
// trap funnelled into one argument-less signal per backend ($w2l_trap() for
// the JS family, a bare `throw` for java/csharp/php64), so a host could not
// tell an `unreachable` apart from a division by zero, nor say WHERE in the
// module it happened — fatal in a mangled release build where the stack names
// nothing.
//
// The numbers below are a FROZEN wire contract: the host decodes them, and a
// generated module may outlive the transpiler that produced it.  Never
// renumber an existing kind; only append.  The value 0 is reserved so a
// zero-initialized field never reads as a valid kind.
//
// Not every kind has an emit site in every backend — the enum is the complete
// contract, `Wasm2Lang.Backend.TrapKind.isEmitted` reports what a given build
// can actually raise.  See the table in CLAUDE.md.
// ---------------------------------------------------------------------------

/**
 * Stable trap classification passed to the host hook as the first argument.
 *
 * @enum {number}
 */
Wasm2Lang.Backend.TrapKind = {
  /** Reserved: never emitted; guards against a zero-initialized field. */
  NONE: 0,
  /** wasm `unreachable` — `__builtin_trap`, a panic, an exhaustive-switch default. */
  UNREACHABLE: 1,
  /** `i32.div_s` / `i64.div_s` with a zero divisor. */
  DIV_S_ZERO: 2,
  /** `i32.div_u` / `i64.div_u` with a zero divisor. */
  DIV_U_ZERO: 3,
  /** `i32.rem_s` / `i64.rem_s` with a zero divisor. */
  REM_S_ZERO: 4,
  /** `i32.rem_u` / `i64.rem_u` with a zero divisor. */
  REM_U_ZERO: 5,
  /** `div_s` of INT_MIN by -1 — the quotient is not representable. */
  DIV_S_OVERFLOW: 6,
  /** Non-saturating float->int truncation of NaN, +/-Infinity, or an out-of-range value. */
  TRUNC_F2I_RANGE: 7,
  /** `call_indirect` through an empty table slot or a signature mismatch. */
  INDIRECT_SIGNATURE: 8,
  /** Linear-memory access outside the allocated heap. */
  MEMORY_OOB: 9
};

/**
 * Highest kind value defined above.  A site table is rejected by the
 * self-check in {@code describeKind} when a kind exceeds it.
 *
 * @const {number}
 */
Wasm2Lang.Backend.TRAP_KIND_MAX = 9;

/**
 * Wire names for every kind, indexed by the numeric value.  Emitted into the
 * `kinds` map of the site table so the artifact is self-describing and a host
 * never has to hard-code the numbering.  Quoted keys so ADVANCED_OPTIMIZATIONS
 * cannot rename them.
 *
 * @const {!Array<string>}
 */
Wasm2Lang.Backend.TRAP_KIND_NAMES = [
  'none',
  'unreachable',
  'div_s_zero',
  'div_u_zero',
  'rem_s_zero',
  'rem_u_zero',
  'div_s_overflow',
  'trunc_f2i_range',
  'indirect_signature',
  'memory_oob'
];

/**
 * Returns the wire name of a kind, or {@code 'invalid'} when the value is not
 * a defined kind.  Never throws — a diagnostic artifact must not be able to
 * abort a build.
 *
 * @param {number} kind
 * @return {string}
 */
Wasm2Lang.Backend.describeTrapKind = function (kind) {
  if (kind < 0 || kind > Wasm2Lang.Backend.TRAP_KIND_MAX || kind !== (kind | 0)) {
    return 'invalid';
  }
  return Wasm2Lang.Backend.TRAP_KIND_NAMES[kind];
};

/**
 * One row of the emitted `<out-file>.traps.json` site table.
 *
 * `funcIndex` is the DEFINED-function ordinal (the index into the emitted
 * function sequence), not the raw wasm function index: `AnchorMarkers.stripAll`
 * removes the anchor import before emission, which shifts every raw index.
 *
 * `funcName` is present only when the module carried a real name section.
 * Binaryen synthesizes decimal names (`"0"`, `"12"`) and `$fimport$N` when it
 * does not, and offers no API to ask which is which — so a name matching
 * either shape is omitted rather than invented.
 *
 * `helper` replaces `funcIndex`/`funcName` for the trap sites that live inside
 * a shared runtime helper body ($w2l_trunc_*, $w2l_div_*): those are emitted
 * once per module from a static template and belong to no wasm function.
 *
 * There is deliberately NO `instrOffset`: binaryen's JS API exposes
 * `setDebugLocation` but no reader, and the pipeline (optimizer passes, the
 * internal binary round-trip, anchor stripping) destroys any correspondence to
 * the input binary anyway.  `ordinal` — the trap site's rank within its
 * function or helper — is the honest substitute.
 *
 * @typedef {{
 *   id: number,
 *   kind: number,
 *   funcIndex: number,
 *   funcName: ?string,
 *   helper: ?string,
 *   ordinal: number
 * }}
 */
Wasm2Lang.Backend.TrapSite;
