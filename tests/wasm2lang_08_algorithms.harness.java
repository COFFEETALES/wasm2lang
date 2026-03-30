// Java test harness for wasm2lang_08_algorithms.
{
    WasmModule mod = new WasmModule(new java.util.LinkedHashMap<>(), memBuffer);
    mod.alignHeapTop();
    mod.initCrc32Tables();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (Double v : w2lFlat(_data, "factorial_inputs")) {
        mod.exerciseFactorial(v.intValue());
    }

    for (Double v : w2lFlat(_data, "fibonacci_inputs")) {
        mod.exerciseFibonacci(v.intValue());
    }

    for (Double v : w2lFlat(_data, "collatz_inputs")) {
        mod.exerciseCollatz(v.intValue());
    }

    for (java.util.List<Double> pair : w2lNested(_data, "gcd_inputs")) {
        mod.exerciseGcd(pair.get(0).intValue(), pair.get(1).intValue());
    }

    for (java.util.List<Double> pair : w2lNested(_data, "select_inputs")) {
        mod.exerciseSelect(pair.get(0).intValue(), pair.get(1).intValue());
    }

    for (Double v : w2lFlat(_data, "bitwise_inputs")) {
        mod.exerciseBitwise(v.intValue());
    }

    @SuppressWarnings("unchecked")
    java.util.List<String> stringInputs = (java.util.List<String>) _data.get("string_inputs");
    int scratch = 1088;
    for (String str : stringInputs) {
        byte[] bytes = str.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        for (int i = 0; i < bytes.length; i++) {
            memBuffer.put(scratch + i, bytes[i]);
        }
        memBuffer.put(scratch + bytes.length, (byte) 0);
        mod.exerciseString(scratch);
    }

    @SuppressWarnings("unchecked")
    java.util.List<String> crc32Inputs = (java.util.List<String>) _data.get("crc32_inputs");
    for (String str : crc32Inputs) {
        byte[] bytes = str.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        for (int i = 0; i < bytes.length; i++) {
            memBuffer.put(scratch + i, bytes[i]);
        }
        mod.exerciseCrc32(scratch, bytes.length);
    }

    mod.exerciseMemory(scratch);

    w2lDumpCRC(memBuffer);
}

/exit
