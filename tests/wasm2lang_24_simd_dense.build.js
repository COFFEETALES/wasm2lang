'use strict';

// Dense SIMD128 reference module.
//
// The repository had no SIMD-bearing reference module at all: quic contains
// zero v128 instructions, so every SIMD claim rested on fixtures of a few
// dozen functions.  Worse, those fixtures were written from a hand-kept list
// of opcodes, and a hand-kept list is exactly how the whole load/store family
// stayed wrong and untested for as long as it did — and how four f64x2<->i32x4
// conversions stayed *refused* until 2026-08-02.
//
// So the op list here is NOT written out.  It is read from binaryen's own
// builder namespaces (`Object.keys(module.i8x16)` and friends) and every name
// found must be reached by a fixture below or named in SKIP_ with a reason;
// anything else fails this build.  When binaryen grows an opcode, this test
// stops the build instead of silently not covering it.
//
// Two rules govern the values, both learned by measuring rather than reasoning:
//
//   - Operands come from MEMORY, never from v128.const.  Under binaryen:max a
//     const-only operation is folded away entirely and the "test" passes
//     without the backend ever seeing the opcode.
//   - Lanes differ from each other, the low half differs from the high half,
//     and high bits are set, so a signed reading and an unsigned reading of the
//     same lane disagree.  Otherwise a half-ignoring or sign-ignoring
//     implementation passes by coincidence.
//
// No NaN reaches an arithmetic operand.  wasm leaves the PAYLOAD of a generated
// NaN unspecified, so comparing result bits between the V8 oracle and the
// emitted code would be comparing something the spec does not fix.  NaN appears
// only where the result is defined: trunc_sat (NaN maps to 0) and comparisons.
// The NaN-propagation shapes that do have defined results — pmin/pmax picking an
// operand — are covered by wasm2lang_21_simd_lanes.

