#!/bin/sh
# vim: set tabstop=2 shiftwidth=2 expandtab :

set -e

prefix="${0%'.sh'}"
if [ ${#0} -ne ${#prefix} ]; then
  SH_SOURCE="$(cd "$(dirname "$0")" ; pwd -P)"
  EXPECTED_CWD="$(cd "$SH_SOURCE/../test_artifacts" && pwd -P)"
  ACTUAL_CWD="$(pwd -P)"

  fn() {
    local file filename testbase variant_list variant_suffix
    local artifact_dir artifact_base harness_file harness_name harness_variant_name
    local build_languages mangler_key mangler_flag MANGLER_LEN
    local wasm_normalize codegen_normalize codegen_input
    local codegen_dir codegen_name testbase_only prenorm_name ext f1 f2 tmpfile
    local constraint_failures

    local LF="$(printf '\012+')"
    LF="${LF%?}"

    if [ "$ACTUAL_CWD" != "$EXPECTED_CWD" ]; then
      echo -e "\033[0;31mError:\033[0m run from $EXPECTED_CWD (current: $ACTUAL_CWD)" >&2
      return 1
    fi

    # Emit WASM in binary ($1='') or text ($1='text') form, with extension $2.
    emit_wasm_form() {
      cat ./"${testbase}".orig.wast         \
      |                                     \
      node                                  \
        "../wasm2lang.js"                   \
        --normalize-wasm "$wasm_normalize"  \
        --emit-web-assembly $1              \
        --input-file wast:-                 \
        --out-file="${artifact_base}.$2"
    }

    # Emit code for one language, skipping if not in $build_languages.
    #   $1 language-out id    (ASMJS|JAVASCRIPT|PHP64|JAVA)
    #   $2 output extension   (asm.js|js|php|java)
    #   $3 heap-size define   (ASMJS_HEAP_SIZE|JS_HEAP_SIZE|PHP64_HEAP_SIZE|JAVA_HEAP_SIZE)
    emit_language_code() {
      case " $build_languages " in *" $1 "*) ;; *) return 0 ;; esac
      node                                        \
        "../wasm2lang.js"                         \
        --normalize-wasm "$codegen_normalize"     \
        $mangler_flag                             \
        --language-out "$1"                       \
        --define "$3=$((65536 * 8))"              \
        --emit-metadata=memBuffer                 \
        --emit-code=module                        \
        --out-file="${artifact_base}.$2"          \
        $codegen_input
    }

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
        mangler_key="$UNIQUE_MANGLER_KEY"
      else
        MANGLER_LEN=$(( $(od -An -N1 -tu1 /dev/urandom | tr -d ' ') % 25 + 8 ))
        mangler_key="$(head -c 256 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | head -c "$MANGLER_LEN")"
      fi

      # Generate original WAST + shared data (once per test, before variants).
      node                                                  \
        "../tests/$filename"                                \
        --emit-shared-data "./${testbase}.shared.data.json" \
        1>./"${testbase}".orig.wast

      # Per-test language restriction (default: all languages).
      if [ -f "../tests/${testbase}.build.languages" ]; then
        build_languages="$(cat "../tests/${testbase}.build.languages")"
      else
        build_languages="ASMJS JAVASCRIPT PHP64 JAVA"
      fi

      # Read variant list from .build.normalize (one suffix per line) or
      # fall back to the default four-variant set.  Each variant fully
      # defines its own normalization/input pipeline below; the variant
      # suffix alone is enough to identify it.
      #   baseline — raw WASM, no wasm2lang:codegen at all; sanity-checks that
      #              the backend tolerates un-normalized IR and that runtime
      #              memory dumps match the normalized variants.
      #   codegen  — single-pass emission with wasm2lang:codegen applied in
      #              the same process that emits the code.
      #   prenorm  — two-pass: wasm2lang:codegen is applied to emit a
      #              normalized .wasm, then a second invocation reads that
      #              binary with --pre-normalized and emits the code.
      #   nopre    — like prenorm but the second invocation omits
      #              --pre-normalized, exercising the backend's IR-based
      #              fallback for recovering the normalization patterns
      #              after a binary round-trip.
      if [ -f "../tests/${testbase}.build.normalize" ]; then
        variant_list="$(cat "../tests/${testbase}.build.normalize")"
      else
        variant_list="baseline${LF}codegen${LF}prenorm${LF}nopre${LF}nomangle"
      fi

      while IFS=' ' read -r variant_suffix _; do
        [ -n "$variant_suffix" ] || continue
        artifact_dir="${testbase}_${variant_suffix}"
        artifact_base="${artifact_dir}/${artifact_dir}"

        # Variant-specific pipeline selection: each branch fully specifies
        # how the .wasm/.wast is produced (wasm_normalize) and how the code
        # emitter reads it back (codegen_normalize + codegen_input), and
        # whether the code emitter runs with (mangler_flag set) or without
        # (mangler_flag empty) the identifier mangler.  The nomangle variant
        # is the only one that exercises labelN_'s non-mangler path, which
        # must sanitize raw binaryen label names into valid target-language
        # identifiers (e.g. 'folding-inner0' -> '$folding_inner0').
        mangler_flag="--mangler $mangler_key"
        case "$variant_suffix" in
          baseline)
            wasm_normalize="binaryen:none"
            codegen_normalize="binaryen:none"
            codegen_input="--input-file wast:${artifact_base}.wast"
            ;;
          codegen)
            wasm_normalize="binaryen:none"
            codegen_normalize="binaryen:none,wasm2lang:codegen"
            codegen_input="--input-file wast:${artifact_base}.wast"
            ;;
          prenorm)
            wasm_normalize="binaryen:none,wasm2lang:codegen"
            codegen_normalize="binaryen:none"
            codegen_input="--input-file ${artifact_base}.wasm --pre-normalized"
            ;;
          nopre)
            wasm_normalize="binaryen:none,wasm2lang:codegen"
            codegen_normalize="binaryen:none"
            codegen_input="--input-file ${artifact_base}.wasm"
            ;;
          nomangle)
            wasm_normalize="binaryen:none"
            codegen_normalize="binaryen:none,wasm2lang:codegen"
            codegen_input="--input-file wast:${artifact_base}.wast"
            mangler_flag=""
            ;;
          *)
            echo -e "\033[0;31mError:\033[0m unknown variant suffix '$variant_suffix'" >&2
            return 1
            ;;
        esac

        mkdir "$artifact_dir"
        for harness_file in "../tests/${testbase}.harness."*; do
          harness_name="$(basename "$harness_file")"
          harness_variant_name="${artifact_dir}${harness_name#$testbase}"
          cp "$harness_file" "./${artifact_dir}/${harness_variant_name}"
        done

        emit_wasm_form ''     wasm
        emit_wasm_form 'text' wast

        emit_language_code ASMJS      asm.js ASMJS_HEAP_SIZE
        emit_language_code JAVASCRIPT js     JS_HEAP_SIZE
        emit_language_code PHP64      php    PHP64_HEAP_SIZE
        emit_language_code JAVA       java   JAVA_HEAP_SIZE
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
        [ -f "$f1" ] && [ -f "$f2" ] || continue
        tmpfile="$(mktemp)"
        sed "s/${codegen_name}/${prenorm_name}/g" "$f1" > "$tmpfile"
        if ! diff -q "$tmpfile" "$f2" >/dev/null 2>&1; then
          echo -e "  \033[0;31mFAIL\033[0m: ${testbase_only}.${ext} (codegen vs prenorm)" >&2
          constraint_failures=$((constraint_failures + 1))
        fi
        rm -f "$tmpfile"
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
