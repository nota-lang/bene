# Pre-built binary package for Bene
# Downloads the .deb from GitHub releases and patches it for NixOS
{ lib
, stdenv
, fetchurl
, dpkg
, autoPatchelfHook
, wrapGAppsHook3
, gtk3
, webkitgtk_4_1
, libsoup_3
, glib
, glib-networking
, openssl
, libayatana-appindicator
}:

stdenv.mkDerivation rec {
  pname = "bene";
  version = "0.1.3";

  src = fetchurl {
    url = "https://github.com/nota-lang/bene/releases/download/v${version}/Bene.Reader_${version}_amd64.deb";
    hash = "sha256-zO4WlKmDkZc/bIPB+3mcTcj1xfUbrVo4sHGNvaoGjrI=";
  };

  unpackCmd = "${dpkg}/bin/dpkg-deb -x $curSrc .";
  sourceRoot = ".";

  nativeBuildInputs = [
    autoPatchelfHook
    wrapGAppsHook3
    dpkg
  ];

  buildInputs = [
    gtk3
    webkitgtk_4_1
    libsoup_3
    glib
    glib-networking
    openssl
    libayatana-appindicator
  ];

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/bin $out/lib $out/share

    # Install the main binary (upstream names it bene-app)
    install -Dm755 usr/bin/bene-app $out/bin/bene

    # Install bundled resources (bene-reader assets)
    if [ -d "usr/lib/Bene Reader" ]; then
      cp -r "usr/lib/Bene Reader" "$out/lib/"
    fi

    # Install desktop file
    if [ -d usr/share/applications ]; then
      cp -r usr/share/applications $out/share/
    fi

    # Install icons
    if [ -d usr/share/icons ]; then
      cp -r usr/share/icons $out/share/
    fi

    runHook postInstall
  '';

  postFixup = ''
    wrapProgram $out/bin/bene \
      --prefix GIO_EXTRA_MODULES : "${glib-networking}/lib/gio/modules"
  '';

  meta = with lib; {
    description = "An EPUB reading system";
    homepage = "https://github.com/nota-lang/bene";
    license = with licenses; [ mit asl20 ];
    platforms = [ "x86_64-linux" ];
    mainProgram = "bene";
  };
}