(async function () {
  const common = require('./build_common');
  const binaryen = await common.loadBinaryen();
  const {module} = common.createTestModule(binaryen, {memoryPages: 8, heapBase: 1024});
  module.setFeatures(binaryen.Features.MVP | binaryen.Features.SIMD128);

  // ---- memory map (all below heapBase, so nothing collides with the heap) ---
  const R = 0; // 16-byte result scratch
  const SC = 16; // 16-byte secondary scratch (store / store*_lane targets)
  const VA = 32; // integer vector A
  const VB = 48; // integer vector B
  const VC = 64; // mask vector
  const FA = 80; // f32x4 A
  const FB = 96; // f32x4 B
  const FP = 112; // f32x4, all lanes >= 0 (sqrt)
  const DA = 128; // f64x2 A
  const DB = 144; // f64x2 B
  const DP = 160; // f64x2, both lanes >= 0 (sqrt)
  const BS = 176; // 16 raw bytes read by the load family
  const SI = 192; // i32 scalar
  const SL = 200; // i64 scalar
  const SF = 208; // f32 scalar
  const SD = 216; // f64 scalar
  const SH = 224; // shift count, i32 — loaded, so it is NOT a constant
  const LP = 256; // 64-byte loop area
  const NA = 320; // f32x4 carrying NaN and +0 / -0
  const NB = 336; // f32x4 carrying the matching NaN and -0 / +0

  const c = n => module.i32.const(n);
  const bytes = (...b) => {
    const a = new Array(16).fill(0);
    b.forEach((x, i) => (a[i] = x & 0xff));
    return a;
  };
  const f32v = (...w) => {
    const a = new Array(16).fill(0);
    const dv = new DataView(new ArrayBuffer(16));
    w.forEach((x, i) => dv.setFloat32(i * 4, x, true));
    for (let i = 0; i < 16; i++) a[i] = dv.getUint8(i);
    return a;
  };
  const f64v = (...w) => {
    const a = new Array(16).fill(0);
    const dv = new DataView(new ArrayBuffer(16));
    w.forEach((x, i) => dv.setFloat64(i * 8, x, true));
    for (let i = 0; i < 16; i++) a[i] = dv.getUint8(i);
    return a;
  };

  // High bits set in several lanes, adjacent lanes distinct, halves distinct.
  const SEED_VECTORS = [
    [VA, bytes(0x81, 0x02, 0xff, 0x7f, 0x10, 0x20, 0x30, 0x40, 0x05, 0x86, 0x07, 0x08, 0x99, 0x0a, 0x0b, 0x8c)],
    [VB, bytes(0xfe, 0x03, 0x02, 0x7f, 0x02, 0x92, 0x02, 0x02, 0x11, 0x12, 0x13, 0x94, 0x15, 0x16, 0x17, 0x18)],
    [VC, bytes(0x0f, 0xf0, 0x33, 0xcc, 0x55, 0xaa, 0x00, 0xff, 0x12, 0x34, 0x56, 0x78, 0x87, 0x65, 0x43, 0x21)],
    // 1e20 overflows i32 in both directions, which is what trunc_sat exists for.
    [FA, f32v(-2.5, 3.75, -0.5, 1e20)],
    [FB, f32v(4.25, -1.5, 2.0, -3.0)],
    [FP, f32v(2.25, 6.25, 0.5, 1e10)],
    [DA, f64v(-3.75, 1e20)],
    [DB, f64v(2.5, -0.5)],
    [DP, f64v(2.25, 1e10)],
    [BS, bytes(0x81, 0x02, 0xff, 0x7f, 0x10, 0x20, 0x30, 0x40, 0xf5, 0x86, 0x07, 0x08, 0x99, 0x0a, 0x0b, 0x8c)],
    // The two places wasm's f32x4.min/max differ from a naive implementation:
    // a NaN operand, and a (+0, -0) pair in both orders.
    [NA, f32v(NaN, 1.0, 0.0, -0.0)],
    [NB, f32v(2.0, NaN, -0.0, 0.0)]
  ];

  const seedBody = [];
  for (const [addr, b] of SEED_VECTORS) seedBody.push(module.v128.store(0, 1, c(addr), module.v128.const(b)));
  seedBody.push(module.i32.store(0, 4, c(SI), c(0x8000f00d)));
  seedBody.push(module.i64.store(0, 8, c(SL), module.i64.const(common.i64c(0x0badf00d, 0x8000000f))));
  seedBody.push(module.f32.store(0, 4, c(SF), module.f32.const(-2.75)));
  seedBody.push(module.f64.store(0, 8, c(SD), module.f64.const(-2.75)));
  // Neither 0 nor a multiple of any lane width, so the modulo wasm applies to a
  // shift count is visible at every width: 8-bit lanes see 5, 64-bit lanes 37.
  seedBody.push(module.i32.store(0, 4, c(SH), c(37)));
  seedBody.push(
    module.v128.store(0, 1, c(LP), module.v128.const(bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)))
  );
  module.addFunction('seed', binaryen.none, binaryen.none, [], module.block(null, seedBody, binaryen.none));

  const va = () => module.v128.load(0, 1, c(VA));
  const vb = () => module.v128.load(0, 1, c(VB));
  const vc = () => module.v128.load(0, 1, c(VC));
  const fa = () => module.v128.load(0, 1, c(FA));
  const fb = () => module.v128.load(0, 1, c(FB));
  const fp = () => module.v128.load(0, 1, c(FP));
  const da = () => module.v128.load(0, 1, c(DA));
  const db = () => module.v128.load(0, 1, c(DB));
  const dp = () => module.v128.load(0, 1, c(DP));
  const shiftCount = () => module.i32.load(0, 4, c(SH));

  // Scalar operands for splat / replace_lane, all loaded rather than constant.
  const scalarOf = {
    i8x16: () => module.i32.load(0, 4, c(SI)),
    i16x8: () => module.i32.load(0, 4, c(SI)),
    i32x4: () => module.i32.load(0, 4, c(SI)),
    i64x2: () => module.i64.load(0, 8, c(SL)),
    f32x4: () => module.f32.load(0, 4, c(SF)),
    f64x2: () => module.f64.load(0, 8, c(SD))
  };
  // The result kind of extract_lane, and the scalar kind splat/replace consume.
  const laneKind = {i8x16: 'i32', i16x8: 'i32', i32x4: 'i32', i64x2: 'i64', f32x4: 'f32', f64x2: 'f64'};
  // A lane index that is neither 0 nor the last, so an off-by-one or a
  // fixed-32-bit-lane implementation lands somewhere else.
  const laneIndex = {i8x16: 13, i16x8: 5, i32x4: 3, i64x2: 1, f32x4: 2, f64x2: 1};
  // Which operand vector an op should read: the float namespaces need float bits.
  const lhsOf = ns => (ns === 'f32x4' ? fa : ns === 'f64x2' ? da : va);
  const rhsOf = ns => (ns === 'f32x4' ? fb : ns === 'f64x2' ? db : vb);

  const exportNames = [];
  const fn = (name, body) => {
    const full = 't_' + name;
    module.addFunction(full, binaryen.none, binaryen.i32, [], body);
    module.addFunctionExport(full, full);
    exportNames.push(full);
  };
  // Every test re-seeds first: the functions run in whatever order the harness
  // chooses, and one that mutated memory must not change the next one's inputs.
  //
  // ONE flat block, never a value-typed block nested inside another.  The
  // `baseline` variant runs no normalization at all, and on un-normalized IR the
  // Java backend emits the inner block's value as a bare statement with no
  // `return` — measured, javac rejects it outright.  binaryen:min and :max both
  // flatten the shape first, which is exactly why nesting it would fail in one
  // variant out of twelve.  wasm2lang_21/22 carry the same note.
  const testFn = (name, statements, valueExpr) =>
    fn(name, module.block(null, [module.call('seed', [], binaryen.none)].concat(statements, [valueExpr]), binaryen.i32));

  // A v128-valued expression is stored and read back one 32-bit word at a time.
  // All four words, not just the first: a wrong high half is the single most
  // common way a lane-geometry bug hides.
  const emitV128 = (name, buildExpr) => {
    for (let k = 0; k < 4; k++) {
      testFn(name + '_w' + k, [module.v128.store(0, 1, c(R), buildExpr())], module.i32.load(k * 4, 4, c(R)));
    }
  };
  const emitScalar = (name, kind, buildExpr) => {
    if (kind === 'i32') {
      testFn(name, [], buildExpr());
      return;
    }
    if (kind === 'f32') {
      testFn(name, [], module.i32.reinterpret(buildExpr()));
      return;
    }
    const asI64 = kind === 'f64' ? () => module.i64.reinterpret(buildExpr()) : buildExpr;
    testFn(name + '_lo', [], module.i32.wrap(asI64()));
    testFn(name + '_hi', [], module.i32.wrap(module.i64.shr_u(asI64(), module.i64.const(common.i64c(32, 0)))));
  };
  // A memory-writing op (v128.store, store*_lane): run it, then read what landed.
  const emitMem = (name, buildStmt, words) => {
    for (let k = 0; k < words; k++) {
      testFn(name + '_w' + k, [buildStmt()], module.i32.load(SC - R + k * 4, 4, c(R)));
    }
  };

  // ---- coverage bookkeeping -------------------------------------------------
  const NAMESPACES = ['v128', 'i8x16', 'i16x8', 'i32x4', 'i64x2', 'f32x4', 'f64x2'];
  const covered = Object.create(null);
  const mark = key => (covered[key] = true);
  // Named, with the reason, rather than silently absent.
  const SKIP_ = {
    'v128.pop': 'stack pseudo-op — a module built through the builder API never contains one'
  };

  // ---- the generated body ---------------------------------------------------
  //
  // Shapes are resolved from the enumerated NAME and ARITY, not from a list of
  // ops.  An op whose shape is not recognized falls through to the coverage
  // assertion at the bottom and fails the build there, by name.
  const SCALAR_RESULT_OPS = {any_true: 'i32', all_true: 'i32', bitmask: 'i32'};
  const SHIFT_OPS = {shl: true, shr_s: true, shr_u: true};
  // Ops whose operand must be non-negative because their result would otherwise
  // be a NaN, whose payload wasm leaves unspecified.
  const NEEDS_NONNEGATIVE = {sqrt: true};

  for (const ns of NAMESPACES) {
    const namespaceObject = module[ns];
    for (const opName of Object.keys(namespaceObject).sort()) {
      const key = ns + '.' + opName;
      if (key in SKIP_) continue;
      const arity = typeof namespaceObject[opName] === 'function' ? namespaceObject[opName].length : -1;
      const call = (...args) => namespaceObject[opName].apply(namespaceObject, args);
      const testName = ns + '_' + opName;

      if (ns === 'v128') {
        if (opName === 'const') {
          // Exercised by seed above, and by every operand vector it writes.
          mark(key);
          continue;
        }
        if (opName === 'load') {
          emitV128(testName, () => call(0, 1, c(BS)));
          emitV128(testName + '_off', () => call(8, 1, c(BS - 8)));
          mark(key);
          continue;
        }
        if (opName === 'store') {
          emitMem(testName, () => call(0, 1, c(SC), va()), 4);
          mark(key);
          continue;
        }
        if (/^(load|store)\d+_lane$/.test(opName)) {
          // The lane index is an immediate; picking the width's own middle lane
          // catches an implementation that indexes at a fixed 32-bit width.
          const width = Number(/(\d+)_lane$/.exec(opName)[1]);
          const idx = {8: 13, 16: 5, 32: 3, 64: 1}[width];
          if (opName.charAt(0) === 'l') {
            emitV128(testName, () => call(0, 1, idx, c(BS), vb()));
            mark(key);
          } else {
            emitMem(testName, () => call(0, 1, idx, c(SC), va()), 4);
            mark(key);
          }
          continue;
        }
        if (opName.indexOf('load') === 0) {
          // load*_splat, load*x*_s/_u, load*_zero: all (offset, align, ptr).
          emitV128(testName, () => call(0, 1, c(BS)));
          mark(key);
          continue;
        }
        if (opName === 'bitselect') {
          emitV128(testName, () => call(va(), vb(), vc()));
          mark(key);
          continue;
        }
        if (opName === 'any_true') {
          emitScalar(testName, 'i32', () => call(va()));
          emitScalar(testName + '_zero', 'i32', () => call(module.v128.load(0, 1, c(R))));
          mark(key);
          continue;
        }
        if (arity === 1) {
          emitV128(testName, () => call(va()));
          mark(key);
          continue;
        }
        if (arity === 2) {
          emitV128(testName, () => call(va(), vb()));
          mark(key);
          continue;
        }
        continue; // unrecognized: reported by the assertion below
      }

      const L = lhsOf(ns);
      const Rh = rhsOf(ns);

      if (opName === 'splat') {
        emitV128(testName, () => call(scalarOf[ns]()));
        mark(key);
        continue;
      }
      if (opName === 'replace_lane') {
        emitV128(testName, () => call(L(), laneIndex[ns], scalarOf[ns]()));
        mark(key);
        continue;
      }
      if (opName.indexOf('extract_lane') === 0) {
        emitScalar(testName, laneKind[ns], () => call(L(), laneIndex[ns]));
        emitScalar(testName + '_0', laneKind[ns], () => call(L(), 0));
        mark(key);
        continue;
      }
      if (SHIFT_OPS[opName]) {
        // A loaded count exercises the runtime modulo; a constant count
        // exercises the folded form, which is a different code path in every
        // backend that special-cases a constant shift.
        emitV128(testName, () => call(L(), shiftCount()));
        emitV128(testName + '_k', () => call(L(), c(3)));
        mark(key);
        continue;
      }
      if (opName === 'shuffle') {
        // Crosses both operands, is not the identity, and repeats a byte.
        emitV128(testName, () => call(L(), Rh(), [31, 0, 17, 2, 15, 4, 13, 6, 11, 8, 9, 10, 7, 12, 5, 14]));
        mark(key);
        continue;
      }
      if (SCALAR_RESULT_OPS[opName]) {
        emitScalar(testName, 'i32', () => call(L()));
        // all_true over a vector with a zero lane, and bitmask over one with a
        // different sign pattern, so neither reads as "all lanes alike".
        emitScalar(testName + '_b', 'i32', () => call(vc()));
        mark(key);
        continue;
      }
      if (arity === 1) {
        const operand = NEEDS_NONNEGATIVE[opName] ? (ns === 'f64x2' ? dp : fp) : L;
        emitV128(testName, () => call(operand()));
        mark(key);
        continue;
      }
      if (arity === 2) {
        emitV128(testName, () => call(L(), Rh()));
        mark(key);
        continue;
      }
    }
  }

  // ---- chained operations ---------------------------------------------------
  //
  // Isolated ops leave the operand-plumbing untested: a backend that spills a
  // v128 into a temporary of the wrong type, or reinterprets one view too many
  // between two ops, still passes every single-op fixture.  These nest four to
  // six deep, mixing lane geometries so a missing reinterpret shows up.
  emitV128('chain_i64', () => module.i64x2.add(module.i64x2.extmul_low_i32x4_s(va(), vb()), module.i64x2.mul(va(), vc())));
  emitV128('chain_int', () =>
    module.i32x4.add(
      module.i16x8.extmul_low_i8x16_s(module.i8x16.avgr_u(va(), vb()), module.v128.bitselect(va(), vb(), vc())),
      module.i32x4.dot_i16x8_s(module.i16x8.add(va(), vb()), module.i16x8.sub(vc(), va()))
    )
  );
  emitV128('chain_narrow', () =>
    module.i8x16.narrow_i16x8_s(
      module.i16x8.add_saturate_s(module.i16x8.extend_low_i8x16_s(va()), module.i16x8.extend_high_i8x16_u(vb())),
      module.i16x8.q15mulr_sat_s(module.i16x8.shl(vc(), shiftCount()), module.i16x8.extadd_pairwise_i8x16_s(va()))
    )
  );
  emitV128('chain_float', () =>
    module.i32x4.trunc_sat_f32x4_s(
      module.f32x4.mul(
        module.f32x4.add(module.f32x4.convert_i32x4_s(va()), module.f32x4.demote_f64x2_zero(module.f64x2.sqrt(dp()))),
        module.f32x4.pmin(fa(), fb())
      )
    )
  );
  emitV128('chain_cmp', () =>
    module.v128.and(
      module.v128.bitselect(module.i8x16.eq(va(), vb()), module.i16x8.lt_u(va(), vc()), module.i32x4.gt_s(vb(), vc())),
      module.v128.not(module.f32x4.le(fa(), fb()))
    )
  );
  emitV128('chain_swizzle', () =>
    module.i8x16.swizzle(
      module.i8x16.shuffle(va(), vb(), [16, 1, 18, 3, 20, 5, 22, 7, 24, 9, 26, 11, 28, 13, 30, 15]),
      module.i8x16.min_u(vc(), module.i8x16.splat(c(18)))
    )
  );

  // ---- a loop over v128 locals ---------------------------------------------
  //
  // The only shape here that carries a v128 across a branch.  A backend that
  // declares a v128 local with the wrong type, or that fails to copy rather
  // than alias the carrier on assignment, is correct in every straight-line
  // fixture above and wrong here.
  const ACC = 0; // local 0: v128 accumulator
  const IX = 1; // local 1: i32 counter
  module.addFunction(
    'simd_loop',
    binaryen.none,
    binaryen.v128,
    [binaryen.v128, binaryen.i32],
    module.block(
      null,
      [
        module.local.set(ACC, module.v128.load(0, 1, c(LP))),
        module.local.set(IX, c(0)),
        module.loop(
          'lp',
          module.block(null, [
            module.local.set(
              ACC,
              module.i32x4.add(
                module.i8x16.swizzle(module.local.get(ACC, binaryen.v128), vc()),
                module.i16x8.mul(module.local.get(ACC, binaryen.v128), vb())
              )
            ),
            module.local.set(IX, module.i32.add(module.local.get(IX, binaryen.i32), c(1))),
            module.br_if('lp', module.i32.lt_s(module.local.get(IX, binaryen.i32), c(7)))
          ])
        ),
        module.local.get(ACC, binaryen.v128)
      ],
      binaryen.v128
    )
  );
  emitV128('loop', () => module.call('simd_loop', [], binaryen.v128));

  // ---- v128 across the call boundary ---------------------------------------
  //
  // A v128 parameter and a v128 return value are a different plumbing path from
  // a v128 temporary, and nothing else in the suite crosses a call with one.
  module.addFunction(
    'v128_id',
    binaryen.createType([binaryen.v128, binaryen.v128]),
    binaryen.v128,
    [],
    module.i16x8.sub(module.local.get(0, binaryen.v128), module.local.get(1, binaryen.v128))
  );
  emitV128('call_v128', () => module.call('v128_id', [va(), vb()], binaryen.v128));
  emitV128('call_v128_nested', () =>
    module.call('v128_id', [module.call('v128_id', [va(), vc()], binaryen.v128), vb()], binaryen.v128)
  );

  // ---- f32x4 min/max: NaN and signed zero ----------------------------------
  //
  // The generated fixtures above use finite, distinct operands, so a min/max
  // that resolves NaN or (+0,-0) the wrong way passes every one of them.  Those
  // are exactly the two places a plausible implementation is wrong, and one of
  // the two available .NET methods (MinNative) IS wrong on both — measured.
  //
  // The result of min(NaN, x) is "a NaN" whose payload wasm does not fix, so
  // nothing here compares result bits in those lanes.  It compares NaN-NESS,
  // via ne(v, v), which is all-ones exactly for a NaN lane and is fully
  // specified; and it compares the ±0 lanes' bits, which are.
  const na = () => module.v128.load(0, 1, c(NA));
  const nb = () => module.v128.load(0, 1, c(NB));
  for (const [opName, build] of [
    ['min', () => module.f32x4.min(na(), nb())],
    ['max', () => module.f32x4.max(na(), nb())],
    ['pmin', () => module.f32x4.pmin(na(), nb())],
    ['pmax', () => module.f32x4.pmax(na(), nb())]
  ]) {
    // Lanes 0 and 1 have a NaN operand: assert which lanes came back NaN.
    testFn(
      'f32x4_' + opName + '_nanmask',
      [module.v128.store(0, 1, c(R), build())],
      module.i32x4.bitmask(module.f32x4.ne(module.v128.load(0, 1, c(R)), module.v128.load(0, 1, c(R))))
    );
    // Lanes 2 and 3 are the (+0, -0) and (-0, +0) pairs: assert the sign bit.
    for (const k of [2, 3]) {
      testFn('f32x4_' + opName + '_zero_w' + k, [module.v128.store(0, 1, c(R), build())], module.i32.load(k * 4, 4, c(R)));
    }
  }

  // ---- coverage assertion ---------------------------------------------------
  //
  // The point of the whole file.  Everything binaryen exposes is either reached
  // above or named in SKIP_ with a reason; there is no third option and no way
  // to under-cover quietly.
  const uncovered = [];
  for (const ns of NAMESPACES) {
    for (const opName of Object.keys(module[ns])) {
      const key = ns + '.' + opName;
      if (covered[key] || key in SKIP_) continue;
      uncovered.push(key);
    }
  }
  if (uncovered.length) {
    throw new Error(
      'wasm2lang_24_simd_dense: binaryen exposes ' +
        uncovered.length +
        ' SIMD builder(s) this module does not reach: ' +
        uncovered.sort().join(', ') +
        '. Add a fixture for each, or name it in SKIP_ with the reason it cannot be one. ' +
        'Do NOT delete this check — it exists because a hand-kept opcode list is what left ' +
        'the load/store family and four f64x2 conversions untested.'
    );
  }
  // The reverse direction: a name marked covered that binaryen does not expose
  // means a typo silently emitted nothing.
  const phantom = [];
  for (const key of Object.keys(covered)) {
    const dot = key.indexOf('.');
    if (!(key.slice(dot + 1) in module[key.slice(0, dot)])) phantom.push(key);
  }
  if (phantom.length) {
    throw new Error('wasm2lang_24_simd_dense: marked covered but not exposed by binaryen: ' + phantom.join(', '));
  }

  if (process.env.W2L_DENSE_EXPORT_LIST) {
    require('fs').writeFileSync(process.env.W2L_DENSE_EXPORT_LIST, exportNames.slice().sort().join('\n') + '\n');
  }

  common.finalizeAndOutput(module);
})();
