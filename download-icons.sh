#!/bin/bash
mkdir -p data/raw/icons
for k in yan sargon victoria kjerag egir siracusa kazimierz ursus iberia lethania preci swift skillful stead deput visi mira invest raid indom mani empty solo sunt doc arcane; do
  f="data/raw/icons/$k.png"
  [ -s "$f" ] && continue
  u=$(curl -sG --max-time 20 --data-urlencode "titles=文件:卫戍协议：盟约_icon_${k}Ship.png" \
      "https://prts.wiki/api.php?action=query&prop=imageinfo&iiprop=url&format=json" \
      | grep -o '"url":"[^"]*"' | head -1 | sed 's/.*"url":"//; s/"$//')
  if [ -n "$u" ]; then curl -sSL --max-time 25 -o "$f" "$u"; fi
done
echo "icons: $(ls data/raw/icons/*.png 2>/dev/null | wc -l)"
for f in data/raw/icons/*.png; do echo "$(basename $f) $(stat -c%s $f)"; done | head -30
