{
    WasmModule mod = new WasmModule(new java.util.LinkedHashMap<>(), memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));
    @SuppressWarnings("unchecked")
    java.util.List<String> inputs = (java.util.List<String>) _data.get("crc32_inputs");
    int scratch = 0;

    for (String str : inputs) {
        byte[] bytes = str.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        for (int i = 0; i < bytes.length; i++) {
            memBuffer.put(scratch + i, bytes[i]);
        }
        mod.exerciseCrc32(scratch, bytes.length);
    }

    w2lDumpCRC(memBuffer);
}

/exit
