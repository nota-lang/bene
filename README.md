# Bene: An EPUB Reading System

Bene is a reading system for documents written in the [EPUB](https://www.w3.org/TR/epub-overview-33/) file format. You can try a live demo of Bene here: <https://nota-lang.github.io/bene/>

**Development Status:** Bene is a research prototype. Don't expect it to work reliably yet.

## Setup

Currently, the only supported setup is installation from source. You will need at least [Rust](https://rustup.rs/) and [Depot](https://github.com/cognitive-engineering-lab/depot?tab=readme-ov-file#installation).

Bene is distributed as a web app and a desktop app. 

### Web App

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

### Desktop App

You will need the [Tauri](https://tauri.app/) CLI, which you can install by running:

```
cargo install tauri-cli
```

Then run:

```
cd rs
cargo tauri build
```

This will generate a binary you can use on your system. I have only tested this on MacOS and it only kind of works, so I would just use the web app for now.