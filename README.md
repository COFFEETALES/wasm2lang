# wasm2lang

<div align="center">

**WebAssembly to target-language code generator**

[![npm](https://img.shields.io/npm/v/@coffeetales.net/wasm2lang?style=for-the-badge)](https://www.npmjs.com/package/@coffeetales.net/wasm2lang)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-pink?style=for-the-badge)](https://github.com/sponsors/COFFEETALES)
[![GitHub stars](https://img.shields.io/github/stars/COFFEETALES/wasm2lang?style=for-the-badge)](../../stargazers)

</div>

---

## Try it now

> **[Launch the Playground](https://coffeetales.github.io/wasm2lang/)**
>
> The playground runs `wasm2lang` entirely in your browser — no install, no
> server. Pick a sample, choose a backend and normalization pipeline, and see
> the generated code instantly. It is the fastest way to explore what
> `wasm2lang` produces for each backend (asm.js, PHP, Java), test different
> normalization strategies, and experiment with identifier mangling.

`wasm2lang` is a CLI tool that reads WebAssembly modules and emits equivalent
source code in other languages. The pipeline normalizes the input through
configurable passes, traverses the IR, and emits code for a selected backend.

## Why wasm2lang exists

`wasm2lang` was created around a simple idea: if your code already compiles to
WebAssembly, you should be able to reuse that investment across multiple
languages without rewriting the same core logic again and again.

Instead of treating WebAssembly only as a runtime format, `wasm2lang` treats it
as a portable intermediate representation for source-code generation. This makes
it possible to share one logic base, then emit equivalent code for ecosystems
such as Java, PHP, and asm.js.

### When a WebAssembly runtime isn't an option

Embedding a WebAssembly runtime is not always possible — or even desirable.

**Environments where WASM simply cannot run.** Shared hosting providers,
managed PHP platforms, and restrictive application servers often forbid native
extensions and custom runtimes. A WordPress plugin on a $5/month shared host
cannot load a WASM module. `wasm2lang` bridges that gap: it emits pure PHP (or
Java, or asm.js) source code with zero runtime dependencies, so the output runs
anywhere the target language runs.

**Performance-critical paths where native optimization matters.** Running WASM
inside a host-language interpreter means an extra abstraction layer between your
code and the platform's optimizer. In Java, a WASM runtime is an interpreter or
a JIT-over-JIT — the bytecode never reaches HotSpot directly. `wasm2lang`
emits plain Java source code that the JVM compiles, inlines, and optimizes like
any other Java class. For compute-intensive workloads — cryptography, codecs,
compression, numerical kernels — the difference between interpreted WASM and
HotSpot-optimized Java bytecode can be substantial. The same principle applies
to PHP 8+ with OPcache/JIT: transpiled PHP that the JIT can reason about
directly will outperform opaque calls into a WASM interpreter extension.

**The asm.js backend and its relationship to WebAssembly.** WebAssembly was
designed as the binary evolution of asm.js — they share the same linear memory
model, integer coercion semantics, and structured control flow. asm.js is not
merely a JavaScript subset; it is a formally specified typed bytecode that
happens to be syntactically valid JavaScript, and engines such as V8 still
recognize the `"use asm"` directive and apply ahead-of-time compilation. This
makes asm.js the most semantically natural transpilation target for WASM: the
mapping is nearly a round-trip. It serves both as a proven foundation for the
transpilation architecture and as a practical output format in its own right.

`wasm2lang` is designed for all of these situations: preserve the benefits of a
shared WebAssembly-based codebase while generating output that is easier to
adopt, integrate, and operate in the target ecosystem.

The project currently focuses on WebAssembly MVP features for straightforward
and reliable lowering. Longer term, its ambition is broader: support more
advanced WebAssembly features such as SIMD and threads, especially for backends
where those features could map well to the host platform — including Java.

## Installation

```bash
npm install @coffeetales.net/wasm2lang
```

Or run directly without installing:

```bash
npx @coffeetales.net/wasm2lang --input-file module.wast --emit-code
```

For development, clone the repo and build from source (see [Building](#building)).

## Backends

| Backend     | `--language-out`  | Strength                                            |Status                                                                   |
|-------------|-------------------|-----------------------------------------------------|-------------------------------------------------------------------------|
| **asm.js**  | `ASMJS`           | Closest semantic match to WASM; AOT-compiled by V8  | Active — full function-body emission, validated by V8 and SpiderMonkey  |
| **PHP**     | `PHP64`           | Runs on shared hosting with no extensions           | Active — full function-body emission, validated by PHP CLI              |
| **Java**    | `JAVA`            | HotSpot/Graal optimize the output directly          | Active — full function-body emission, validated by jshell               |

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

| Flag                          | Type      | Description                                                                                                                                                          |
|-------------------------------|-----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `--input-file <path>`         | `string`  | Path to a WebAssembly file. Files ending in `.wat`/`.wast` (or prefixed with `wast:`) are read as text; all others as binary. Use `wast:-` to read text from stdin.  |
| `--input-data <string>`       | `string`  | Inline WebAssembly text to compile (alternative to `--input-file`).                                                                                                  |
| `--language-out <lang>`       | `enum`    | Output backend: `ASMJS` (default), `PHP64`, `JAVA`.                                                                                                                  |
| `--normalize-wasm <bundles>`  | `list`    | Comma-separated normalization bundles (see below). Default: `binaryen:min`.                                                                                          |
| `--emit-code [name]`          | `string`  | Emit generated source code. The name becomes the output variable/class name (default: `code`).                                                                       |
| `--emit-metadata [name]`      | `string`  | Emit static memory initialization. The name becomes the output variable name (default: `metadata`).                                                                  |
| `--emit-web-assembly [text]`  | `string`  | Emit the (normalized) WebAssembly module. Defaults to binary format; pass `text` for WAT output.                                                                     |
| `--define <K=V>`              | `string`  | Set a compile-time define (repeatable). Used to configure backend constants.                                                                                         |
| `--mangler <key>`             | `string`  | Enable deterministic identifier mangling. Same key = same output; different keys = different names.                                                                  |
| `--help`                      | —         | Print option descriptions to stderr and exit.                                                                                                                        |

### Normalization bundles

Bundles are passed as a comma-separated list to `--normalize-wasm` and
control how the WebAssembly IR is transformed before code emission.

| Bundle               | Phase      | Description                                                                                           |
|----------------------|------------|-------------------------------------------------------------------------------------------------------|
| `binaryen:none`      | binaryen   | No Binaryen normalization; raw input is used as-is.                                                   |
| `binaryen:min`       | binaryen   | Minimal Binaryen passes (flatten, simplify-locals, reorder-locals, vacuum).                           |
| `binaryen:max`       | binaryen   | Aggressive Binaryen optimization for code generation.                                                 |
| `wasm2lang:codegen`  | wasm2lang  | Internal wasm2lang passes (loop simplification, block-loop fusion, switch dispatch detection, etc.).  |

Common combinations:

- **`binaryen:none`** — useful when the input is already in the shape you want.
- **`binaryen:min,wasm2lang:codegen`** — recommended for general code generation.
- **`binaryen:none,wasm2lang:codegen`** — skip Binaryen but still apply wasm2lang's structural passes.

### Backend defines

Each backend reads specific defines from `--define` to control output
parameters.

| Define             | Backend  | Default  | Description                              |
|--------------------|----------|----------|------------------------------------------|
| `ASMJS_HEAP_SIZE`  | asm.js   | 65536    | Size of the `ArrayBuffer` heap (bytes).  |
| `PHP64_HEAP_SIZE`  | PHP      | 65536    | Size of the binary string heap (bytes).  |
| `JAVA_HEAP_SIZE`   | Java     | 65536    | Size of the `ByteBuffer` heap (bytes).   |

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

`--input-data` passes the WAT source directly as a CLI argument — no pipe or
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
  "use asm";
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
2. Builds each fixture in two variants — `codegen` (with `wasm2lang:codegen` passes + mangling) and `none` (raw, no codegen passes).
3. For each variant, transpiles to all three backends (asm.js, PHP, Java).
4. Runs the original `.wasm` through V8 as a reference.
5. Runs each backend's output through its runtime (V8, SpiderMonkey, PHP CLI, jshell).
6. Compares stdout output and a CRC32 memory snapshot across all backends.

All backends must produce byte-identical output and matching memory checksums
to pass.

## Browser Playground

**Live version: https://coffeetales.github.io/wasm2lang/**

The `web/` directory contains the browser playground that runs
`wasm2lang` entirely client-side. Both `wasm2lang` and Binaryen are
loaded from CDN — no build step or backend server required.

To run it locally from a clone, serve the `web/` directory over HTTP:

```bash
npx serve web/
# then open http://localhost:3000/
```

The playground includes selectable WAT samples (including data-segment
examples that showcase metadata output), backend and normalization
selectors, identifier mangling, and shows both the generated
metadata + code and normalized WAT output.

## Contributing

Bug reports, issues, and pull requests are welcome. Good starting points:

- Backend emission correctness and coverage
- Traversal, schema, and pass behavior
- Test fixtures and validation coverage

## Sponsorship

If `wasm2lang` is useful to you, consider
[sponsoring the project](https://github.com/sponsors/COFFEETALES).
Sponsorship supports ongoing backend work, validation coverage, and
long-term maintainability.

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-pink?style=for-the-badge)](https://github.com/sponsors/COFFEETALES)
