// Java test harness for wasm2lang_08_algorithms.
{
    WasmModule mod = new WasmModule(new java.util.LinkedHashMap<>(), memBuffer);
    mod.alignHeapTop();
    mod.initCrc32Tables();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (Double v : w2lFlat(_data, "factorial_inputs")) {
        mod.exerciseFactorial(v.intValue());
    }

    @SuppressWarnings("unchecked")
    java.util.List<String> crc32Inputs = (java.util.List<String>) _data.get("crc32_inputs");
    int scratch = 1088;
    for (String str : crc32Inputs) {
        byte[] bytes = str.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        for (int i = 0; i < bytes.length; i++) {
            memBuffer.put(scratch + i, bytes[i]);
        }
        mod.exerciseCrc32(scratch, bytes.length);
    }

    w2lDumpCRC(memBuffer);
}

/exit
