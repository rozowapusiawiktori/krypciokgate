#!/bin/bash
cd /tmp/emo
which convert montage magick 2>/dev/null
rm -f /tmp/sheet.png
if which montage >/dev/null 2>&1; then
  for f in $(ls *.png | sort -n); do cp "$f" "${f%.png}.webp" 2>/dev/null; done
  montage -label '%f' $(ls *.webp | sort -n) -tile 6x -geometry 96x96+6+6 -background '#12141a' -fill white /tmp/sheet.png
  echo made
  ls -l /tmp/sheet.png
fi
