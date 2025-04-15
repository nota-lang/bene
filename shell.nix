let
  nixpkgs = fetchTarball "https://github.com/NixOS/nixpkgs/tarball/nixos-24.11";
  rust-overlay = fetchTarball "https://github.com/oxalica/rust-overlay/archive/7af16cbd1464fddde8ad0c4ed7baaa2292445ba4.tar.gz";

  pkgs = import nixpkgs {overlays = [(import rust-overlay)];};

  depot = (builtins.getFlake "https://github.com/cognitive-engineering-lab/depot/tarball/main").packages.x86_64-linux.default;
in
  pkgs.mkShell {
    packages = with pkgs; [
      cargo
      cargo-tauri
      rustc
      lld
      # (rust-bin.stable.latest.default.override {
      #   extensions = [];
      #   targets = ["wasm32-wasip1"];
      # })

      depot
      nodejs-slim_23
      pnpm
      # biome
      wasm-pack
    ];
  }
