# Bene: An EPUB Reading System

Bene is a reading system for documents written in the [EPUB](https://www.w3.org/TR/epub-overview-33/) file format. You can try a live demo of Bene here: <https://nota-lang.github.io/bene/>

**Development Status:** Bene is a research prototype. Don't expect it to work reliably yet.

## Setup

Currently, the only supported setup is installation from source. You will need at least [Rust](https://rustup.rs/) and [Depot](https://github.com/cognitive-engineering-lab/depot?tab=readme-ov-file#installation).

Bene is distributed as a web app and a desktop app.

### Using Justfile Commands

If you have [just](https://github.com/casey/just) installed, you can use the provided Justfile commands:

```bash
# Build the web app
just build-wasm

# Build the desktop app
just build-native

# Run the desktop app in development mode
just dev-native
```

### Manual Setup

If you prefer not to use `just`, follow the instructions below.

#### Web App

You will need [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/). Then run:

```
cd bene/js
depot -p bene-web build --release
```

Then you can serve the web app by running:

```
cd packages/bene-web/dist
python -m http.server
```

And visit <http://localhost:8000/>. You can replace the `python` command with however you like to serve static files.

#### Desktop App

You will need the [Tauri](https://tauri.app/) CLI, which you can install by running:

```
cargo install tauri-cli
```

The desktop app requires both the `bene-reader` and `bene-desktop` JavaScript packages to be built. Run:

```bash
# Generate Rust/TypeScript bindings
cd rs
cargo test -p bene-epub export_bindings
cp -r crates/bene-epub/bindings ../js/packages/bene-common/src/

# Build the JavaScript packages
cd ../js
depot -p bene-reader build --release
depot -p bene-desktop build --release

# Build or run the desktop app
cd ../rs
cargo tauri build  # or cargo tauri dev for development
```