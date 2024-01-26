#!/bin/bash
rm -f $1.epub
set -e
pushd $1
echo -n "application/epub+zip" > mimetype
zip -0 -X ../$1.epub mimetype
rm -f mimetype
zip -r ../$1.epub EPUB META-INF
popd
# epubcheck $1.epub