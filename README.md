# wasm2lang

<div align="center">

**Compile once to WebAssembly. Ship everywhere as source code.**

<p align="center">
  <a href="https://github.com/COFFEETALES/wasm2lang/actions/workflows/wasm2lang_ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/COFFEETALES/wasm2lang/wasm2lang_ci.yml?style=flat&label=ci&logo=githubactions&logoColor=white" alt="CI status" height="28" /></a>
  <a href="https://www.npmjs.com/package/@coffeetales.net/wasm2lang"><img src="https://img.shields.io/npm/v/%40coffeetales.net%2Fwasm2lang.svg?style=flat&label=latest&color=007acc&logo=npm&logoColor=white" alt="npm version" height="28" /></a>
  <a href="https://coffeetales.github.io/wasm2lang/"><img src="https://img.shields.io/badge/playground-live-111827?style=flat&logo=codepen&logoColor=white" alt="Launch the Playground" height="28" /></a>
</p>

<p align="center">
  <a href="https://github.com/COFFEETALES/wasm2lang/stargazers"><img src="https://img.shields.io/github/stars/COFFEETALES/wasm2lang?style=flat&label=stars&color=f59e0b&logo=github&logoColor=white" alt="GitHub stars" height="28" /></a>
  <a href="https://github.com/COFFEETALES/wasm2lang/issues"><img src="https://img.shields.io/github/issues/COFFEETALES/wasm2lang?style=flat&label=issues&color=0f766e&logo=github&logoColor=white" alt="Open issues" height="28" /></a>
  <a href="https://github.com/COFFEETALES/wasm2lang/blob/main/CHANGELOG.md"><img src="https://img.shields.io/badge/changelog-what's%20new-059669?style=flat&logo=keepachangelog&logoColor=white" alt="Changelog" height="28" /></a>
  <a href="https://github.com/sponsors/COFFEETALES"><img src="https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-db2777?style=flat&logo=githubsponsors&logoColor=white" alt="GitHub Sponsors" height="28" /></a>
</p>

</div>

---

