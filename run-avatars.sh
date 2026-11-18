#!/bin/bash
mkdir -p data/raw/avatars
CT="https://cdn.jsdelivr.net/gh/Kengxxiao/ArknightsGameData@master/zh_CN/gamedata/excel/character_table.json"
SZ=$(stat -c%s data/raw/character_table.json 2>/dev/null || echo 0)
if [ "$SZ" -lt 10000000 ]; then
  echo "downloading ct (was $SZ)"
  rm -f data/raw/character_table.json
  curl -sSL --retry 3 --max-time 240 -o data/raw/character_table.json "$CT"
fi
echo "ct bytes $(stat -c%s data/raw/character_table.json 2>/dev/null || echo 0)"
node fetch-map.mjs || exit 1
cat data/raw/ids.txt | xargs -P 8 -I{} sh -c 'f=data/raw/avatars/{}.png; [ -s "$f" ] || curl -sSL --retry 2 --max-time 25 -o "$f" "https://cdn.jsdelivr.net/gh/yuanyan3060/ArknightsGameResource@main/avatar/{}.png"'
echo "downloaded: $(ls data/raw/avatars/*.png 2>/dev/null | wc -l)"
du -sh data/raw/avatars | awk '{print "size", $1}'
