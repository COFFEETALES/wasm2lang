#/bin/sh
# vim: set tabstop=2 shiftwidth=2 expandtab :

set -e


prefix="${0%'.sh'}"
if [ ${#0} -ne ${#prefix} ]; then
  SH_SOURCE="$(cd "$(dirname "$0")" ; pwd -P)"
  EXPECTED_CWD="$(cd "$SH_SOURCE/../test_artifacts" && pwd -P)"
  ACTUAL_CWD="$(pwd -P)"

  fn() {
    local file filename filebase

    if [ "$ACTUAL_CWD" != "$EXPECTED_CWD" ]; then
      echo "Error: run from $EXPECTED_CWD (current: $ACTUAL_CWD)" >&2
      return 1
    fi

    echo "Building tests..."
    export NODE_PATH="${SH_SOURCE}/../node_modules"

    export WASM2LANG_OPTIMIZE_OUTPUT=on

    rm -f                      \
     ./wasm2lang_*_*/          \
     ./wasm2lang_*_runner.js   \
     ./wasm2lang_run_tests.sh

    cp '../tests/wasm2lang_wasm_asmjs_runner.js' .
    cp '../scripts/wasm2lang_run_tests.sh' .

    for file in '../tests/wasm2lang_'*'.build.js'; do
      filename="$(basename "$file")"
      filebase="${filename%'.build.js'}"
      mkdir "${filebase}"
      cp                                              \
       '../tests/'"${filebase}"'.harness.mjs'         \
       './'"${filebase}"'/'
      #
      # Generate original WAST
      node                                            \
        "../tests/$filename"                          \
        1>"${filebase}"/"${filebase}".orig.wast
      #
      # Generate WASM
      node                                            \
        "../tests/$filename"                          \
      |                                               \
      node                                            \
        "../wasmxlang.js"                             \
        --normalize-wasm binaryen:none                \
        --emit-web-assembly                           \
        --input-file wast:-                           \
        1>"${filebase}"/"${filebase}".wasm
      #
      # Generate WAST
      node                                            \
        "../tests/$filename"                          \
      |                                               \
      node                                            \
        "../wasmxlang.js"                             \
        --normalize-wasm binaryen:none                \
        --emit-web-assembly text                      \
        --input-file wast:-                           \
        1>"${filebase}"/"${filebase}".wast
      #
      # Generate ASMJS
      node                                            \
        "../wasmxlang.js"                             \
        --normalize-wasm binaryen:none                \
        --simplify-output                             \
        --language_out ASMJS                          \
        --define DASMJS_HEAP_SIZE=$((65536 * 8))      \
        --emit-metadata=memBuffer                     \
        --emit-code=module                            \
        --input-file "${filebase}"/"${filebase}".wasm \
        1>"${filebase}"/"${filebase}".asm.js
    done

    echo "Build complete."
    return 0
  }
  fn
fi