> **[Try it in the Playground →](https://coffeetales.github.io/wasm2lang/)** -- no install, no server. Pick a sample, pick a backend, see the generated code.

---

`wasm2lang` turns a WebAssembly module into **native source code** that each
host toolchain can compile, inline, and optimize directly -- asm.js, JavaScript,
PHP, or Java. No interpreter. No runtime bridge. No WASM engine embedded at runtime.

Write portable logic once, compile to `.wasm`, and deploy it anywhere, even
into environments that refuse to load WebAssembly modules -- shared PHP hosting,
locked-down Java servers, WordPress plugins, browsers without WASM enabled.

## Quick start

```bash
npx @coffeetales.net/wasm2lang                                                                                    \
 --language-out java                                                                                              \
 --input-data '(module (func (export "add") (param i32 i32) (result i32) (i32.add (local.get 0) (local.get 1))))' \
 --emit-code
```

That prints a Java class with an `add` method. Swap `java` for `asmjs`,
`javascript`, or `php64` and you get the same logic in the target language.

Install once for repeated use:

```bash
npm install @coffeetales.net/wasm2lang
```

## Why

- **Reach platforms WASM cannot.** Shared PHP hosting. Classloader-locked Java
  servers. Plugin hosts. Ecosystems where "add a WASM runtime" is not an option.
- **Skip the JIT-over-JIT tax.** Emitted code is compiled by HotSpot, OPcache,
  or V8 directly -- no opaque runtime sits between the engine and your logic.
- **One logic base, four ecosystems.** Fix the bug in one `.wasm`, re-emit to
  every target. Stop drift. Stop duplication.

## Backends

| Backend        | `--language-out` | What you get                                                          |
|----------------|------------------|-----------------------------------------------------------------------|
| **asm.js**     | `ASMJS`          | Closest semantic match to WASM; V8 AOT-compiles via `"use asm"`.      |
| **JavaScript** | `JAVASCRIPT`     | Native BigInt i64, typed-array memory, resizable `ArrayBuffer`.       |
| **PHP**        | `PHP64`          | Pure PHP closures. Runs on shared hosting with zero extensions.       |
| **Java**       | `JAVA`           | Native `long` i64, `ByteBuffer` heap, `IntVector` SIMD128 via Panama. |

Every backend is validated against the original `.wasm` on every commit:
**17 test families × 5 build variants × 4 runtimes**, all producing
byte-identical stdout and matching CRC32 memory snapshots.

## Features

- **Structural passes** -- constant-condition folding, loop simplification,
  block-loop fusion, switch dispatch detection, if-else recovery, block-guard
  elision, redundant-block removal, local init folding.
- **Typed coercion elimination** -- no stray `|0`, `Math_fround`, or redundant casts.
- **Two-step pipelines** -- `--pre-normalized` lets you normalize once, ship
  the `.wasm`, and emit code later. Pass analysis survives the binary
  round-trip via a `w2l_codegen_meta` custom section.
- **Deterministic identifier mangling** -- same key, same output. Feistel-round permutation.
- **Built-in pass profiling** -- `WASM2LANG_PROFILE=1` flushes per-pass
  wall-clock timings to stderr. Zero cost when off.
- **Cast-module imports** -- functions imported from a `"cast"` module
  (`i32_to_f32`, `f64_to_i32`, ...) lower to native type casts.
- **Spec-compliant trapping** -- NaN and out-of-range inputs trap instead of
  silently producing wrong results.
- **Exported mutable globals** -- getter/setter accessors on every backend.

## CLI essentials

```
wasm2lang [options]
```

| Flag                         | What it does                                                                                 |
|------------------------------|----------------------------------------------------------------------------------------------|
| `--input-file <path>`        | `.wasm` binary or `.wast`/`.wat` text. Use `wast:-` for stdin.                               |
| `--input-data <wast>`        | Inline WebAssembly text -- no file needed.                                                   |
| `--language-out <lang>`      | `ASMJS` (default), `JAVASCRIPT`, `PHP64`, `JAVA`.                                            |
| `--normalize-wasm <bundles>` | Comma list of `binaryen:none\|min\|max` and/or `wasm2lang:codegen`. Default: `binaryen:min`. |
| `--emit-code [name]`         | Emit the generated source; the name becomes the output symbol.                               |
| `--emit-metadata [name]`     | Emit static memory initialization.                                                           |
| `--emit-web-assembly [text]` | Re-emit the (normalized) WASM -- binary by default, pass `text` for WAT.                     |
| `--mangler <key>`            | Deterministic identifier mangling.                                                           |
| `--define K=V`               | Compile-time defines (e.g. `JAVA_HEAP_SIZE=524288`). Repeatable.                             |
| `--pre-normalized`           | Input was pre-normalized; recover passes from the custom section.                            |
| `--out-file <path>`          | Write to a file instead of stdout.                                                           |

Run `wasm2lang --help` for the full option list.

### Heap-size defines

Each backend sizes its heap from the module's declared `memory.initial`
(pages × 64 KiB). Override with a `--define` when you need extra room for
runtime allocations beyond the static segments.

| Define            | Backend    |
| ----------------- | ---------- |
| `ASMJS_HEAP_SIZE` | asm.js     |
| `JS_HEAP_SIZE`    | JavaScript |
| `PHP64_HEAP_SIZE` | PHP        |
| `JAVA_HEAP_SIZE`  | Java       |

If the module declares no memory, the heap falls back to 65536 bytes (one page).

## End-to-end example

```bash
wasm2lang                                          \
  --input-file module.wast                         \
  --normalize-wasm binaryen:min,wasm2lang:codegen  \
  --language-out JAVA                              \
  --define JAVA_HEAP_SIZE=524288                   \
  --mangler my-secret-key                          \
  --emit-metadata memBuffer                        \
  --emit-code module                               \
  --out-file Module.java
```

This reads `.wast`, runs the full normalization + codegen pipeline, mangles
identifiers deterministically, and writes a Java class with a `ByteBuffer`
heap ready for HotSpot.

### Two-step: normalize once, emit later

```bash
# Normalize + freeze pass analysis into the .wasm custom section:
wasm2lang --input-file module.wasm                  \
          --normalize-wasm binaryen:min,wasm2lang:codegen \
          --emit-web-assembly > normalized.wasm

# Later -- possibly on a different machine -- emit any target:
wasm2lang --input-file normalized.wasm \
          --pre-normalized             \
          --language-out PHP64         \
          --emit-code
```

## How it works

```
.wat   ┌────────────────────────────────────────┐
.wasm >│> parse >> normalize >> passes >> emit >│> source code
.wast  └────────────────────────────────────────┘
```

1. **Parse** -- Binaryen reads `.wasm` binary or `.wast` text.
2. **Normalize** -- optional Binaryen passes restructure IR (flatten, simplify locals, reorder, vacuum).
3. **Passes** -- wasm2lang's own structural passes recognize and rewrite control-flow patterns.
4. **Emit** -- a traversal-based emitter walks each function body and produces target-language source with type-aware coercion elimination and identifier mangling.

No intermediate AST is constructed. Output chunks come straight from the
traversal visitor, so memory overhead scales with output size, not module size.

**Why asm.js?** WebAssembly is asm.js's binary evolution -- same linear-memory
model, same integer-coercion semantics, same structured control flow. asm.js
is a formally specified typed bytecode that happens to be syntactically valid
JavaScript; V8 still AOT-compiles it via `"use asm"`. This makes it the most
semantically natural target for WASM transpilation -- close to a round-trip.

## Testing

```bash
export SPIDERMONKEY_JS=/path/to/js
export PHP_CLI=/path/to/php
export JSHELL_CLI=/path/to/jshell

mkdir test_artifacts && cd test_artifacts
../scripts/wasm2lang_build_tests.sh
./wasm2lang_run_tests.sh
```

Every test is built in five variants (`baseline`, `codegen`, `nomangle`,
`nopre`, `prenorm`), run through V8, SpiderMonkey, PHP CLI, and jshell, and
compared against V8's execution of the original `.wasm` -- byte-identical
stdout and matching CRC32 memory snapshots required to pass.

Set `WASM2LANG_PROFILE=1` on any invocation to get per-pass wall-clock
timings on stderr.

## Building from source

```bash
yarn closure-make   # → dist_artifacts/wasmxlang.js
```

Targets Closure Compiler ADVANCED_OPTIMIZATIONS, ES5 strict.

## Changelog

Per-version files live under [`changelog/`](changelog/), indexed in
[`CHANGELOG.md`](CHANGELOG.md). Current release:
[**v2026.04.111**](changelog/v2026.04.111.md).

## Contributing

Bug reports, issues, and pull requests welcome -- especially around backend
coverage, pass behavior, and test fixtures.

---

## Support the project

<div align="center">

`wasm2lang` is an independent, self-funded project -- no company, no venture
backing, no grants. Every backend, every pass, every cross-runtime test fixture
represents focused engineering work sustained over time.

**Your sponsorship funds new backends, deeper optimization passes, broader
WASM coverage (threads, exception handling, more proposals), and the
cross-runtime validation infrastructure that keeps correctness rigorous.**

If `wasm2lang` saves you from rewriting logic across languages, unlocks a
deployment target a WASM runtime cannot reach, or you simply believe this
kind of tool should exist -- consider sponsoring.

### [Become a sponsor](https://github.com/sponsors/COFFEETALES)

<a href="https://github.com/sponsors/COFFEETALES"><img src="https://img.shields.io/badge/Become%20a%20Sponsor-GitHub%20Sponsors-db2777?style=flat&logo=githubsponsors&logoColor=white" alt="Become a sponsor on GitHub Sponsors" height="28" /></a>

</div>
