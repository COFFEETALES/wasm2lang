// Java test harness for wasm2lang_16_lookup_tables.
{
    WasmModule mod = new WasmModule(new java.util.LinkedHashMap<>(), memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (Double n : w2lFlat(_data, "square_inputs")) {
        mod.exerciseSquares(n.intValue());
    }

    for (Double needle : w2lFlat(_data, "binary_search_needles")) {
        mod.exerciseBinarySearch(needle.intValue());
    }

    for (Double n : w2lFlat(_data, "fib_memo_inputs")) {
        mod.exerciseFibMemo(n.intValue());
    }

    for (Double n : w2lFlat(_data, "bit_pattern_inputs")) {
        mod.exerciseBitPatterns(n.intValue());
    }

    @SuppressWarnings("unchecked")
    java.util.List<String> crc32Strings = (java.util.List<String>) _data.get("crc32_strings");
    int scratch = 1536;
    for (String str : crc32Strings) {
        byte[] bytes = str.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        for (int i = 0; i < bytes.length; i++) {
            memBuffer.put(scratch + i, bytes[i]);
        }
        mod.exerciseCrc32PreCalc(scratch, bytes.length);
    }

    w2lDumpCRC(memBuffer);
}

/exit
