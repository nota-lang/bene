# Build Bene from source
# This is the original build process, kept for development and testing patches
{ lib
, stdenv
, rustToolchain
, depotPkg
, pnpm
, nodejs_22
, cargo-tauri
, rustPlatform
, pkg-config
, wrapGAppsHook4
, gtk3
, webkitgtk_4_1
, libsoup_3
, dpkg
, src
}:

let
  pnpmDeps = pnpm.fetchDeps {
    pname = "bene-frontend-deps";
    version = "0.1.0";
    src = src + "/js";
    hash = "sha256-xadUV/A8rWPc0yHewU/BQxgl6gkgvf4OQPsPghbaYKA=";
    fetcherVersion = 2;
  };
in
stdenv.mkDerivation {
  pname = "bene";
  version = "0.1.0";

  inherit src;

  nativeBuildInputs = [
    rustToolchain
    cargo-tauri
    rustPlatform.cargoSetupHook
    nodejs_22
    pnpm
    pnpm.configHook
    depotPkg
    pkg-config
    wrapGAppsHook4
  ];

  buildInputs = [
    gtk3
    webkitgtk_4_1
    libsoup_3
  ];

  inherit pnpmDeps;

  cargoDeps = rustPlatform.fetchCargoVendor {
    src = src + "/rs";
    name = "bene-cargo-deps";
    hash = "sha256-y42Jy1aTZv9/syrN207WiJiI7J3RCN7EFkP8r/OVd+g=";
  };

  cargoRoot = "rs";
  pnpmRoot = "js";

  preBuild = ''
    export HOME=$TMPDIR
    export PNPM_HOME=$TMPDIR/.pnpm
    mkdir -p $PNPM_HOME

    # Step 1: Generate TypeScript bindings from Rust
    echo "Generating TypeScript bindings..."
    cd rs
    cargo test -p bene-epub export_bindings --release
    cp -r crates/bene-epub/bindings ../js/packages/bene-types/src/
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

    cd ..

    # Install the deb package
    mkdir -p $out/share/packages
    find rs/target/release/bundle/deb -name "*.deb" -exec cp {} $out/share/packages/ \;

    # Extract and install the binary from the deb
    mkdir -p $out/bin
    cd rs/target/release/bundle/deb
    ${dpkg}/bin/dpkg-deb -x *.deb $TMPDIR/deb-extract

    find $TMPDIR/deb-extract/usr/bin -type f -executable -exec cp {} $out/bin/bene \; || true

    # Install bundled resources
    mkdir -p "$out/lib/Bene Reader"
    if [ -d "$TMPDIR/deb-extract/usr/lib/Bene Reader" ]; then
      cp -r "$TMPDIR/deb-extract/usr/lib/Bene Reader"/* "$out/lib/Bene Reader/"
    else
      echo "WARNING: Resources directory not found in deb package"
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

  meta = with lib; {
    description = "An EPUB reading system";
    homepage = "https://github.com/nota-lang/bene";
    license = with licenses; [ mit asl20 ];
    platforms = platforms.linux;
    mainProgram = "bene";
  };
}
