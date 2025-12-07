[working-directory: 'rs']
gen-bindings:
  cargo test -p bene-epub export_bindings
  cp -r crates/bene-epub/bindings ../js/packages/bene-types/src/

[working-directory: 'rs']
build-native: gen-bindings
  cargo tauri build

[working-directory: 'rs']
dev-native: gen-bindings
  cargo tauri dev

[working-directory: 'js']
build-wasm: gen-bindings
  depot -p bene-web build

[working-directory: 'js']
test-js: gen-bindings
  depot test

[working-directory: 'rs']
test-rs:
  cargo test

test: test-js test-rs