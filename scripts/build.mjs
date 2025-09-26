
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_DIR = path.resolve(__dirname, '../data');
const OUT_DIR = path.resolve(__dirname, '../dist');
const OUT_FILES = path.join(OUT_DIR, 'files');
const OUT_CSS = path.join(OUT_DIR, 'css');

const ensureDir = async (p) => fs.mkdir(p, { recursive: true });

const WEIGHT_KEYWORDS = [
  { keys: ['thin', 'hairline'], weight: 100 },
  { keys: ['extralight','ultralight','xlight','extra-light','ultra-light','extra_light','ultra_light','lite','light'], weight: 300 },
  { keys: ['book','regular','normal'], weight: 400 },
  { keys: ['medium'], weight: 500 },
  { keys: ['semibold',' demi','demibold','semi-bold','demi-bold','semi_bold','demi_bold'], weight: 600 },
  { keys: ['bold'], weight: 700 },
  { keys: ['extrabold','ultrabold','extra-bold','ultra-bold','extra_bold','ultra_bold'], weight: 800 },
  { keys: ['heavy','black'], weight: 900 },
];

function guessWeight(base) {
  // numeric first
  const m = base.match(/(?:^|[^0-9])(100|200|300|400|500|600|700|800|900)(?:[^0-9]|$)/);
  if (m) return parseInt(m[1], 10);
  const low = base.toLowerCase();
  for (const group of WEIGHT_KEYWORDS) {
    for (const k of group.keys) {
      if (low.includes(k)) return group.weight;
    }
  }
  return 400; // default
}

function guessStyle(base) {
  const low = base.toLowerCase();
  if (/\b(italic|oblique)\b/.test(low)) return 'italic';
  if (/(^|[^a-z])it([^a-z]|$)/.test(low)) return 'italic';
  return 'normal';
}

function sanitizeFamilyName(name) {
  // Keep spaces; only trim and collapse whitespace
  return name.replace(/\s+/g, ' ').trim();
}

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function walkFamilies() {
  const entries = await fs.readdir(INPUT_DIR, { withFileTypes: true });
  const families = entries.filter(e => e.isDirectory()).map(d => d.name);
  const result = [];
  for (const fam of families) {
    const famDir = path.join(INPUT_DIR, fam);
    const files = (await fs.readdir(famDir)).filter(n => !n.startsWith('.'));
    const pairs = new Map(); // base -> { ttf, woff2 }
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const base = path.basename(file, ext);
      if (!['.ttf', '.woff2'].includes(ext)) continue;
      if (!pairs.has(base)) pairs.set(base, {});
      pairs.get(base)[ext.slice(1)] = file; // 'ttf' or 'woff2'
    }
    const variants = [];
    for (const [base, pair] of pairs.entries()) {
      const style = guessStyle(base);
      const weight = guessWeight(base);
      variants.push({ base, style, weight, pair });
    }
    result.push({ family: fam, variants });
  }
  return result;
}

async function copyFonts(family, pair) {
  const srcDir = path.join(INPUT_DIR, family);
  const outDir = path.join(OUT_FILES, family);
  await ensureDir(outDir);
  const out = {};
  for (const key of ['woff2','ttf']) {
    if (pair[key]) {
      const src = path.join(srcDir, pair[key]);
      const dst = path.join(outDir, pair[key]);
      await fs.copyFile(src, dst);
      out[key] = path.relative(OUT_DIR, dst).replace(/\\/g,'/');
    }
  }
  return out;
}

function fontFaceCSS(family, variant, paths) {
  const resolveForCss = (p) => path.posix.join('..', p).replace(/\\/g, '/');
  const sources = [];
  if (paths.woff2) sources.push(`url('${resolveForCss(paths.woff2)}') format('woff2')`);
  if (paths.ttf) sources.push(`url('${resolveForCss(paths.ttf)}') format('truetype')`);
  const src = sources.join(', ');
  return `@font-face {
  font-family: '${esc(family)}';
  src: ${src};
  font-weight: ${variant.weight};
  font-style: ${variant.style};
  font-display: swap;
}\n`;
}

