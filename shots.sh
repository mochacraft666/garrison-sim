#!/bin/bash
WP=$(cygpath -m "$PWD")
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
BASE="file:///F:/The_big_project/dsh_projecrt/toys/arknight/%E5%8D%AB/dist/%E5%8D%AB%E6%88%8D%E9%85%8D%E9%98%9F%E6%A8%A1%E6%8B%9F%E5%99%A8.html"
shot() {
  "$EDGE" --headless=new --disable-gpu --no-sandbox --no-first-run --disable-crash-reporter --disable-breakpad --disable-extensions \
    --user-data-dir="$WP/.edge-$2" --virtual-time-budget=4500 --hide-scrollbars --window-size=1600,950 \
    --screenshot="$WP/$2.png" "$1" >/dev/null 2>&1
  echo "$2 exit=$?"
}
shot "$BASE#demo" b1
shot "$BASE#demo&help=1" b2
shot "$BASE#demo&mode=cov" b3
shot "$BASE#demo&solve=1" b4
