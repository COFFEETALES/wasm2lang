#!/bin/sh
# vim: set tabstop=2 shiftwidth=2 expandtab :

set -e

prefix="${0%'.sh'}"
if [ ${#0} -ne ${#prefix} ]; then
  SH_SOURCE="$(cd "$(dirname "$0")" ; pwd -P)"
  EXPECTED_CWD="$(cd "$SH_SOURCE/../test_artifacts" && pwd -P)"
  ACTUAL_CWD="$(pwd -P)"

  fn() {
    local file variant_suffix normalize_wasm artifact_normalize_wasm
    local filename testbase artifact_dir artifact_base
    local harness_file harness_name harness_variant_name

    if [ "$ACTUAL_CWD" != "$EXPECTED_CWD" ]; then
      echo "Error: run from $EXPECTED_CWD (current: $ACTUAL_CWD)" >&2
      return 1
    fi

    echo "Building tests..."
    export NODE_PATH="${SH_SOURCE}/../node_modules"

    export WASM2LANG_OPTIMIZE_OUTPUT=on

    rm -rf                     \
      ./wasm2lang_*_*/         \
      ./wasm2lang_*_runner.js  \
      ./wasm2lang_*_runner.jsh \
      ./wasm2lang_*_runner.php \
      ./wasm2lang_run_tests.sh

    cp '../scripts/wasm2lang_run_tests.sh' .
    cp '../scripts/wasm2lang_java_runner.jsh' .
    cp '../scripts/wasm2lang_php_runner.php' .
    cp '../scripts/wasm2lang_wasm_asmjs_runner.js' .

    for file in '../tests/wasm2lang_'*'.build.js'; do
      for variant_suffix in codegen none; do
        case "$variant_suffix" in
          codegen)
            normalize_wasm="binaryen:none,wasm2lang:codegen"
            set -- --mangler wasm2lang-test
            ;;
          none)
            normalize_wasm="binaryen:none"
            set --
            ;;
        esac

        artifact_normalize_wasm="binaryen:none"
        filename="$(basename "$file")"
        testbase="${filename%.build.js}"
        artifact_dir="${testbase}_${variant_suffix}"
        artifact_base="${artifact_dir}/${artifact_dir}"

        mkdir "$artifact_dir"
        for harness_file in "../tests/${testbase}.harness."*; do
          harness_name="$(basename "$harness_file")"
          harness_variant_name="${artifact_dir}${harness_name#$testbase}"
          cp "$harness_file" "./${artifact_dir}/${harness_variant_name}"
        done

        if [ 'codegen' = "$variant_suffix" ]; then
          #
          # Generate original WAST
          node                             \
            "../tests/$filename"           \
            1>./"${testbase}".orig.wast
        fi
        #
        # Generate WASM
        cat ./"${testbase}".orig.wast                 \
        |                                             \
        node                                          \
          "../wasm2lang.js"                           \
          --normalize-wasm "$artifact_normalize_wasm" \
          --emit-web-assembly                         \
          --input-file wast:-                         \
          1>"${artifact_base}".wasm
        #
        # Generate WAST
        cat ./"${testbase}".orig.wast                 \
        |                                             \
        node                                          \
          "../wasm2lang.js"                           \
          --normalize-wasm "$artifact_normalize_wasm" \
          --emit-web-assembly text                    \
          --input-file wast:-                         \
          1>"${artifact_base}".wast
        #
        # Generate ASMJS (uses .wast text input — binaryen's getExpressionInfo
        # has issues with br_table expressions read from .wasm binary)
        node                                        \
          "../wasm2lang.js"                         \
          --normalize-wasm "$normalize_wasm"        \
          "$@"                                      \
          --language-out ASMJS                      \
          --define "ASMJS_HEAP_SIZE=$((65536 * 8))" \
          --emit-metadata=memBuffer                 \
          --emit-code=module                        \
          --input-file "wast:${artifact_base}.wast" \
          1>"${artifact_base}".asm.js
        #
        # Generate PHP64
        node                                        \
          "../wasm2lang.js"                         \
          --normalize-wasm "$normalize_wasm"        \
          "$@"                                      \
          --language-out PHP64                      \
          --define "PHP64_HEAP_SIZE=$((65536 * 8))" \
          --emit-metadata=memBuffer                 \
          --emit-code=module                        \
          --input-file "wast:${artifact_base}.wast" \
          1>"${artifact_base}".php
        #
        # Generate JAVA
        node                                        \
          "../wasm2lang.js"                         \
          --normalize-wasm "$normalize_wasm"        \
          "$@"                                      \
          --language-out JAVA                       \
          --define "JAVA_HEAP_SIZE=$((65536 * 8))"  \
          --emit-metadata=memBuffer                 \
          --emit-code=module                        \
          --input-file "wast:${artifact_base}.wast" \
          1>"${artifact_base}".java
      done
    done

    echo "Build complete."
    return 0
  }
  fn
fi
