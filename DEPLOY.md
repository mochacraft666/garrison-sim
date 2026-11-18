# 部署到免费静态托管

这个项目是**纯静态单文件 HTML**，不需要服务器、数据库或后端，任何静态托管都能放。

## 方案 A：GitHub Pages（推荐，免费、无需域名）

### 零基础网页版步骤（不用装 Git）

1. 打开 https://github.com 注册账号，完成邮箱验证。
2. 右上角 **+ → New repository**：
   - Repository name 填 `garrison-sim`（会出现在网址里，想好再定）；
   - 选 **Public**；
   - 勾选 Add a README（可选），点 **Create repository**。
3. 进入仓库，点 **Add file → Upload files**。
4. 把本目录 `docs/` 里的 **index.html**（以及 README.md、NOTICE.md、版权声明.txt、.nojekyll）拖进上传框。
   注意：`index.html` 必须在仓库**根目录**，不能套一层文件夹。
5. 下方 Commit changes 填一句说明，点 **Commit changes**。
6. 仓库顶部 **Settings → Pages**：
   - Source 选 **Deploy from a branch**；
   - Branch 选 **main**，目录选 **/ (root)**；
   - 点 **Save**。
7. 等 1–2 分钟，刷新 Settings → Pages，会显示：
   `Your site is live at https://<用户名>.github.io/garrison-sim/`
8. 打开这个地址即可；以后更新只需重新上传 `index.html` 覆盖并 commit。

### 常见问题

- **404**：确认文件名是 `index.html`（全小写）、在根目录、分支是 main、目录是 /(root)；再看仓库 **Actions** 里 Pages 构建是否成功。
- **样式/图片不对**：强刷 `Ctrl+F5`；分享版头像是联网加载的，断网或图源被墙时会显示色块。
- **国内打不开**：GitHub Pages 在国内不稳定，可改用 Netlify Drop（见方案 B），或国内对象存储 + 备案域名。
- **仓库必须 public**：免费账号的 Pages 不支持私有仓库。

## 方案 B：Netlify Drop（不用 Git，拖拽即可）

1. 打开 https://app.netlify.com/drop 并登录。
2. 把包含 `index.html` 的文件夹拖进去。
3. 立即得到 `https://<随机名>.netlify.app`；可在 Site settings 里改名。
4. 更新时重新拖一次，或绑定 Git 仓库自动部署。

## 方案 C：Cloudflare Pages

1. 登录 Cloudflare Dashboard → Workers & Pages → Pages → Connect to Git。
2. 选仓库；Build command 留空，Output directory 填 `/`（或 `docs`）。
3. 部署后得到 `https://<项目名>.pages.dev`。

## 要不要买域名？

不需要。上面三种都会免费给一个子域名；域名只是“好看/好记”，可以以后再加：

- 在托管平台绑定自定义域名；
- 到域名商买一个（常见 .com 约 60–90 元/年，.top/.xyz 更便宜）；
- 按平台提示加 CNAME 记录即可，HTTPS 平台会自动签发。

## 国内访问提醒

GitHub Pages / Netlify / Cloudflare 在国内的网络质量不稳定，可能慢或间歇性打不开。如果主要面向国内玩家：

- 最稳的是国内对象存储（阿里云 OSS / 腾讯云 COS）+ 已备案域名；
- 或者继续发压缩包，让玩家本地打开；
- 不要把完整版（含官方美术）放上公开托管。

## 目录约定

- `docs/index.html`：分享版构建产物（由 `bash package.sh` 自动同步）。
- `docs/README.md`、`docs/.nojekyll`：仓库首页说明与 Pages 配置。
- 托管时只需要 `index.html`；`使用说明.md` 与 `版权声明.md` 可以放在仓库根目录，不影响页面运行。
