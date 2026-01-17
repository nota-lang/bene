# Bene - An EPUB reading system
#
# Usage:
#   nix build              - Build using pre-built binary from GitHub releases (fast)
#   nix build .#from-source - Build from source (slow, for testing patches)
#   nix develop            - Enter development shell with Rust, Node, pnpm, depot
#   nix run -- /path/to.epub - Run the reader directly
#
# The default package downloads the .deb from GitHub releases and patches it
# for NixOS using autoPatchelfHook. Only x86_64-linux is supported for the
# binary package.
#
# To update to a new release:
#   1. Update version in nix/bene-bin.nix
#   2. Run: nix-prefetch-url https://github.com/nota-lang/bene/releases/download/v<VERSION>/Bene.Reader_<VERSION>_amd64.deb
#   3. Convert hash: nix hash convert --hash-algo sha256 <hash>
#   4. Update hash in nix/bene-bin.nix
#
{
  description = "Bene - An EPUB reading system with Rust backend and JavaScript frontend";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    depot = {
      url = "github:cognitive-engineering-lab/depot";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay, depot }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        rustToolchain = pkgs.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml;
        depotPkg = depot.packages.${system}.default;

        src = pkgs.lib.fileset.toSource {
          root = ./.;
          fileset = pkgs.lib.fileset.gitTracked ./.;
        };
      in
      {
        # Default package: Pre-built binary (fast, recommended)
        packages.default = pkgs.callPackage ./nix/bene-bin.nix { };

        # From-source build (for development/testing patches)
        packages.from-source = pkgs.callPackage ./nix/bene-src.nix {
          inherit rustToolchain depotPkg src;
          pnpm = pkgs.pnpm_9;
        };

        # Development shell with all tools
        devShells.default = pkgs.callPackage ./nix/devshell.nix {
          inherit rustToolchain depotPkg;
        };

        # Formatter for `nix fmt`
        formatter = pkgs.nixpkgs-fmt;
      });
}
