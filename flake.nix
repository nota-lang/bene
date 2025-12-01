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

        # Get Rust toolchain from rust-toolchain.toml
        rustToolchain = pkgs.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml;

        # Get depot from its flake
        depotPkg = depot.packages.${system}.default;

        # Select pnpm version
        pnpm = pkgs.pnpm_9;  # pnpm 9.x should be compatible with 10.18.0

        # Pre-fetch pnpm dependencies
        pnpmDeps = pnpm.fetchDeps {
          pname = "bene-frontend-deps";
          version = "0.1.0";
          src = ./js;
          hash = "sha256-gk68QD0iaRoHquV6T6hVhdGDq4DNQ1n3RrxUgjzbarw=";
          fetcherVersion = 2;  # Required for pnpm.fetchDeps
        };

        # Common dependencies for Tauri builds
        tauriBuildInputs = with pkgs; [
          gtk3
          webkitgtk_4_1
          libsoup_3
        ];

        tauriNativeBuildInputs = with pkgs; [
          pkg-config
          wrapGAppsHook4  # Ensures proper GTK environment
        ];

      in
      {
        # Default package: Desktop Tauri application
        packages.default = pkgs.stdenv.mkDerivation {
          pname = "bene";
          version = "0.1.0";

          src = pkgs.lib.fileset.toSource {
            root = ./.;
            fileset = pkgs.lib.fileset.gitTracked ./.;
          };

          nativeBuildInputs = [
            rustToolchain
            pkgs.cargo-tauri
            pkgs.rustPlatform.cargoSetupHook
            # JavaScript build tools needed by Tauri's beforeBuildCommand
            pkgs.nodejs_22
            pnpm              # Use our selected pnpm
            pnpm.configHook   # Add config hook
            depotPkg
          ] ++ tauriNativeBuildInputs;

          buildInputs = tauriBuildInputs;

          # Reference pre-fetched pnpm dependencies
          inherit pnpmDeps;

          # Fetch Cargo dependencies ahead of time for reproducibility
          cargoDeps = pkgs.rustPlatform.fetchCargoVendor {
            src = ./rs;
            name = "bene-cargo-deps";
            hash = "sha256-lDr5qQhlGWf8mPgYWNthm0zikR3uyaWgUOL/cL5J1lo=";
          };

          cargoRoot = "rs";

          # Configure pnpm to use the js/ directory
          pnpmRoot = "js";

          # Set up environment for pnpm and depot
          preBuild = ''
            export HOME=$TMPDIR
            export PNPM_HOME=$TMPDIR/.pnpm
            mkdir -p $PNPM_HOME

            # Step 1: Generate TypeScript bindings from Rust
            echo "Generating TypeScript bindings..."
            cd rs
            cargo test -p bene-epub export_bindings --release
            cp -r crates/bene-epub/bindings ../js/packages/bene-common/src/
            cd ..

            # Step 2: Install pnpm dependencies (offline mode uses pre-fetched store)
            echo "Installing pnpm dependencies..."
            cd js
            pnpm install --frozen-lockfile --offline

            # Step 3: Build frontend with depot
            echo "Building frontend with depot..."
            depot -p bene-desktop build --release

            # Verify frontend build succeeded
            if [ ! -d packages/bene-desktop/dist ]; then
              echo "Error: bene-desktop dist directory not found"
              exit 1
            fi

            if [ ! -d packages/bene-reader/dist ]; then
              echo "Error: bene-reader dist directory not found"
              exit 1
            fi

            cd ..

            # Step 4: Disable Tauri's beforeBuildCommand since frontend is already built
            echo "Modifying Tauri.toml to skip beforeBuildCommand..."
            cd rs/crates/bene-app
            grep -v "^beforeBuildCommand" Tauri.toml > Tauri.toml.nix
            mv Tauri.toml.nix Tauri.toml
            cd ../../..
          '';

          buildPhase = ''
            runHook preBuild

            # Build Tauri desktop application
            echo "Building Tauri application..."
            cd rs
            cargo tauri build --bundles deb

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            # Go back to source root (buildPhase ends in rs/ directory)
            cd ..

            # Install the deb package
            mkdir -p $out/share/packages
            find rs/target/release/bundle/deb -name "*.deb" -exec cp {} $out/share/packages/ \;

            # Extract and install the binary from the deb
            mkdir -p $out/bin
            cd rs/target/release/bundle/deb
            ${pkgs.dpkg}/bin/dpkg-deb -x *.deb $TMPDIR/deb-extract

            # The binary is typically in usr/bin within the deb
            find $TMPDIR/deb-extract/usr/bin -type f -executable -exec cp {} $out/bin/bene \; || true

            # Install bundled resources (bene-reader directory)
            # Resources are in usr/lib/{product-name}/ in the deb
            # Product name is "Bene Reader" (with space) from Tauri.toml
            mkdir -p "$out/lib/Bene Reader"
            if [ -d "$TMPDIR/deb-extract/usr/lib/Bene Reader" ]; then
              cp -r "$TMPDIR/deb-extract/usr/lib/Bene Reader"/* "$out/lib/Bene Reader/"
              echo "Installed resources to $out/lib/Bene Reader/"
              ls -la "$out/lib/Bene Reader/"
            else
              echo "WARNING: Resources directory not found in deb package"
              echo "Searched for: $TMPDIR/deb-extract/usr/lib/Bene Reader"
              echo "Available directories:"
              find $TMPDIR/deb-extract/usr/lib -type d -maxdepth 2 || true
              exit 1
            fi

            # Install desktop file
            mkdir -p $out/share/applications
            if [ -d $TMPDIR/deb-extract/usr/share/applications ]; then
              find $TMPDIR/deb-extract/usr/share/applications -name "*.desktop" -exec cp {} $out/share/applications/ \;
            fi

            # Install icons
            if [ -d $TMPDIR/deb-extract/usr/share/icons ]; then
              mkdir -p $out/share/icons
              cp -r $TMPDIR/deb-extract/usr/share/icons/* $out/share/icons/ || true
            fi

            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "An EPUB reading system";
            homepage = "https://github.com/nota-lang/bene";
            license = with licenses; [ mit asl20 ];
            platforms = platforms.linux;
            mainProgram = "bene";
          };
        };

        # Development shell with all tools
        devShells.default = pkgs.mkShell {
          buildInputs = [
            # Rust toolchain (from rust-toolchain.toml)
            rustToolchain

            # Rust tools
            pkgs.cargo-tauri
            pkgs.wasm-pack

            # JavaScript tools
            pkgs.nodejs_22
            pkgs.pnpm
            depotPkg

            # Build tools
            pkgs.just

            # Development tools
            pkgs.rust-analyzer

          ] ++ tauriBuildInputs ++ tauriNativeBuildInputs;

          # Environment setup
          RUST_SRC_PATH = "${rustToolchain}/lib/rustlib/src/rust/library";
          LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath tauriBuildInputs;

          shellHook = ''
            echo "🦀 Bene development environment"
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
        };

        # Formatter for `nix fmt`
        formatter = pkgs.nixpkgs-fmt;
      });
}
