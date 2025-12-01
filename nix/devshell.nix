# Development shell for Bene
{ mkShell
, lib
, rustToolchain
, depotPkg
, cargo-tauri
, wasm-pack
, nodejs_22
, pnpm
, just
, rust-analyzer
, pkg-config
, wrapGAppsHook4
, gtk3
, webkitgtk_4_1
, libsoup_3
}:

let
  tauriBuildInputs = [
    gtk3
    webkitgtk_4_1
    libsoup_3
  ];

  tauriNativeBuildInputs = [
    pkg-config
    wrapGAppsHook4
  ];
in
mkShell {
  buildInputs = [
    # Rust toolchain (from rust-toolchain.toml)
    rustToolchain

    # Rust tools
    cargo-tauri
    wasm-pack

    # JavaScript tools
    nodejs_22
    pnpm
    depotPkg

    # Build tools
    just

    # Development tools
    rust-analyzer

  ] ++ tauriBuildInputs ++ tauriNativeBuildInputs;

  # Environment setup
  RUST_SRC_PATH = "${rustToolchain}/lib/rustlib/src/rust/library";
  LD_LIBRARY_PATH = lib.makeLibraryPath tauriBuildInputs;

  shellHook = ''
    echo "Bene development environment"
    echo ""
    echo "Versions:"
    echo "  Rust: $(rustc --version)"
    echo "  Node: $(node --version)"
    echo "  pnpm: $(pnpm --version)"
    echo "  depot: $(depot --version)"
    echo ""
    echo "Available commands:"
    echo "  just build-native  - Build Tauri desktop app"
    echo "  just build-wasm    - Build web app"
    echo "  just dev-native    - Run desktop app in dev mode"
    echo "  just test          - Run all tests"
    echo "  just gen-bindings  - Generate TypeScript bindings"
    echo ""
    echo "Targets available:"
    rustup target list --installed | grep -E '(wasm|x86)'
  '';
}
