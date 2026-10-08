// The URL of onnxruntime's WebAssembly file, as Vite bundles it (the package does not export the file, so it is
// reached by path). A module of its own so it is only fetched with the offline reading engine.
export default new URL('../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', import.meta.url).href;
