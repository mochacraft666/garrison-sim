#!/usr/bin/env bash
# 打包发布：生成 dist 两个版本 → release/stage → 两个 zip + SHA256
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(node -e "console.log(require('./data/meta.json').version || '1.0.0')")
echo "version=$VERSION"

node build.mjs
node build.mjs --public

STAGE="release/stage-${VERSION}-$(date +%s)"
SHARE="$STAGE/share"
FULL="$STAGE/full"
CLOUD="$STAGE/cloudbase"
mkdir -p "$SHARE" "$FULL" "$CLOUD"

cp "dist/卫戍配队模拟器-分享版.html" "$SHARE/卫戍配队模拟器.html"
mkdir -p docs
cp "dist/卫戍配队模拟器-分享版.html" "docs/index.html"
cp 使用说明.md 版权声明.md "$SHARE/"
cp docs/index.html "$CLOUD/index.html"
cp "packaging/CloudBase操作步骤.md" "$CLOUD/操作步骤.md"

cp "dist/卫戍配队模拟器.html" "$FULL/卫戍配队模拟器.html"
cp 使用说明.md 版权声明.md "$FULL/"

cd "$STAGE"
powershell -NoProfile -Command "Compress-Archive -Path 'share/*' -DestinationPath '../卫戍配队模拟器-v${VERSION}-分享版.zip' -Force"
powershell -NoProfile -Command "Compress-Archive -Path 'full/*' -DestinationPath '../卫戍配队模拟器-v${VERSION}-完整版.zip' -Force"
powershell -NoProfile -Command "Compress-Archive -Path 'cloudbase/*' -DestinationPath '../卫戍配队模拟器-v${VERSION}-CloudBase上传包.zip' -Force"
cd ../..

sha256sum "release/卫戍配队模拟器-v${VERSION}-分享版.zip" "release/卫戍配队模拟器-v${VERSION}-完整版.zip" "release/卫戍配队模拟器-v${VERSION}-CloudBase上传包.zip" > "release/SHA256SUMS.txt"
# 构建中间目录 release/stage 可保留，便于检查 zip 内容；不需要时手动删除
ls -lh release/*.zip
cat release/SHA256SUMS.txt
