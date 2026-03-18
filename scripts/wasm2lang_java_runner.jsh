// wasm2lang jshell test runner + JSON data loader.
//
// Requires Gson on --class-path and w2l.testname system property.
// Loaded BEFORE harness files so helpers are available to them.

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

@SuppressWarnings("unchecked")
java.util.Map<String, Object> w2lLoadSharedData(String testName) {
    if (testName == null || testName.isEmpty()) return java.util.Collections.emptyMap();
    String base = testName.contains("/") ? testName.substring(testName.lastIndexOf('/') + 1) : testName;
    base = base.replaceAll("_(codegen|none)$", "");
    try {
        String c = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(base + ".shared.data.json")));
        return (java.util.Map<String, Object>) new Gson().fromJson(c, new TypeToken<java.util.Map<String, Object>>(){}.getType());
    } catch (Exception e) {
        return java.util.Collections.emptyMap();
    }
}

@SuppressWarnings("unchecked")
java.util.List<Double> w2lFlat(java.util.Map<String, Object> data, String key) {
    Object v = data.get(key);
    return v != null ? (java.util.List<Double>) v : java.util.Collections.emptyList();
}

@SuppressWarnings("unchecked")
java.util.List<java.util.List<Double>> w2lNested(java.util.Map<String, Object> data, String key) {
    Object v = data.get(key);
    return v != null ? (java.util.List<java.util.List<Double>>) v : java.util.Collections.emptyList();
}

void w2lDumpCRC(java.nio.ByteBuffer buf) {
    java.util.zip.CRC32 crc = new java.util.zip.CRC32();
    byte[] arr = new byte[buf.capacity()];
    buf.position(0);
    buf.get(arr);
    buf.position(0);
    crc.update(arr);
    System.out.println("Memory CRC32: 0x" + String.format("%08x", crc.getValue()));
}
