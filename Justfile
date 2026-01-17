[working-directory: 'rs']
gen-bindings:
  cargo test -p bene-epub export_bindings
  cp -r crates/bene-epub/bindings ../js/packages/bene-types/src/

[working-directory: 'js']
build: gen-bindings
  depot -p bene-reader build
  depot -p bene-desktop build

[working-directory: 'rs']
build-native: gen-bindings
  cargo tauri build

[working-directory: 'rs']
dev-native: gen-bindings
  cargo tauri dev

[working-directory: 'js']
build-wasm: gen-bindings
  depot -p bene-web build --release

[working-directory: 'js']
test-js: gen-bindings
  depot test

[working-directory: 'rs']
test-rs:
  cargo test

[working-directory: 'epubs']
build-demo-epub:
  ./make-epub.sh portable-epubs
  cp portable-epubs.epub ../js/packages/bene-web/public

build-demo-site: build-demo-epub build-wasm

test: test-js test-rs