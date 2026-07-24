// Java test harness for wasm2lang_14_simd.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));
    String generatedSIMD = w2lReadSource(System.getProperty("w2l.testname", ""));
    if (generatedSIMD.contains("new int[")) {
        throw new AssertionError("generated v128 operations allocate an int array");
    }
    if (!generatedSIMD.contains("ByteVector.fromArray") ||
        !generatedSIMD.contains(".reinterpretAsBytes().intoArray(")) {
        throw new AssertionError("generated v128 heap-buffer fast path is missing");
    }
    if (!generatedSIMD.contains("ByteOrder.nativeOrder() == java.nio.ByteOrder.LITTLE_ENDIAN")) {
        throw new AssertionError("generated v128 fast path lacks its native-endian guard");
    }

    for (java.util.List<Double> q : w2lNested(_data, "quads")) {
        mod.exerciseSIMDLanes(q.get(0).intValue(), q.get(1).intValue(), q.get(2).intValue(), q.get(3).intValue());
    }
    for (java.util.List<Double> p : w2lNested(_data, "pairs")) {
        mod.exerciseSIMDArithmetic(p.get(0).intValue(), p.get(1).intValue());
    }
    for (java.util.List<Double> p : w2lNested(_data, "pairs")) {
        mod.exerciseSIMDBitwise(p.get(0).intValue(), p.get(1).intValue());
    }
    for (java.util.List<Double> p : w2lNested(_data, "shift_pairs")) {
        mod.exerciseSIMDShift(p.get(0).intValue(), p.get(1).intValue());
    }
    for (java.util.List<Double> p : w2lNested(_data, "pairs")) {
        mod.exerciseSIMDCompare(p.get(0).intValue(), p.get(1).intValue());
    }
    for (java.util.List<Double> q : w2lNested(_data, "quads")) {
        mod.exerciseSIMDShuffle(q.get(0).intValue(), q.get(1).intValue(), q.get(2).intValue(), q.get(3).intValue());
    }
    for (java.util.List<Double> q : w2lNested(_data, "quads")) {
        mod.exerciseSIMDMemory(q.get(0).intValue(), q.get(1).intValue(), q.get(2).intValue(), q.get(3).intValue());
    }

    int simdCapacity = memBuffer.limit();
    int simdBase = simdCapacity - 256;
    for (int alignment = 0; alignment < 16; ++alignment) {
        int src = simdBase + alignment;
        int dst = simdBase + 64 + alignment;
        for (int i = 0; i < 16; ++i) {
            memBuffer.put(src + i, (byte)(alignment * 17 + i * 13 + 3));
            memBuffer.put(dst + i, (byte)0xa5);
        }
        mod.copySIMD16(src, dst);
        for (int i = 0; i < 16; ++i) {
            byte expected = (byte)(alignment * 17 + i * 13 + 3);
            if (memBuffer.get(dst + i) != expected) {
                throw new AssertionError("unaligned heap v128 copy mismatch");
            }
        }
    }

    int lastValid = simdCapacity - 16;
    int validSource = simdBase + 128;
    for (int i = 0; i < 16; ++i) {
        memBuffer.put(validSource + i, (byte)(i * 7 + 1));
        memBuffer.put(lastValid + i, (byte)0x6d);
    }
    mod.copySIMD16(validSource, lastValid);
    for (int i = 0; i < 16; ++i) {
        if (memBuffer.get(lastValid + i) != (byte)(i * 7 + 1)) {
            throw new AssertionError("last-valid v128 copy mismatch");
        }
    }

    int validDestination = simdBase + 160;
    for (int i = 0; i < 16; ++i) memBuffer.put(validDestination + i, (byte)0x5c);
    boolean trapped = false;
    try {
        mod.copySIMD16(simdCapacity - 15, validDestination);
    } catch (IndexOutOfBoundsException expected) {
        trapped = true;
    }
    if (!trapped) throw new AssertionError("out-of-bounds v128 load did not trap");
    for (int i = 0; i < 16; ++i) {
        if (memBuffer.get(validDestination + i) != (byte)0x5c) {
            throw new AssertionError("failed v128 load modified its destination");
        }
    }
    trapped = false;
    try {
        mod.copySIMD16(-1, validDestination);
    } catch (IndexOutOfBoundsException expected) {
        trapped = true;
    }
    if (!trapped) throw new AssertionError("negative v128 load did not trap");

    for (int i = 0; i < 15; ++i) memBuffer.put(simdCapacity - 15 + i, (byte)0x37);
    trapped = false;
    try {
        mod.copySIMD16(validSource, simdCapacity - 15);
    } catch (IndexOutOfBoundsException expected) {
        trapped = true;
    }
    if (!trapped) throw new AssertionError("out-of-bounds v128 store did not trap");
    for (int i = 0; i < 15; ++i) {
        if (memBuffer.get(simdCapacity - 15 + i) != (byte)0x37) {
            throw new AssertionError("failed v128 store wrote a partial vector");
        }
    }
    trapped = false;
    try {
        mod.copySIMD16(validSource, -1);
    } catch (IndexOutOfBoundsException expected) {
        trapped = true;
    }
    if (!trapped) throw new AssertionError("negative v128 store did not trap");

    // This checks the wasm semantics of one v128.store(v128.load(...))
    // expression only. It does not define aliasing for a multi-iteration copy.
    int overlap = simdBase + 192;
    for (int i = 0; i < 32; ++i) memBuffer.put(overlap + i, (byte)(0x20 + i));
    mod.copySIMD16(overlap, overlap + 8);
    for (int i = 0; i < 16; ++i) {
        if (memBuffer.get(overlap + 8 + i) != (byte)(0x20 + i)) {
            throw new AssertionError("overlapping v128 load/store lost source bytes");
        }
    }

    // Direct buffers use the allocation-free scalar fallback. Keep the
    // default big-endian order to verify that wasm lane bytes stay LE.
    java.nio.ByteBuffer direct = java.nio.ByteBuffer.allocateDirect(96);
    for (int i = 0; i < direct.capacity(); ++i) direct.put(i, (byte)0x4a);
    for (int i = 0; i < 16; ++i) direct.put(3 + i, (byte)(0x11 + i * 0x11));
    WasmModule directMod = new WasmModule(foreign, direct);
    if (directMod.readSIMDLane0(3) != 0x44332211) {
        throw new AssertionError("direct big-endian v128 load changed wasm byte order");
    }
    directMod.copySIMD16(3, 43);
    for (int i = 0; i < 16; ++i) {
        if (direct.get(43 + i) != (byte)(0x11 + i * 0x11)) {
            throw new AssertionError("direct-buffer v128 copy mismatch");
        }
    }
    directMod.storeSIMDPattern(64);
    for (int i = 0; i < 16; ++i) {
        if (direct.get(64 + i) != (byte)i) {
            throw new AssertionError("direct big-endian v128 store changed wasm byte order");
        }
    }

    // A writable heap slice must use its own offset and limit, not the
    // backing array's wider bounds.
    java.nio.ByteBuffer heapParent = java.nio.ByteBuffer.allocate(112);
    for (int i = 0; i < heapParent.capacity(); ++i) heapParent.put(i, (byte)0x6a);
    heapParent.position(7);
    heapParent.limit(87);
    java.nio.ByteBuffer heapSlice = heapParent.slice().order(java.nio.ByteOrder.BIG_ENDIAN);
    for (int i = 0; i < 16; ++i) heapSlice.put(1 + i, (byte)(0x70 + i));
    WasmModule sliceMod = new WasmModule(foreign, heapSlice);
    sliceMod.copySIMD16(1, 41);
    for (int i = 0; i < 16; ++i) {
        if (heapSlice.get(41 + i) != (byte)(0x70 + i)) {
            throw new AssertionError("heap-slice v128 copy ignored arrayOffset");
        }
    }
    sliceMod.storeSIMDPattern(64);
    for (int i = 0; i < 16; ++i) {
        if (heapSlice.get(64 + i) != (byte)i) {
            throw new AssertionError("heap-slice v128 store mismatch");
        }
    }
    heapParent.limit(heapParent.capacity());
    for (int i = 57; i <= 80; ++i) heapParent.put(7 + i, (byte)0x6a);
    heapSlice.limit(72);
    trapped = false;
    try {
        sliceMod.storeSIMDPattern(57);
    } catch (IndexOutOfBoundsException expected) {
        trapped = true;
    }
    if (!trapped) throw new AssertionError("heap-slice limit did not bound v128 store");
    for (int i = 57; i <= 80; ++i) {
        if (heapParent.get(7 + i) != (byte)0x6a) {
            throw new AssertionError("failed heap-slice store escaped its limit");
        }
    }

    // Read-only buffers remain valid load sources and reject a store before
    // any backing bytes can change.
    java.nio.ByteBuffer readOnlyParent = java.nio.ByteBuffer.allocate(64);
    for (int i = 0; i < readOnlyParent.capacity(); ++i) readOnlyParent.put(i, (byte)0x2d);
    readOnlyParent.put(5, (byte)0x11);
    readOnlyParent.put(6, (byte)0x22);
    readOnlyParent.put(7, (byte)0x33);
    readOnlyParent.put(8, (byte)0x44);
    java.nio.ByteBuffer readOnly = readOnlyParent.asReadOnlyBuffer().order(java.nio.ByteOrder.BIG_ENDIAN);
    WasmModule readOnlyMod = new WasmModule(foreign, readOnly);
    if (readOnlyMod.readSIMDLane0(5) != 0x44332211) {
        throw new AssertionError("read-only v128 load mismatch");
    }
    trapped = false;
    try {
        readOnlyMod.storeSIMDPattern(32);
    } catch (java.nio.ReadOnlyBufferException expected) {
        trapped = true;
    }
    if (!trapped) throw new AssertionError("read-only v128 store did not trap");
    for (int i = 32; i < 48; ++i) {
        if (readOnlyParent.get(i) != (byte)0x2d) {
            throw new AssertionError("read-only v128 store modified backing bytes");
        }
    }

    mod.exerciseSIMDEdgeCases();
    mod.exerciseSIMDSelectEvaluation();

    w2lDumpCRC(memBuffer);
}

/exit
