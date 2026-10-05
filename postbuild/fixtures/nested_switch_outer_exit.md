# Nested switch outer exit

Current validation (2026-09-05): **28/28 postbuild and 152/152 full-suite
variants pass**, with strict codegen-versus-prenorm parity and no advisory
warnings. The earlier 147/152 result below is preserved failure provenance.

`nested_switch_outer_exit.wast` is a minimal regression for an outer switch
case containing another `br_table`. The inner table has both an explicit
target and a default target that leave the outer dispatch. Its other targets
must continue through the inner-case epilogue.

The failure was observed while compiling Blackwell's generated C# ZWAY
kernel: C# rejected `goto __brk` with CS0159. The switch-dispatch pass had
discarded the outer chain's label because its label-necessity walk stopped
at every nested `SwitchId`. The backend then received the unlabelled `*`
sentinel as an external switch target. Replacing that jump with `break`
would leave only the inner switch and execute the wrong epilogue.

`switch_dispatch_apply.js` now checks the nested table's explicit and default
targets against the enclosing chain before deciding that its label is
unnecessary. The change uses the existing switch-target helper and keeps
this decision in the shared structured-control-flow pass.

The postbuild C# family checks that external jumps have declared labels and
that the undefined sentinel label is absent. The JavaScript family executes
six cases: `(0,0)=110`, `(1,0)=125`, `(1,1)=135`, `(1,2)=101`,
`(1,-1)=101`, `(2,0)=101`. The full-suite `wasm2lang_03_control_flow` fixture
also includes an explicit outer exit and an inner epilogue marker; its C#,
Java, JavaScript and PHP harnesses include the new case.

Validation on 2026-09-05: Closure and all 27 postbuild tests passed. The
real scalar C# kernel then compiled through `Add-Type`; all 64 ZWAY seeds
matched their C++ ROM bytes and passed self-test and validation. The game
workspace records this run in
`2d/blackwell/test-results/20260905_lantern/csharp_zway_scalar.log`.
The subsequent full suite passed strict codegen-versus-prenorm comparison,
but exposed five PHP failures in test 03 (`codegen`, `codegen_max`,
`nomangle`, `prenorm`, `prenorm_max`): 147 of 152 variants passed. The PHP
CRC was `0x3f7eda63` instead of the WASM oracle's `0x3c1dc508`. Baseline and
nopre PHP retained the original blocks and passed. The preserved campaign
is recorded in `temp/20260905_nested_switch_full_suite/summary.json`.

The PHP flat-switch emitter registered only the normalization wrapper's
name. An inner branch to the original chain name missed that frame and
silently fell back to the entire stack depth, emitting `break 2` and
skipping the inner epilogue. The fix associates equivalent chain names
with one physical switch frame; aliases never add numeric break depth.
The existing epilogue structure is preserved. The PHP postbuild family
executes the same six cases through `PHP_CLI` (or `php` on PATH), with a
ten-second timeout and exact output comparison.

Final validation on 2026-09-05: the original compiled artifact fails the
six-case PHP regression (`120` instead of `125`), while the corrected
artifact passes all 28 postbuild families. All five affected PHP test-03
variants then match the preserved WASM output byte for byte.

The fresh full suite passed all 152 variants exactly once, including strict
codegen-versus-prenorm comparison with zero strict or advisory warnings.
All 268 input files stayed unchanged during the campaign. Every expected
backend output was present and matched its nonempty WASM oracle, including
96 PHP, 135 C# and 152 Java outputs. The run lasted from 02:22:20 to 02:48:14
UTC and is recorded in `temp/20260905_php_switch_full_suite/summary.json`.
The tested compiled translator SHA-256 is
`5374b9ebf06f1bba041ea9a5f7a91824f8da39bcb01b147b3fed3e81c99a167d`.
The earlier failing artifacts remain in `test_artifacts_php_red_20260905`.

A separate exploratory epilogue reduction exposed an existing normalization
defect and remains unresolved. It is preserved with its diagnostic in
`temp/20260905_php_switch_frames/unresolved_epilogue.wast` and
`normalization_issue.md`; this frame-alias correction does not change that
normalization or introduce a new epilogue scope.
