// Java test harness for a module whose only SIMD instructions are
// v128.load and v128.store.
{
    String generatedSIMD = w2lReadSource(System.getProperty("w2l.testname", ""));
    if (!generatedSIMD.contains("import jdk.incubator.vector.*;")) {
        throw new AssertionError("memory-only SIMD module lacks its Vector API import");
    }
    if (generatedSIMD.contains("new int[")) {
        throw new AssertionError("memory-only SIMD helpers allocate an int array");
    }
    if (!generatedSIMD.contains("ByteOrder.nativeOrder() == java.nio.ByteOrder.LITTLE_ENDIAN")) {
        throw new AssertionError("memory-only SIMD fast path lacks its native-endian guard");
    }
    if (!generatedSIMD.contains(".getLong(") || !generatedSIMD.contains(".putLong(")) {
        throw new AssertionError("memory-only SIMD copy fallback is missing");
    }

    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();
    WasmModule mod = new WasmModule(foreign, memBuffer);
    for (int alignment = 0; alignment < 16; ++alignment) {
        int src = 256 + alignment;
        int dst = 512 + alignment;
        for (int i = 0; i < 16; ++i) {
            memBuffer.put(src + i, (byte)(alignment * 19 + i * 11 + 5));
            memBuffer.put(dst + i, (byte)0x55);
        }
        mod.copySIMD16(src, dst);
        for (int i = 0; i < 16; ++i) {
            if (memBuffer.get(dst + i) != (byte)(alignment * 19 + i * 11 + 5)) {
                throw new AssertionError("memory-only SIMD copy mismatch");
            }
        }
    }
    if (mod.copySIMD16Effectful(256, 512) != 12) {
        throw new AssertionError("fused SIMD copy changed destination/source evaluation order");
    }
    boolean trapped = false;
    try {
        mod.copySIMD16Effectful(-1, memBuffer.limit() - 15);
    } catch (IndexOutOfBoundsException expected) {
        trapped = true;
    }
    if (!trapped || mod.getCopyTrace() != 12) {
        throw new AssertionError("fused SIMD copy changed pointer evaluation before a trap");
    }

    w2lDumpCRC(memBuffer);
}

/exit
