# fonts-library-starter

一个 **纯 GitHub** 托管的在线字体库模板：

- `/data/` 放置字体文件（**同一字体家族一个文件夹**）。
- 支持自动识别变体（`lite/light/medium/semibold/bold/black` 等），并生成权重与斜体。
- 自动生成：
  - `index.html`（主站字体索引 + 下载按钮）
  - `fonts.json`（供前端/console 使用）
  - `css/<Family>.css`（可被外站直接引用的 `@font-face`）
  - `css/all.css`（包含所有字体的聚合 CSS）
  - `files/` 复制后的实际字体访问路径
- 使用 GitHub Actions 部署到 **GitHub Pages**，支持自定义域名（根目录 `CNAME` 文件）。

## 目录结构

```
.
├─ data/                 # 你只需要把字体放这里（子文件夹=字体家族）
│  ├─ LXGWWenKai/
│  │   ├─ LXGWWenKai-Lite.woff2
│  │   ├─ LXGWWenKai-Lite.ttf
│  │   ├─ LXGWWenKai-Medium.woff2
│  │   └─ LXGWWenKai-Medium.ttf
│  └─ AnotherFamily/...
├─ scripts/
│  └─ build.mjs         # 扫描 data 生成站点
├─ console/
│  └─ index.html        # 选择字体，生成引用代码
├─ css/                 # 运行构建后会被覆盖/填充到 dist/css
├─ .github/workflows/
│  └─ pages.yml         # 使用 GitHub Actions 自动部署到 Pages
├─ CNAME                # 自定义域名（可修改）
├─ .nojekyll
└─ README.md
```

## 使用方法

1. **创建仓库**，把本项目上传到 GitHub。
2. 把你的字体放进 `data/<FamilyName>/` 中。**同名 `.woff2` 与 `.ttf` 会自动配对**。
3. 修改 `CNAME` 为你的域名（如果不是 `fonts.lzray.com`）。
4. 推送到 `main` 分支，GitHub Actions 会自动构建并发布到 Pages。
5. 在 DNS 里，把 `fonts.lzray.com` CNAME 到 `你的 GitHub 用户名.github.io`，或按需配置。

## 外站引用

- 引入某个家族：
  ```html
  <link rel="stylesheet" href="https://fonts.lzray.com/css/LXGWWenKai.css">
  <style>
    body { font-family: 'LXGWWenKai', system-ui, sans-serif; }
  </style>
  ```

- 一次性引入所有：
  ```html
  <link rel="stylesheet" href="https://fonts.lzray.com/css/all.css">
  ```

- 在本项目主站 `/console/` 可以选择字体并一键复制引用代码。

## 变体识别规则（文件名关键字）

- 权重：
  - `thin/hairline` → 100
  - `extralight/ultralight/xlight/lite/light` → 200/300（统一为 **300**）
  - `book/regular/normal` → 400（默认）
  - `medium` → 500
  - `semibold/demibold` → 600
  - `bold` → 700
  - `extrabold/ultrabold/heavy/black` → 800/900（`heavy/black` → **900**，`extra/ultra` → **800**）
  - 若文件名包含 `100|200|...|900` 之一，优先按该数字作为 `font-weight`
- 风格：文件名包含 `italic/oblique/it` → `font-style: italic`，否则 `normal`。

> 只要保证同一变体的 `.woff2` 与 `.ttf` **同名**（扩展名不同），脚本就能自动生成对应 `@font-face`。

## 本地构建（可选）

需要 Node.js ≥ 18：

```bash
node scripts/build.mjs
# 生成输出到 dist/
```

---

**License**: 仅提供构建脚本与模板；字体版权归各自版权方所有，请确保你有权利公开分发。
