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
    local harness_file harness_name harness_variant_name build_languages
    local variant_list

    local LF="$(printf '\012+')"
    LF="${LF%?}"

    if [ "$ACTUAL_CWD" != "$EXPECTED_CWD" ]; then
      echo "Error: run from $EXPECTED_CWD (current: $ACTUAL_CWD)" >&2
      return 1
    fi

    echo "Building tests..."
    export NODE_PATH="${SH_SOURCE}/../node_modules"

    export WASM2LANG_OPTIMIZE_OUTPUT=on

    rm -rf                              \
      ./wasm2lang_*_*/                  \
      ./wasm2lang_*.shared.data.json    \
      ./wasm2lang_*.orig.wast           \
      ./wasm2lang_*_runner.js           \
      ./wasm2lang_*_runner.jsh          \
      ./wasm2lang_*_runner.php          \
      ./wasm2lang_run_tests.sh

    cp '../scripts/wasm2lang_run_tests.sh' .
    cp '../scripts/wasm2lang_java_runner.jsh' .
    cp '../scripts/wasm2lang_php_runner.php' .
    cp '../scripts/wasm2lang_wasm_asmjs_runner.js' .

    for file in '../tests/wasm2lang_'*'.build.js'; do
      filename="$(basename "$file")"
      testbase="${filename%.build.js}"

      #
      # Generate original WAST + shared data (once per test, before variants)
      node                                                                       \
        "../tests/$filename"                                                     \
        --emit-shared-data "./${testbase}.shared.data.json"                      \
        1>./"${testbase}".orig.wast

      # Read variant list from .build.normalize (one "suffix normalize_wasm" per
      # line) or fall back to the default two-variant set.
      if [ -f "../tests/${testbase}.build.normalize" ]; then
        variant_list="$(cat "../tests/${testbase}.build.normalize")"
      else
        variant_list="codegen binaryen:none,wasm2lang:codegen${LF}prenorm binaryen:none,wasm2lang:codegen"
      fi

      while IFS=' ' read -r variant_suffix normalize_wasm; do
        # Variants with wasm2lang:codegen get mangler args; others get none.
        case "$normalize_wasm" in
          *wasm2lang:codegen*)
            if [ -n "${UNIQUE_MANGLER_KEY:-}" ]; then
              set -- --mangler "$UNIQUE_MANGLER_KEY"
            else
              MANGLER_LEN=$(( $(od -An -N1 -tu1 /dev/urandom | tr -d ' ') % 25 + 8 ))
              set -- --mangler "$(head -c 256 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | head -c "$MANGLER_LEN")"
            fi
            ;;
          *)
            set --
            ;;
        esac

        artifact_dir="${testbase}_${variant_suffix}"
        artifact_base="${artifact_dir}/${artifact_dir}"

        # Per-test language restriction (default: all languages).
        build_languages="ASMJS PHP64 JAVA"
        if [ -f "../tests/${testbase}.build.languages" ]; then
          build_languages="$(cat "../tests/${testbase}.build.languages")"
        fi

        # prenorm/nopre: WASM/WAST include wasm2lang:codegen normalization
        # (embeds the w2l_codegen_meta custom section); other variants use raw.
        case "$variant_suffix" in
          prenorm|nopre) wasm_normalize="$normalize_wasm" ;;
          *)             wasm_normalize="binaryen:none"   ;;
        esac

        mkdir "$artifact_dir"
        for harness_file in "../tests/${testbase}.harness."*; do
          harness_name="$(basename "$harness_file")"
          harness_variant_name="${artifact_dir}${harness_name#$testbase}"
          cp "$harness_file" "./${artifact_dir}/${harness_variant_name}"
        done
        #
        # Generate WASM
        cat ./"${testbase}".orig.wast           \
        |                                       \
        node                                    \
          "../wasm2lang.js"                     \
          --normalize-wasm "$wasm_normalize"    \
          --emit-web-assembly                   \
          --input-file wast:-                   \
          --out-file="${artifact_base}".wasm
        #
        # Generate WAST
        cat ./"${testbase}".orig.wast           \
        |                                       \
        node                                    \
          "../wasm2lang.js"                     \
          --normalize-wasm "$wasm_normalize"    \
          --emit-web-assembly text              \
          --input-file wast:-                   \
          --out-file="${artifact_base}".wast
        #
        # Code generation: prenorm reads from the variant's .wasm binary
        # with --pre-normalized; other variants read from .wast with
        # in-process normalization.
        case "$variant_suffix" in
          prenorm)
            codegen_normalize="binaryen:none"
            codegen_input="--input-file ${artifact_base}.wasm --pre-normalized"
            ;;
          nopre)
            codegen_normalize="binaryen:none"
            codegen_input="--input-file ${artifact_base}.wasm"
            ;;
          *)
            codegen_normalize="$normalize_wasm"
            codegen_input="--input-file wast:${artifact_base}.wast"
            ;;
        esac
        #
        # Generate ASMJS
        case " $build_languages " in *" ASMJS "*)
        node                                        \
          "../wasm2lang.js"                         \
          --normalize-wasm "$codegen_normalize"     \
          "$@"                                      \
          --language-out ASMJS                      \
          --define "ASMJS_HEAP_SIZE=$((65536 * 8))" \
          --emit-metadata=memBuffer                 \
          --emit-code=module                        \
          --out-file="${artifact_base}".asm.js      \
          $codegen_input
        ;; esac
        #
        # Generate PHP64
        case " $build_languages " in *" PHP64 "*)
        node                                        \
          "../wasm2lang.js"                         \
          --normalize-wasm "$codegen_normalize"     \
          "$@"                                      \
          --language-out PHP64                      \
          --define "PHP64_HEAP_SIZE=$((65536 * 8))" \
          --emit-metadata=memBuffer                 \
          --emit-code=module                        \
          --out-file="${artifact_base}".php         \
          $codegen_input
        ;; esac
        #
        # Generate JAVA
        case " $build_languages " in *" JAVA "*)
        node                                        \
          "../wasm2lang.js"                         \
          --normalize-wasm "$codegen_normalize"     \
          "$@"                                      \
          --language-out JAVA                       \
          --define "JAVA_HEAP_SIZE=$((65536 * 8))"  \
          --emit-metadata=memBuffer                 \
          --emit-code=module                        \
          --out-file="${artifact_base}".java        \
          $codegen_input
        ;; esac
      done <<EOF
$variant_list
EOF
    done

    echo "Build complete."
    return 0
  }
  fn
fi
