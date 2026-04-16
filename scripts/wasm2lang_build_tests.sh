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
    local codegen_dir codegen_name testbase_only prenorm_name ext f1 f2 tmpfile
    local constraint_failures

    local LF="$(printf '\012+')"
    LF="${LF%?}"

    if [ "$ACTUAL_CWD" != "$EXPECTED_CWD" ]; then
      echo -e "\033[0;31mError:\033[0m run from $EXPECTED_CWD (current: $ACTUAL_CWD)" >&2
      return 1
    fi

    echo -e "\033[1;34mBuilding tests...\033[0m"
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

      if [ -n "${UNIQUE_MANGLER_KEY:-}" ]; then
        set -- --mangler "$UNIQUE_MANGLER_KEY"
      else
        MANGLER_LEN=$(( $(od -An -N1 -tu1 /dev/urandom | tr -d ' ') % 25 + 8 ))
        set -- --mangler "$(head -c 256 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | head -c "$MANGLER_LEN")"
      fi

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

        artifact_dir="${testbase}_${variant_suffix}"
        artifact_base="${artifact_dir}/${artifact_dir}"

        # Per-test language restriction (default: all languages).
        build_languages="ASMJS JAVASCRIPT PHP64 JAVA"
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
        # Generate JAVASCRIPT
        case " $build_languages " in *" JAVASCRIPT "*)
        node                                        \
          "../wasm2lang.js"                         \
          --normalize-wasm "$codegen_normalize"     \
          "$@"                                      \
          --language-out JAVASCRIPT                 \
          --define "ASMJS_HEAP_SIZE=$((65536 * 8))" \
          --emit-metadata=memBuffer                 \
          --emit-code=module                        \
          --out-file="${artifact_base}".js          \
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

    # Constraint: for every test with both _codegen and _prenorm variants, the
    # emitted code in each language must be byte-identical once the variant
    # directory name is substituted.  A divergence here means wasm2lang:codegen
    # (applied in-memory) and the round-trip-through-binary prenorm pipeline
    # no longer converge to the same IR — fail the build so the gap is fixed
    # rather than silently absorbed.
    echo "----------------------------------------"
    echo -e "\033[0;33mVerifying codegen/prenorm output equivalence...\033[0m"
    constraint_failures=0
    for codegen_dir in ./*_codegen; do
      [ -d "$codegen_dir" ] || continue
      codegen_name="$(basename "$codegen_dir")"
      testbase_only="${codegen_name%_codegen}"
      prenorm_name="${testbase_only}_prenorm"
      [ -d "./${prenorm_name}" ] || continue
      for ext in asm.js js php java; do
        f1="${codegen_dir}/${codegen_name}.${ext}"
        f2="./${prenorm_name}/${prenorm_name}.${ext}"
        if [ -f "$f1" ] && [ -f "$f2" ]; then
          tmpfile="$(mktemp)"
          sed "s/${codegen_name}/${prenorm_name}/g" "$f1" > "$tmpfile"
          if ! diff -q "$tmpfile" "$f2" >/dev/null 2>&1; then
            echo -e "  \033[0;31mFAIL\033[0m: ${testbase_only}.${ext} (codegen vs prenorm)" >&2
            constraint_failures=$((constraint_failures + 1))
          fi
          rm -f "$tmpfile"
        fi
      done
    done
    echo "----------------------------------------"
    if [ "$constraint_failures" -gt 0 ]; then
      echo -e "Constraint check: \033[0;31mFAILED\033[0m (${constraint_failures} codegen/prenorm output mismatches)" >&2
      return 1
    fi
    echo -e "Constraint check: \033[0;32mPASSED\033[0m (codegen/prenorm output equivalence)"

    echo -e "\033[1;34mBuild complete.\033[0m"
    return 0
  }
  fn
fi
