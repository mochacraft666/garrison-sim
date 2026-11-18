# 卫戍配队模拟器

**在线使用：<https://mochacraft666.github.io/garrison-sim/>**

明日方舟「卫戍协议」的离线配队工具：拖拽配队、盟约图谱、矩阵、配队树、向导、一键求解。

- [使用说明](使用说明.md)
- [版权声明](版权声明.md)

> 分享版不包含官方美术资源，干员头像联网时在线加载；完整版内联素材，仅限个人自用。

## 仓库内容

- `src/`：规则内核、求解器、图谱、界面
- `data/operators.json`、`data/covenants.json`、`data/meta.json`：整理后的干员与盟约数据
- `test/`：内核与求解器测试、页面自检脚本
- `docs/index.html`：GitHub Pages 使用的分享版构建产物
- `build.mjs`、`package.sh`、`fetch*.mjs`、`make-avatars.py`：构建、打包与数据抓取脚本
- `使用说明.md`、`版权声明.md`、`DEPLOY.md`、`NOTICE.md`：文档

不进入仓库的内容（见 `.gitignore`）：`data/avatars.json`、`data/covenant-icons.json`、`data/raw/`（官方美术资源）、`dist/`、`release/`（构建产物）。

## 开源与许可

- 源代码与文档：MIT，见 [LICENSE](LICENSE)
- `data/operators.json`、`data/covenants.json`：CC BY-NC-SA 4.0（整理自 PRTS）
- 《明日方舟》游戏素材版权归上海鹰角网络科技有限公司，不在本仓库与上述许可范围内
