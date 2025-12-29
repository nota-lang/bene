# Bene: A Lightweight EPUB Reader

[_Live demo_](<https://nota-lang.github.io/bene/>)

Bene is a reading system for [EPUBs](https://www.w3.org/TR/epub-overview-33/). EPUBs have historically been used just for e-books, but the goal of Bene is to make reading an EPUB as simple, commonplace, and pleasant as [reading a PDF](https://willcrichton.net/notes/portable-epubs/). Bene is designed to be lightweight, meaning EPUBs open quickly and quietly unlike existing EPUB readers. Bene's UI is essentially a fork of [PDF.js](https://mozilla.github.io/pdf.js/). 

## Installation

### MacOS

1. Download the [ARM][mac-arm] or [Intel][mac-intel] installer.
2. Run the installer.
3. Run at the terminal:
   ```
   xattr -cr /Applications/Bene\ Reader.app
   ```

### Windows

1. Download the [ARM][windows-arm] or [Intel][windows-intel] installer.
   Make sure to click "Keep" and "Download anyway".
2. Run the installer.

### Linux:

1. Download the .rpm ([Intel][rpm-intel]), .AppImage ([Intel][appimage-intel]), or .deb ([Intel][deb-intel]).
2. Install the file as appropriate.

[mac-arm]: https://github.com/nota-lang/bene/releases/download/v0.1.1/Bene.Reader_0.1.1_aarch64.dmg
[mac-intel]: https://github.com/nota-lang/bene/releases/download/v0.1.1/Bene.Reader_0.1.1_x64.dmg
[windows-arm]: https://github.com/nota-lang/bene/releases/download/v0.1.1/Bene.Reader_0.1.1_arm64_en-US.msi
[windows-intel]: https://github.com/nota-lang/bene/releases/download/v0.1.1/Bene.Reader_0.1.1_x64_en-US.msi
[rpm-intel]: https://github.com/nota-lang/bene/releases/download/v0.1.1/Bene.Reader-0.1.1-1.x86_64.rpm
[appimage-intel]: https://github.com/nota-lang/bene/releases/download/v0.1.1/Bene.Reader_0.1.1_amd64.AppImage
[deb-intel]: https://github.com/nota-lang/bene/releases/download/v0.1.1/Bene.Reader_0.1.1_amd64.deb
[code-signing]: #code-signing