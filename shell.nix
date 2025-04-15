let
  nixpkgs = fetchTarball "https://github.com/NixOS/nixpkgs/tarball/nixos-24.11";
  rust-overlay = fetchTarball "https://github.com/oxalica/rust-overlay/archive/7af16cbd1464fddde8ad0c4ed7baaa2292445ba4.tar.gz";

  pkgs = import nixpkgs {overlays = [(import rust-overlay)];};

  depot = (builtins.getFlake "https://github.com/cognitive-engineering-lab/depot/tarball/main").packages.x86_64-linux.default;
in
  pkgs.mkShell {
    nativeBuildInputs = [
      pkgs.openssl
      pkgs.gobject-introspection
      pkgs.gtk3
      pkgs.gtk3.dev
      pkgs.atk
      pkgs.glib
      pkgs.cairo
      pkgs.gdk-pixbuf
      pkgs.libsoup_3
      pkgs.webkitgtk_4_1
      pkgs.pango
      pkgs.pango.dev
    ];

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

    PKG_CONFIG_PATH = pkgs.lib.concatStringsSep ":" [
      "${pkgs.openssl.dev}/lib/pkgconfig"
      "${pkgs.gobject-introspection.dev}/lib/pkgconfig"
      "${pkgs.gtk3.dev}/lib/pkgconfig"
      "${pkgs.atk.dev}/lib/pkgconfig"
      "${pkgs.glib.dev}/lib/pkgconfig"
      "${pkgs.cairo.dev}/lib/pkgconfig"
      "${pkgs.gdk-pixbuf.dev}/lib/pkgconfig"
      "${pkgs.libsoup_3.dev}/lib/pkgconfig"
      "${pkgs.webkitgtk_4_1.dev}/lib/pkgconfig"
      "${pkgs.pango.dev}/lib/pkgconfig"
    ];
  }