async function build() {
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await ensureDir(OUT_DIR);
  await ensureDir(OUT_FILES);
  await ensureDir(OUT_CSS);

  // Copy CNAME & .nojekyll if present
  for (const fname of ['CNAME', '.nojekyll']) {
    try {
      await fs.copyFile(path.resolve(__dirname, '../'+fname), path.join(OUT_DIR, fname));
    } catch {}
  }

  const families = await walkFamilies();
  const jsonOut = [];

  // Per-family CSS
  let allCSS = '';
  for (const fam of families) {
    const famName = sanitizeFamilyName(fam.family);
    let famCSS = '';
    const outVariants = [];
    for (const v of fam.variants) {
      const paths = await copyFonts(fam.family, v.pair);
      if (!paths.woff2 && !paths.ttf) continue;
      famCSS += fontFaceCSS(famName, v, paths);
      allCSS += fontFaceCSS(famName, v, paths);
      outVariants.push({
        base: v.base,
        weight: v.weight,
        style: v.style,
        woff2: paths.woff2 ?? null,
        ttf: paths.ttf ?? null,
      });
    }
    const famCssPath = path.join(OUT_CSS, `${fam.family}.css`);
    await fs.writeFile(famCssPath, famCSS, 'utf8');
    jsonOut.push({
      family: famName,
      css: `css/${fam.family}.css`,
      variants: outVariants
    });
  }

  await fs.writeFile(path.join(OUT_CSS, 'all.css'), allCSS, 'utf8');
  await fs.writeFile(path.join(OUT_DIR, 'fonts.json'), JSON.stringify(jsonOut, null, 2), 'utf8');

  // index.html
  const indexHTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Online Fonts – Index</title>
<link rel="preconnect" href="https://fonts.lzray.com">
<style>
  :root { --fg: #222; --muted: #666; --accent: #0a7; }
  body { font: 16px/1.6 system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif; color: var(--fg); margin: 0; }
  header { padding: 24px; border-bottom: 1px solid #eee; display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  header h1 { font-size: 20px; margin: 0; }
  header input { flex:1; min-width: 260px; padding: 10px 12px; border:1px solid #ddd; border-radius: 10px; }
  main { padding: 24px; }
  .card { border:1px solid #eee; border-radius: 14px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.03); }
  .family { font-size: 18px; font-weight: 600; }
  .muted { color: var(--muted); font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px dashed #eee; }
  .btn { padding: 6px 10px; border:1px solid #ddd; border-radius: 8px; text-decoration: none; color: var(--fg); margin-right: 6px; font-size: 12px; }
  .btn:hover { border-color: var(--accent); }
  .code { background:#f7f7f7; border-radius:8px; padding:8px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
  .topbar-links a { margin-left:12px; font-size: 13px; color: var(--accent); text-decoration: none; }
</style>
</head>
<body>
  <header>
    <h1>Online Fonts</h1>
    <input id="q" placeholder="搜索字体家族/变体…（支持拼音/英文关键字）">
    <div class="topbar-links">
      <a href="./console/">Console</a>
      <a href="https://github.com/" target="_blank" rel="noreferrer">GitHub</a>
    </div>
  </header>
  <main>
    <div id="list"></div>
  </main>
<script>
async function load() {
  const res = await fetch('./fonts.json');
  const data = await res.json();
  const baseURL = new URL('.', res.url);
  const assetUrl = (rel) => rel ? new URL(rel, baseURL).href : null;
  const list = document.getElementById('list');
  const q = document.getElementById('q');
  function render(filter='') {
    list.innerHTML='';
    const f = filter.trim().toLowerCase();
    for (const fam of data) {
      const has = fam.variants.some(v => (v.base||'').toLowerCase().includes(f)) || fam.family.toLowerCase().includes(f);
      if (!has && f) continue;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = \`
        <div class="family">\${fam.family}</div>
        <div class="muted">\${fam.variants.length} 个变体 · <a class="btn" href="\${assetUrl(fam.css)}">CSS</a></div>
        <table>
          <thead><tr><th>变体</th><th>weight</th><th>style</th><th>下载</th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="code"><code>&lt;link rel="stylesheet" href="https://fonts.lzray.com/\${fam.css}"&gt;</code></div>
      \`;
      const tbody = card.querySelector('tbody');
      for (const v of fam.variants) {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td>\${v.base}</td>
          <td>\${v.weight}</td>
          <td>\${v.style}</td>
          <td>
            \${v.woff2 ? \`<a class="btn" href="\${assetUrl(v.woff2)}" download>woff2</a>\` : ''}
            \${v.ttf ? \`<a class="btn" href="\${assetUrl(v.ttf)}" download>ttf</a>\` : ''}
          </td>
        \`;
        tbody.appendChild(tr);
      }
      list.appendChild(card);
    }
  }
  q.addEventListener('input', e => render(e.target.value));
  render('');
}
load();
</script>
</body>
</html>`;
  await fs.writeFile(path.join(OUT_DIR, 'index.html'), indexHTML, 'utf8');

  // console page
  const consoleHTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Online Fonts – Console</title>
<style>
  body { font: 16px/1.6 system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif; margin: 0; color: #222; }
  header { padding: 24px; border-bottom:1px solid #eee; }
  main { padding: 24px; display:grid; gap: 16px; grid-template-columns: 1fr; max-width: 1000px; margin: 0 auto; }
  select, input, textarea { width: 100%; padding: 10px 12px; border:1px solid #ddd; border-radius: 10px; font-size: 14px; }
  .card { border:1px solid #eee; border-radius: 14px; padding: 16px; box-shadow:0 1px 4px rgba(0,0,0,.03); }
  .preview { border:1px dashed #ddd; border-radius: 10px; padding: 16px; min-height: 80px; }
  .row { display:grid; gap:12px; grid-template-columns: 1fr 1fr; }
  label { font-size: 12px; color:#666; }
  .btn { padding: 8px 12px; border:1px solid #ddd; border-radius: 8px; background:#fafafa; cursor:pointer; }
</style>
</head>
<body>
  <header><h1>Console</h1></header>
  <main>
    <div class="card">
      <div class="row">
        <div>
          <label>选择字体家族</label>
          <select id="family"></select>
        </div>
        <div>
          <label>选择变体（可选）</label>
          <select id="variant"></select>
        </div>
      </div>
    </div>
    <div class="card">
      <label>示例文本</label>
      <input id="sample" value="一蓑烟雨任平生 – The quick brown fox jumps over the lazy dog. 1234567890">
      <div id="preview" class="preview"></div>
    </div>
    <div class="card">
      <label>引用代码</label>
      <textarea id="code" rows="6" readonly></textarea>
      <div style="margin-top:8px;"><button class="btn" id="copy">复制</button></div>
    </div>
  </main>
<script>
async function init() {
  const res = await fetch('../fonts.json');
  const data = await res.json();
  const baseURL = new URL('.', res.url);
  const assetUrl = (rel) => rel ? new URL(rel, baseURL).href : null;
  const famSel = document.getElementById('family');
  const varSel = document.getElementById('variant');
  const prev = document.getElementById('preview');
  const sample = document.getElementById('sample');
  const code = document.getElementById('code');
  const copyBtn = document.getElementById('copy');

  for (const fam of data) {
    const opt = document.createElement('option');
    opt.value = fam.family;
    opt.textContent = fam.family;
    opt.dataset.css = fam.css;
    famSel.appendChild(opt);
  }

  function updateVariants() {
    const fam = data.find(f => f.family === famSel.value);
    varSel.innerHTML = '<option value="">（全部变体）</option>';
    if (!fam) return;
    fam.variants.forEach(v => {
      const o = document.createElement('option');
      o.value = v.base;
      o.textContent = v.base + ' (w:' + v.weight + ', ' + v.style + ')';
      varSel.appendChild(o);
    });
  }

  function updateCode() {
    const fam = data.find(f => f.family === famSel.value);
    if (!fam) return;
    const link = \`<link rel="stylesheet" href="https://fonts.lzray.com/\${fam.css}">\`;
    const familyDecl = \`font-family: '\${fam.family}', system-ui, sans-serif;\`;
    const vbase = varSel.value;
    let extra = '';
    if (vbase) {
      const v = fam.variants.find(x => x.base === vbase) || {};
      extra = \`
/* 可选：限定变体 */
.sample {
  font-weight: \${v.weight||400};
  font-style: \${v.style||'normal'};
}\`;
    }
    code.value = link + "\\n\\n<style>\\nbody { " + familyDecl + " }\\n" + extra + "\\n</style>";
    // live preview
    const existing = document.getElementById('famcss');
    if (existing) existing.remove();
    const lk = document.createElement('link');
    lk.id = 'famcss';
    lk.rel = 'stylesheet';
    lk.href = assetUrl(fam.css);
    document.head.appendChild(lk);
    prev.style.fontFamily = "'" + fam.family + "', system-ui, sans-serif";
    prev.style.fontWeight = 'normal';
    prev.style.fontStyle = 'normal';
    if (vbase) {
      const v = fam.variants.find(x => x.base === vbase) || {};
      prev.style.fontWeight = v.weight || '400';
      prev.style.fontStyle = v.style || 'normal';
    }
    prev.textContent = sample.value;
  }

  famSel.addEventListener('change', () => { updateVariants(); updateCode(); });
  varSel.addEventListener('change', updateCode);
  sample.addEventListener('input', updateCode);
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code.value); copyBtn.textContent = '已复制'; setTimeout(()=>copyBtn.textContent='复制', 1200); } catch {}
  });

  updateVariants();
  updateCode();
}
init();
</script>
</body>
</html>`;
  await fs.mkdir(path.join(OUT_DIR, 'console'), { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, 'console', 'index.html'), consoleHTML, 'utf8');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
