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
  <a href="https://github.com/sponsors/COFFEETALES"><img src="https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-db2777?style=flat&logo=githubsponsors&logoColor=white" alt="GitHub Sponsors" height="28" /></a>
</p>

</div>

---

> **[Launch the Playground](https://coffeetales.github.io/wasm2lang/)** -- no
> install, no server. Pick a sample, choose a backend, and see generated
> asm.js, PHP, or Java code instantly in your browser.

---

`wasm2lang` reads WebAssembly modules and emits equivalent, human-readable
source code. Not an interpreter. Not a runtime bridge. Actual source code that
compiles, runs, and optimizes like anything else written in the target language.

One logic base. Multiple ecosystems. Zero runtime dependencies.

## The problem

You already compile to WebAssembly. That investment is real: tested algorithms,
validated correctness, portable IR. But then you hit a wall.

**Your target environment refuses to run WASM.** A WordPress plugin on shared
hosting cannot load a WebAssembly module. A managed PHP platform forbids native
extensions. An enterprise Java application server locks down its classloader.
Your portable bytecode is suddenly not portable at all.

**Your WASM runtime is the bottleneck.** Running WebAssembly inside a
host-language interpreter adds an abstraction layer the platform optimizer
cannot see through. In Java, a WASM runtime is a JIT-over-JIT -- HotSpot never
touches your actual logic. In PHP, it is an opaque extension the OPcache/JIT
cannot reason about. For compute-intensive workloads -- cryptography, codecs,
compression, numerical kernels -- the performance gap between interpreted WASM
and natively optimized host code can be substantial.

**You are rewriting the same logic for every platform.** Without a
transpilation path, each target language gets its own hand-rolled
implementation. Bugs are fixed in one place and rediscovered in another.
Behavior drifts. Maintenance compounds.

## The solution

`wasm2lang` treats WebAssembly not just as a runtime format, but as a portable
intermediate representation for source-code generation.

Write once. Compile to `.wasm`. Run `wasm2lang`. Get native-feeling source code
that each platform's toolchain can compile, inline, and optimize directly.

## Backends

| Backend    | `--language-out` | Strength                                           | Status                                                                  |
| ---------- | ---------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| **asm.js** | `ASMJS`          | Closest semantic match to WASM; AOT-compiled by V8 | Active -- full function-body emission, validated by V8 and SpiderMonkey |
| **PHP**    | `PHP64`          | Runs on shared hosting with no extensions          | Active -- full function-body emission, validated by PHP CLI             |
| **Java**   | `JAVA`           | HotSpot/Graal optimize the output directly         | Active -- full function-body emission, validated by jshell              |

**Why asm.js?** WebAssembly was designed as the binary evolution of asm.js --
they share the same linear memory model, integer coercion semantics, and
structured control flow. asm.js is not merely a JavaScript subset; it is a
formally specified typed bytecode that happens to be syntactically valid
JavaScript, and engines such as V8 still recognize the `"use asm"` directive
and apply ahead-of-time compilation. This makes asm.js the most semantically
natural transpilation target for WASM: the mapping is nearly a round-trip.

The project currently focuses on WebAssembly MVP features for straightforward
and reliable lowering. The longer-term ambition is broader: more WASM features,
more backends, and deeper optimization passes -- especially where host
capabilities like Java's SIMD intrinsics could map directly to WASM proposals.

## Installation

```bash
npm install @coffeetales.net/wasm2lang
```

Or run directly without installing:

```bash
npx @coffeetales.net/wasm2lang --input-file module.wast --emit-code
```

For development, clone the repo and build from source (see [Building](#building)).

## Quick start

```bash
# Inline a .wast module and emit PHP:
npx @coffeetales.net/wasm2lang                                                                                    \
 --language-out php64                                                                                             \
 --input-data '(module (func (export "add") (param i32 i32) (result i32) (i32.add (local.get 0) (local.get 1))))' \
 --normalize-wasm binaryen:min                                                                                    \
 --mangler secret                                                                                                 \
 --emit-code
```

## CLI reference

```
wasm2lang [options]
```

After `npm install`, the `wasm2lang` command is available in your project.
When developing from a local clone, use `node wasm2lang.js --dev` to load
source files directly from `src/`.

### Options

| Flag                         | Type     | Description                                                                                                                                                         |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--input-file <path>`        | `string` | Path to a WebAssembly file. Files ending in `.wat`/`.wast` (or prefixed with `wast:`) are read as text; all others as binary. Use `wast:-` to read text from stdin. |
| `--input-data <string>`      | `string` | Inline WebAssembly text to compile (alternative to `--input-file`).                                                                                                 |
| `--language-out <lang>`      | `enum`   | Output backend: `ASMJS` (default), `PHP64`, `JAVA`.                                                                                                                 |
| `--normalize-wasm <bundles>` | `list`   | Comma-separated normalization bundles (see below). Default: `binaryen:min`.                                                                                         |
| `--emit-code [name]`         | `string` | Emit generated source code. The name becomes the output variable/class name (default: `code`).                                                                      |
| `--emit-metadata [name]`     | `string` | Emit static memory initialization. The name becomes the output variable name (default: `metadata`).                                                                 |
| `--emit-web-assembly [text]` | `string` | Emit the (normalized) WebAssembly module. Defaults to binary format; pass `text` for WAT output.                                                                    |
| `--define <K=V>`             | `string` | Set a compile-time define (repeatable). Used to configure backend constants.                                                                                        |
| `--mangler <key>`            | `string` | Enable deterministic identifier mangling. Same key = same output; different keys = different names.                                                                 |
| `--help`                     | --       | Print option descriptions to stderr and exit.                                                                                                                       |

### Normalization bundles

Bundles are passed as a comma-separated list to `--normalize-wasm` and
control how the WebAssembly IR is transformed before code emission.

| Bundle              | Phase     | Description                                                                                          |
| ------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `binaryen:none`     | binaryen  | No Binaryen normalization; raw input is used as-is.                                                  |
| `binaryen:min`      | binaryen  | Minimal Binaryen passes (flatten, simplify-locals, reorder-locals, vacuum).                          |
| `binaryen:max`      | binaryen  | Aggressive Binaryen optimization for code generation.                                                |
| `wasm2lang:codegen` | wasm2lang | Internal wasm2lang passes (loop simplification, block-loop fusion, switch dispatch detection, etc.). |

Common combinations:

- **`binaryen:none`** -- useful when the input is already in the shape you want.
- **`binaryen:min,wasm2lang:codegen`** -- recommended for general code generation.
- **`binaryen:none,wasm2lang:codegen`** -- skip Binaryen but still apply wasm2lang's structural passes.

### Backend defines

Each backend reads specific defines from `--define` to control output
parameters.

| Define            | Backend | Default | Description                             |
| ----------------- | ------- | ------- | --------------------------------------- |
| `ASMJS_HEAP_SIZE` | asm.js  | 65536   | Size of the `ArrayBuffer` heap (bytes). |
| `PHP64_HEAP_SIZE` | PHP     | 65536   | Size of the binary string heap (bytes). |
| `JAVA_HEAP_SIZE`  | Java    | 65536   | Size of the `ByteBuffer` heap (bytes).  |

## Usage examples

### Emit asm.js with memory initialization

```bash
wasm2lang                            \
  --input-file module.wast           \
  --normalize-wasm binaryen:min      \
  --language-out ASMJS               \
  --define ASMJS_HEAP_SIZE=524288    \
  --emit-metadata memBuffer          \
  --emit-code module > output.asm.js
```

The output will contain a `var memBuffer = new ArrayBuffer(...)` block
followed by `var module = function asmjsModule(stdlib, foreign, buffer) { ... }`.

### Emit PHP code

```bash
wasm2lang                                          \
  --input-file module.wast                         \
  --normalize-wasm binaryen:none,wasm2lang:codegen \
  --language-out PHP64                             \
  --define PHP64_HEAP_SIZE=524288                  \
  --emit-metadata memBuffer                        \
  --emit-code module > output.php
```

PHP output is a closure-based module: `$module = function(array $foreign, string &$buffer): array { ... }`.
Functions are emitted as PHP closures with `use` clauses capturing the heap
buffer and other function references by reference.

### Emit Java code

```bash
wasm2lang                                          \
  --input-file module.wast                         \
  --normalize-wasm binaryen:none,wasm2lang:codegen \
  --language-out JAVA                              \
  --define JAVA_HEAP_SIZE=524288                   \
  --emit-metadata memBuffer                        \
  --emit-code module > output.java
```

Java output is a class wrapping all exported functions as methods, with a
`ByteBuffer`-based heap.

### Inline WebAssembly text

```bash
wasm2lang                                                                            \
 --language-out java                                                                \
 --input-data '(module (func (export "f") (param i32) (result i32) (local.get 0)))' \
 --normalize-wasm binaryen:min                                                      \
 --mangler secret                                                                   \
 --emit-code
```

`--input-data` passes the WAT source directly as a CLI argument -- no pipe or
temp file needed.

`--input-file wast:-` can also read WAT from stdin, but note that piping may
fail on some platforms (e.g. MINGW/Git Bash on Windows reports
"stdin is not a tty").

### Re-emit normalized WebAssembly

```bash
# Emit normalized WAT (text):
wasm2lang                               \
  --input-file module.wasm              \
  --normalize-wasm binaryen:min         \
  --emit-web-assembly text

# Emit normalized WASM (binary):
wasm2lang                               \
  --input-file module.wasm              \
  --normalize-wasm binaryen:min         \
  --emit-web-assembly > normalized.wasm
```

### Use identifier mangling

```bash
wasm2lang                                          \
  --input-file module.wast                         \
  --normalize-wasm binaryen:none,wasm2lang:codegen \
  --language-out JAVA                              \
  --mangler my-secret-key                          \
  --emit-code module
```

Internal identifiers are replaced with short, opaque names derived from the
key. The same key always produces the same output.

### Combine metadata and code emission

`--emit-metadata` and `--emit-code` can be used together. The metadata
(memory initialization) is emitted first, followed by the code.

```bash
wasm2lang                         \
  --input-file app.wast           \
  --normalize-wasm binaryen:min   \
  --language-out ASMJS            \
  --define ASMJS_HEAP_SIZE=131072 \
  --emit-metadata heapData        \
  --emit-code myModule
```

Output:

```js
var heapData = new ArrayBuffer(131072);
var i32_array = new Int32Array(heapData);
var myModule = function asmjsModule(stdlib, foreign, buffer) {
  'use asm';
  // ...
};
```

### Multiple defines

`--define` is repeatable:

```bash
wasm2lang                         \
  --input-file app.wast           \
  --define ASMJS_HEAP_SIZE=262144 \
  --define CUSTOM_FLAG=true       \
  --emit-code
```

### Compile from `.wasm` binary

```bash
wasm2lang                       \
  --input-file module.wasm      \
  --normalize-wasm binaryen:min \
  --language-out PHP64          \
  --emit-code module
```

Binary `.wasm` files are detected automatically (no `wast:` prefix needed).

## Building

```bash
yarn closure-make # produces dist_artifacts/wasmxlang.js
```

The project targets Closure Compiler ADVANCED_OPTIMIZATIONS (ES5 strict).

## Testing

```bash
export SPIDERMONKEY_JS=/path/to/js
export PHP_CLI=/path/to/php
export JSHELL_CLI=/path/to/jshell

mkdir test_artifacts && cd test_artifacts
../scripts/wasm2lang_build_tests.sh
./wasm2lang_run_tests.sh
```

The test harness:

1. Generates `.wast` test fixtures from `tests/*.build.js` scripts.
2. Builds each fixture in two variants -- `codegen` (with `wasm2lang:codegen` passes + mangling) and `none` (raw, no codegen passes).
3. For each variant, transpiles to all three backends (asm.js, PHP, Java).
4. Runs the original `.wasm` through V8 as a reference.
5. Runs each backend's output through its runtime (V8, SpiderMonkey, PHP CLI, jshell).
6. Compares stdout output and a CRC32 memory snapshot across all backends.

All backends must produce byte-identical output and matching memory checksums
to pass.

## Browser Playground

**Live version: https://coffeetales.github.io/wasm2lang/**

The playground includes selectable WAT samples (including data-segment
examples that showcase metadata output), backend and normalization
selectors, identifier mangling, and shows both the generated
metadata + code and normalized WAT output.

## Contributing

Bug reports, issues, and pull requests are welcome. Good starting points:

- Backend emission correctness and coverage
- Traversal, schema, and pass behavior
- Test fixtures and validation coverage

---

## Support the project

<div align="center">

`wasm2lang` is built and maintained as an independent, self-funded project.
There is no company behind it, no venture backing, no grants -- just focused
engineering work, sustained over time.

Every backend, every optimization pass, every test fixture that validates
byte-identical output across three runtimes represents hours of careful
design. Sponsorship is what makes that level of rigor sustainable.

**Your sponsorship directly funds:**

**New backends and language targets** -- expanding where WebAssembly can ship
as native source code.

**Deeper optimization passes** -- better loop recognition, smarter coercion
elimination, tighter generated code.

**Broader WebAssembly coverage** -- moving beyond MVP toward SIMD, threads,
and advanced proposals.

**Validation infrastructure** -- the cross-runtime test harness that
guarantees correctness is not free to build or maintain.

If `wasm2lang` saves you from rewriting logic across languages, if it unlocks
a deployment target that a WASM runtime cannot reach, or if you simply believe
this kind of tool should exist -- consider sponsoring.

### [Become a sponsor](https://github.com/sponsors/COFFEETALES)

<a href="https://github.com/sponsors/COFFEETALES"><img src="https://img.shields.io/badge/Become%20a%20Sponsor-GitHub%20Sponsors-db2777?style=flat&logo=githubsponsors&logoColor=white" alt="Become a sponsor on GitHub Sponsors" height="28" /></a>

</div>
