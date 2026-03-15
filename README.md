# wasm2lang

<div align="center">

**WebAssembly to target-language code generator**

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-pink?style=for-the-badge)](https://github.com/sponsors/COFFEETALES)
[![GitHub stars](https://img.shields.io/github/stars/COFFEETALES/wasm2lang?style=for-the-badge)](../../stargazers)

</div>

---

`wasm2lang` is a CLI tool that reads WebAssembly modules and emits equivalent
source code in other languages. The pipeline normalizes the input through
configurable passes, traverses the IR, and emits code for a selected backend.

## Backends

| Backend  | Status |
|----------|--------|
| **asm.js** | Active — full function-body emission, validated by SpiderMonkey |
| **PHP**    | Active — full function-body emission, validated by PHP CLI |
| **Java**   | Active — full function-body emission, validated by jshell |

## Usage

```bash
# From source (--dev loads src/ directly):
node wasmxlang.js --dev \
  --input-file sample.wast \
  --normalize-wasm binaryen:min,wasm2lang:codegen \
  --emit-code

# From compiled artifact:
node wasmxlang.js \
  --input-file module.wasm \
  --language-out PHP64 \
  --normalize-wasm binaryen:none,wasm2lang:codegen \
  --emit-metadata memBuffer \
  --emit-code module
```

Key flags:

- `--language-out` — `ASMJS` (default), `PHP64`, `JAVA`
- `--normalize-wasm` — comma-separated pass bundles (`binaryen:none|min|max`, `wasm2lang:codegen`)
- `--emit-code` — emit the generated source (`module` wraps in a callable unit)
- `--emit-metadata` — emit static memory initialization under the given name
- `--mangler <key>` — deterministic identifier mangling keyed by the given string
- `--define K=V` — set backend defines (e.g. `ASMJS_HEAP_SIZE=524288`)

## Building

```bash
yarn closure-make          # produces dist_artifacts/wasm2lang.js
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

Tests run each backend against a reference WASM execution and compare output
plus a CRC32 memory snapshot. SpiderMonkey additionally validates asm.js.

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
