/* 网页版工作室 · H5 生成器：状态 -> 单文件 HTML（离线可用，无外部依赖）
 * 结构与设计令牌取自 summary-to-html 技能：
 *   - references/style-presets.md（12 种风格）
 *   - assets/style-preview.html（文档骨架、目录/翻页/打印运行时）
 * 生成结果去掉预览侧栏，固定所选风格与阅读形式。 */
(function (root) {
  'use strict';

  var DATA = root.StudioData;
  var SB = root.StudioBuild = root.StudioBuild || {};

  // ---------- 文本工具 ----------

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* 每行一段 / 每行一条：去掉空行，保留原始顺序。 */
  function linesOf(text) {
    return String(text == null ? '' : text).split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
  }

  function clampText(value, max) {
    return Array.from(String(value == null ? '' : value)).slice(0, max).join('');
  }

  function pad2(value) {
    return value < 10 ? '0' + value : String(value);
  }

  // ---------- 样式表（改编自 assets/style-preview.html，去掉预览侧栏） ----------

  var H5_CSS = [
    ':root {',
    '  --sans: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;',
    '  --serif: "Songti SC", "STSong", "Noto Serif CJK SC", serif;',
    '  --mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;',
    '}',
    '* { box-sizing: border-box; }',
    'html { scroll-behavior: smooth; }',
    'body {',
    '  margin: 0; font-family: var(--sans); line-height: 1.7;',
    '  --bg: #f3f6fb; --surface: #fff; --ink: #182334; --muted: #566477;',
    '  --accent: #245ad9; --line: #d5deec; --soft: #eaf0ff; --radius: 16px;',
    '  background: var(--bg); color: var(--ink);',
    '}',
    'body[data-style="editorial"] { --bg: #f4f0e8; --surface: #faf7f0; --ink: #2c2925; --muted: #706559; --accent: #a63727; --line: #d2c8b9; --soft: #eee5d8; --radius: 0; }',
    'body[data-style="terminal"] { --bg: #101720; --surface: #17232f; --ink: #e5f0ef; --muted: #a6b9bd; --accent: #86e2c4; --line: #344954; --soft: #203a3b; --radius: 6px; color-scheme: dark; }',
    'body[data-style="dashboard"] { --bg: #eef0f7; --surface: #fff; --ink: #202740; --muted: #606781; --accent: #5841c6; --line: #d8dced; --soft: #eeebfc; --radius: 20px; }',
    'body[data-style="notebook"] { --bg: #f4f3e9; --surface: #fffef6; --ink: #293b30; --muted: #627064; --accent: #3d694c; --line: #cbd4c4; --soft: #e3ebd9; --radius: 24px; }',
    'body[data-style="spotlight"] { --bg: #191a17; --surface: #20211c; --ink: #f4f3e9; --muted: #b5b6a7; --accent: #ddf274; --line: #44463b; --soft: #343c21; --radius: 0; color-scheme: dark; }',
    'body[data-style="minimal"] { --bg: #ffffff; --surface: #ffffff; --ink: #202124; --muted: #596068; --accent: #30363c; --line: #d9dde1; --soft: #f3f4f5; --radius: 0; }',
    'body[data-style="academic"] { --bg: #f5f7fb; --surface: #ffffff; --ink: #243247; --muted: #55647a; --accent: #2a4b75; --line: #ccd7e5; --soft: #eaf0f7; --radius: 4px; }',
    'body[data-style="swiss"] { --bg: #f5f4f0; --surface: #ffffff; --ink: #202020; --muted: #62605a; --accent: #b32b23; --line: #cbc8bf; --soft: #ece8df; --radius: 0; }',
    'body[data-style="gallery"] { --bg: #f8f5ef; --surface: #ffffff; --ink: #302c26; --muted: #706352; --accent: #7c582d; --line: #d9cebf; --soft: #eee6d9; --radius: 8px; }',
    'body[data-style="blueprint"] { --bg: #153552; --surface: #1d4262; --ink: #edf5fc; --muted: #bed1e3; --accent: #a8d6fa; --line: #527797; --soft: #234d70; --radius: 0; color-scheme: dark; }',
    'body[data-style="pastel"] { --bg: #f8f5fc; --surface: #ffffff; --ink: #35303f; --muted: #696076; --accent: #6b4d83; --line: #ddd2e7; --soft: #eee5f5; --radius: 28px; }',
    'a { color: var(--accent); text-underline-offset: 4px; }',
    'button, select { font: inherit; }',
    'button { color: inherit; }',
    ':focus-visible { outline: 3px solid var(--accent, #245ad9); outline-offset: 4px; }',
    '.skip-link { position: fixed; left: 16px; top: -80px; z-index: 10; padding: 12px; background: var(--surface); }',
    '.skip-link:focus { top: 12px; }',
    '.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }',
    '.document-tools { position: sticky; top: 0; z-index: 3; background: var(--surface); border-bottom: 1px solid var(--line); }',
    '.tool-row { min-height: 66px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 10px 28px; }',
    '.document-identity { min-width: 0; }',
    '#document-title { font-size: 13px; font-weight: 650; }',
    '.reader-controls { display: none; align-items: center; gap: 8px; }',
    '.enhanced .reader-controls { display: flex; }',
    '.reader-controls select, .tool-button { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 7px; padding: 6px 10px; font-size: 12px; }',
    '.reader-controls select { max-width: 190px; }',
    '.progress { width: 100%; display: block; height: 3px; border: 0; appearance: none; background: var(--line); accent-color: var(--accent); }',
    '.progress::-webkit-progress-bar { background: var(--line); }',
    '.progress::-webkit-progress-value { background: var(--accent); }',
    '.progress::-moz-progress-bar { background: var(--accent); }',
    '.deck-nav { display: none; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 28px; border-top: 1px solid var(--line); background: var(--surface); }',
    '.enhanced[data-mode="deck"] .deck-nav { display: flex; }',
    '#page-status { font: 12px var(--mono); color: var(--muted); }',
    '.document { max-width: 1240px; margin-inline: auto; }',
    '.page { padding: clamp(28px, 4.7vw, 70px); border-bottom: 1px solid var(--line); scroll-margin-top: calc(var(--tools-height, 96px) + 16px); overflow-wrap: anywhere; }',
    '.enhanced[data-mode="deck"] .page { display: none; min-height: calc(100vh - 145px); min-height: calc(100dvh - 145px); }',
    '.enhanced[data-mode="deck"] .page.is-current { display: block; }',
    '.chapter-head { display: flex; justify-content: space-between; gap: 16px; font: 11px var(--mono); color: var(--muted); letter-spacing: .08em; padding-bottom: 18px; border-bottom: 1px solid var(--line); margin-bottom: 36px; }',
    '.kicker { font-size: 12px; color: var(--accent); font-weight: 750; letter-spacing: .15em; margin: 0 0 14px; }',
    'h1, h2, h3, p { margin-top: 0; }',
    'h1, .page h2 { text-wrap: balance; letter-spacing: -.055em; line-height: 1.18; }',
    'h1 { font-size: clamp(34px, 4.1vw, 67px); margin-bottom: 22px; font-weight: 780; }',
    '.page h2 { font-size: clamp(28px, 3.3vw, 47px); margin-bottom: 22px; }',
    'p { font-size: 16.5px; line-height: 1.9; max-width: 46em; margin-bottom: 14px; }',
    'p.lead, .lead { font-size: clamp(16px, 1.45vw, 19px); color: var(--muted); max-width: 42em; line-height: 1.9; margin-bottom: 30px; }',
    'p.kicker { font-size: 12px; font-weight: 750; letter-spacing: .15em; margin: 0 0 14px; }',
    'p.source-note, .source-note { color: var(--muted); font-size: 13px; margin-top: 26px; }',
    '.insights { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 30px; }',
    '.insight { min-width: 0; padding: 22px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }',
    '.item-no { display: block; font: 12px var(--mono); color: var(--accent); margin-bottom: 20px; }',
    '.insight p { color: var(--muted); font-size: 16px; margin: 0; max-width: none; }',
    '.media-frame { margin: 24px 0; }',
    '.media-frame img { display: block; max-width: 100%; height: auto; max-height: 70vh; object-fit: contain; }',
    '.media-frame figcaption { font-size: 14px; color: var(--muted); margin-top: 10px; }',
    '.table-figure { margin: 26px 0; overflow-x: auto; }',
    '.table-figure table { width: 100%; border-collapse: collapse; font-size: 15px; background: var(--surface); }',
    '.table-figure th, .table-figure td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--line); }',
    '.table-figure th { color: var(--accent); font-weight: 700; background: var(--soft); white-space: nowrap; }',
    '.table-figure figcaption { margin-top: 10px; font-size: 13px; color: var(--muted); }',
    '.page-foot { margin-top: 34px; padding-top: 15px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; }',
    '[data-style="brief"] .insight { box-shadow: 0 8px 25px #25436a06; }',
    '[data-style="editorial"] h1, [data-style="editorial"] .page h2 { font-family: var(--serif); font-weight: 700; }',
    '[data-style="editorial"] .insights { grid-template-columns: 1fr; gap: 0; }',
    '[data-style="editorial"] .insight { display: grid; grid-template-columns: 48px 1fr; gap: 20px; border: 0; border-top: 1px solid var(--line); padding: 24px 0; background: transparent; border-radius: 0; }',
    '[data-style="editorial"] .insight .item-no { font: 32px var(--serif); margin: 0; }',
    '[data-style="terminal"] .document { background-image: linear-gradient(#829fa007 1px, transparent 1px), linear-gradient(90deg, #829fa007 1px, transparent 1px); background-size: 28px 28px; }',
    '[data-style="terminal"] .kicker { font-family: var(--mono); }',
    '[data-style="terminal"] .insight { border-top: 2px solid var(--accent); }',
    '[data-style="terminal"] .item-no::before { content: "> "; }',
    '[data-style="dashboard"] .insights { grid-template-columns: 1.35fr 1fr; }',
    '[data-style="dashboard"] .insight:first-child { grid-row: span 2; display: flex; flex-direction: column; justify-content: space-between; }',
    '[data-style="dashboard"] .insight:first-child .item-no { font-size: 52px; line-height: 1.2; }',
    '[data-style="notebook"] .insight:nth-child(2) { background: #edf1e3; }',
    '[data-style="notebook"] .insight:nth-child(3) { background: #f7eedc; }',
    '[data-style="notebook"] .insight { border-top: 4px solid var(--line); }',
    '[data-style="notebook"] h1 { font-size: clamp(34px, 3.8vw, 60px); }',
    '[data-style="spotlight"] h1 { font-size: clamp(38px, 4.9vw, 78px); font-weight: 800; }',
    '[data-style="spotlight"] .insight { border: 0; border-top: 1px solid var(--line); padding: 20px 0; background: none; border-radius: 0; }',
    '[data-style="spotlight"] .chapter-head { border: 0; }',
    '[data-style="minimal"] .document { max-width: 940px; }',
    '[data-style="minimal"] .insights { grid-template-columns: 1fr; gap: 0; }',
    '[data-style="minimal"] .insight { background: none; border: 0; border-top: 1px solid var(--line); padding: 22px 0; border-radius: 0; }',
    '[data-style="minimal"] h1 { font-size: clamp(34px, 3.6vw, 54px); font-weight: 650; }',
    '[data-style="academic"] h1, [data-style="academic"] .page h2 { font-family: var(--serif); letter-spacing: -.02em; }',
    '[data-style="academic"] .insights { grid-template-columns: 1fr; }',
    '[data-style="academic"] .insight { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 18px; }',
    '[data-style="swiss"] h1 { font-weight: 900; letter-spacing: -.07em; }',
    '[data-style="swiss"] .insights { gap: 0; }',
    '[data-style="swiss"] .insight { border: 0; border-top: 3px solid var(--ink); border-right: 1px solid var(--line); background: none; border-radius: 0; }',
    '[data-style="swiss"] .item-no { font-size: 36px; font-weight: 800; }',
    '[data-style="gallery"] h1, [data-style="gallery"] .kicker { text-align: center; }',
    '[data-style="gallery"] h1 { font-family: var(--serif); }',
    '[data-style="gallery"] .lead { margin-inline: auto; }',
    '[data-style="gallery"] .insights { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }',
    '[data-style="gallery"] .insight:first-child { grid-column: 1 / -1; padding: 30px; }',
    '[data-style="gallery"] .media-frame { padding: 16px; background: var(--surface); }',
    '[data-style="blueprint"] .document { background-image: linear-gradient(#86a8c414 1px, transparent 1px), linear-gradient(90deg, #86a8c414 1px, transparent 1px); background-size: 24px 24px; }',
    '[data-style="blueprint"] .insight { border: 1px dashed var(--line); background: transparent; border-radius: 0; }',
    '[data-style="blueprint"] .chapter-head, [data-style="blueprint"] .item-no { font-family: var(--mono); }',
    '[data-style="pastel"] .insights { grid-template-columns: 1fr; gap: 18px; }',
    '[data-style="pastel"] .insight { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 18px; border: 0; padding: 26px; border-radius: var(--radius); }',
    '[data-style="pastel"] .item-no { align-self: start; background: var(--soft); border-radius: 50%; text-align: center; padding: 10px 0; }',
    '/* 网页版式设置：用户选择时覆盖风格默认（见界面「版式」下拉） */',
    '.points-list { list-style: none; padding: 0; margin: 30px 0 6px; }',
    '.points-list li { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 14px; padding: 16px 0; border-top: 1px solid var(--line); font-size: 17px; }',
    '.points-list li:last-child { border-bottom: 1px solid var(--line); }',
    '.points-list .item-no { margin: 3px 0 0; font-size: 15px; }',
    '.points-plain { margin: 28px 0 6px; padding-left: 1.3em; }',
    '.points-plain li { margin: 10px 0; font-size: 17px; }',
    '.cover-panel .cover-body { background: var(--soft); border: 1px solid var(--line); border-radius: var(--radius); padding: clamp(26px, 3.6vw, 54px); }',
    '.cover-centered { text-align: center; }',
    '.cover-centered .lead { margin-inline: auto; }',
    'body[data-width="narrow"] .document { max-width: 880px; }',
    'body[data-width="standard"] .document { max-width: 1240px; }',
    'body[data-width="wide"] .document { max-width: 1600px; }',
    'body[data-density="compact"] p { font-size: 15px; line-height: 1.75; }',
    'body[data-density="compact"] .insight p, body[data-density="compact"] .points-list li, body[data-density="compact"] .points-plain li { font-size: 15px; }',
    'body[data-density="compact"] .insight { padding: 16px; }',
    'body[data-density="compact"] .page { padding: clamp(22px, 3.2vw, 46px); }',
    'body[data-density="compact"] h1 { font-size: clamp(30px, 3.6vw, 56px); }',
    'body[data-density="compact"] .page h2 { font-size: clamp(24px, 2.9vw, 40px); }',
    'body[data-density="compact"] .lead { font-size: clamp(15px, 1.3vw, 17px); }',
    'body[data-density="compact"] p.kicker, body[data-density="relaxed"] p.kicker { font-size: 12px; }',
    'body[data-density="compact"] p.source-note, body[data-density="relaxed"] p.source-note { font-size: 13px; }',
    'body[data-density="relaxed"] p { font-size: 18px; line-height: 2.05; }',
    'body[data-density="relaxed"] .insight p, body[data-density="relaxed"] .points-list li, body[data-density="relaxed"] .points-plain li { font-size: 18px; }',
    'body[data-density="relaxed"] .insight { padding: 28px; }',
    'body[data-density="relaxed"] .page { padding: clamp(34px, 5.8vw, 86px); }',
    'body[data-density="relaxed"] h1 { font-size: clamp(36px, 4.4vw, 72px); }',
    'body[data-density="relaxed"] .page h2 { font-size: clamp(30px, 3.6vw, 52px); }',
    'body[data-density="relaxed"] .lead { font-size: clamp(17px, 1.6vw, 21px); }',
    'body[data-title="sans"] h1, body[data-title="sans"] .page h2 { font-family: var(--sans); }',
    'body[data-title="serif"] h1, body[data-title="serif"] .page h2 { font-family: var(--serif); }',
    '@media (max-width: 1080px) {',
    '  .insights { grid-template-columns: 1fr; }',
    '  .insight { padding: 20px; }',
    '  .item-no { margin-bottom: 12px; }',
    '  .tool-row { padding-inline: 20px; }',
    '}',
    '@media (max-width: 760px) {',
    '  .page { padding: 30px 22px; }',
    '  .chapter-head { margin-bottom: 28px; font-size: 10px; }',
    '  .tool-row { padding: 10px 16px; }',
    '  .reader-controls { width: 100%; justify-content: space-between; }',
    '  .reader-controls select { flex: 1; max-width: none; }',
    '  .insights, [data-style="dashboard"] .insights, [data-style="gallery"] .insights { grid-template-columns: 1fr; }',
    '  [data-style="gallery"] .insight:first-child { grid-column: auto; padding: 22px; }',
    '  [data-style="swiss"] .insight { border-right: 0; }',
    '  [data-style="pastel"] .insight { padding: 20px; gap: 12px; }',
    '  [data-style="dashboard"] .insight:first-child { grid-row: auto; }',
    '  [data-style="dashboard"] .insight:first-child .item-no { font-size: 28px; margin-bottom: 14px; }',
    '  .lead { line-height: 1.8; }',
    '  .deck-nav { padding: 10px 16px; }',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '  html { scroll-behavior: auto; }',
    '  *, *::before, *::after { animation: none !important; transition: none !important; }',
    '}',
    '@media print {',
    '  body[data-style], body { background: white !important; color: #111 !important; --surface: white; --ink: #111; --muted: #444; --accent: #222; --line: #bbb; --soft: #f3f3f3; }',
    '  .document-tools, .skip-link { display: none !important; }',
    '  .document { max-width: none; background: none !important; }',
    '  .page, .enhanced[data-mode="deck"] .page { display: block !important; min-height: 0 !important; height: auto !important; overflow: visible !important; padding: 14mm 8mm; break-before: page; }',
    '  .page:first-child { break-before: auto; }',
    '  .insight, .table-figure { break-inside: avoid; box-shadow: none !important; background: white !important; }',
    '  h1, [data-style="spotlight"] h1, [data-style="notebook"] h1 { font-size: 32pt; }',
    '  h1, h2, h3 { break-after: avoid; }',
    '}'
  ].join('\n');

  // ---------- 运行时脚本（改编自 assets/style-preview.html 的 #document-runtime） ----------

  var H5_RUNTIME = [
    "(function () {",
    "  'use strict';",
    "  var body = document.body;",
    "  var main = document.getElementById('document');",
    "  var pages = Array.from(main.querySelectorAll(':scope > .page'));",
    "  var toc = document.getElementById('toc');",
    "  var previous = document.getElementById('previous-page');",
    "  var next = document.getElementById('next-page');",
    "  var status = document.getElementById('page-status');",
    "  var progress = document.getElementById('reading-progress');",
    "  var toolbar = document.querySelector('.document-tools');",
    "  if (!pages.length) return;",
    "  var index = 0;",
    "  var scheduled = false;",
    "  pages.forEach(function (page, i) {",
    "    var option = document.createElement('option');",
    "    option.value = String(i);",
    "    option.textContent = (i + 1 < 10 ? '0' : '') + (i + 1) + ' / ' + (page.dataset.label || '章节');",
    "    toc.appendChild(option);",
    "  });",
    "  function updateProgress() {",
    "    scheduled = false;",
    "    var toolbarHeight = toolbar.getBoundingClientRect().height;",
    "    body.style.setProperty('--tools-height', toolbarHeight + 'px');",
    "    if (body.dataset.mode === 'deck') {",
    "      progress.value = (index + 1) / pages.length * 100;",
    "      return;",
    "    }",
    "    var start = main.getBoundingClientRect().top + window.scrollY;",
    "    var distance = main.offsetHeight - window.innerHeight;",
    "    progress.value = distance <= 0 ? 100 : Math.max(0, Math.min(100, (window.scrollY - start) / distance * 100));",
    "    if (main.getBoundingClientRect().top > toolbarHeight + 32) return;",
    "    var current = 0;",
    "    pages.forEach(function (page, i) { if (page.getBoundingClientRect().top <= toolbarHeight + 32) current = i; });",
    "    index = current;",
    "    toc.value = String(index);",
    "  }",
    "  function showPage(value, focus, updateHash) {",
    "    index = Math.max(0, Math.min(pages.length - 1, value));",
    "    pages.forEach(function (page, i) {",
    "      page.classList.toggle('is-current', i === index);",
    "      if (body.dataset.mode === 'deck' && i !== index) {",
    "        page.querySelectorAll('video, audio').forEach(function (media) { media.pause(); });",
    "      }",
    "    });",
    "    toc.value = String(index);",
    "    previous.disabled = index === 0;",
    "    next.disabled = index === pages.length - 1;",
    "    status.textContent = (index + 1 < 10 ? '0' : '') + (index + 1) + ' / ' + (pages.length < 10 ? '0' : '') + pages.length;",
    "    if (updateHash) {",
    "      try { history.replaceState(null, '', '#' + encodeURIComponent(pages[index].id)); } catch (_) { }",
    "    }",
    "    if (focus) {",
    "      pages[index].scrollIntoView({ block: 'start', behavior: 'instant' });",
    "      var heading = pages[index].querySelector('h1, h2');",
    "      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }",
    "    }",
    "    updateProgress();",
    "  }",
    "  function followHash() {",
    "    var id;",
    "    try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }",
    "    if (!id) return;",
    "    var target = document.getElementById(id);",
    "    if (!target) return;",
    "    var found = pages.findIndex(function (page) { return page === target || page.contains(target); });",
    "    if (found >= 0) showPage(found, true);",
    "  }",
    "  function setMode(mode) {",
    "    if (['scroll', 'deck'].indexOf(mode) < 0) return;",
    "    body.dataset.mode = mode;",
    "    body.style.setProperty('--tools-height', toolbar.getBoundingClientRect().height + 'px');",
    "    showPage(index, false, false);",
    "    requestAnimationFrame(updateProgress);",
    "  }",
    "  previous.addEventListener('click', function () { showPage(index - 1, true, true); });",
    "  next.addEventListener('click', function () { showPage(index + 1, true, true); });",
    "  toc.addEventListener('change', function () { showPage(Number(toc.value), true, true); });",
    "  document.getElementById('print-document').addEventListener('click', function () { window.print(); });",
    "  window.addEventListener('hashchange', followHash);",
    "  window.addEventListener('keydown', function (event) {",
    "    if (body.dataset.mode !== 'deck' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;",
    "    var target = event.target;",
    "    if (target instanceof Element && (target.closest('input, textarea, select, button, a, video, audio, [role=\"textbox\"], [role=\"slider\"]') || target.isContentEditable)) return;",
    "    var targets = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: pages.length - 1 };",
    "    if (!Object.prototype.hasOwnProperty.call(targets, event.key)) return;",
    "    event.preventDefault();",
    "    showPage(targets[event.key], true, true);",
    "  });",
    "  window.addEventListener('scroll', function () {",
    "    if (!scheduled) { scheduled = true; requestAnimationFrame(updateProgress); }",
    "  }, { passive: true });",
    "  window.addEventListener('resize', updateProgress);",
    "  setMode(body.dataset.mode || 'scroll');",
    "  body.classList.add('enhanced');",
    "  followHash();",
    "  updateProgress();",
    "})();"
  ].join('\n');

  // ---------- 页面组装 ----------

  function buildInsights(points) {
    return '<div class="insights">\n' + points.map(function (point, i) {
      return '  <article class="insight"><span class="item-no">' + pad2(i + 1) + '</span><div><p>' + escapeHtml(point) + '</p></div></article>';
    }).join('\n') + '\n</div>';
  }

  /* 要点样式变体：cards 随风格（卡片/编号行），list 通用编号列表，plain 简洁列表。 */
  function buildPoints(points, mode) {
    if (mode === 'list') {
      return '<ul class="points-list">\n' + points.map(function (point, i) {
        return '  <li><span class="item-no">' + pad2(i + 1) + '</span><div>' + escapeHtml(point) + '</div></li>';
      }).join('\n') + '\n</ul>';
    }
    if (mode === 'plain') {
      return '<ul class="points-plain">\n' + points.map(function (point) {
        return '  <li>' + escapeHtml(point) + '</li>';
      }).join('\n') + '\n</ul>';
    }
    return buildInsights(points);
  }

  function buildTable(table, caption) {
    var headers = table.headers.slice(0, 6);
    var rows = table.rows.slice(0, 12).map(function (row) { return row.slice(0, 6); });
    var head = '<tr>' + headers.map(function (cell) { return '<th>' + escapeHtml(cell) + '</th>'; }).join('') + '</tr>';
    var bodyRows = rows.map(function (row) {
      return '<tr>' + row.map(function (cell) { return '<td>' + escapeHtml(cell) + '</td>'; }).join('') + '</tr>';
    }).join('\n      ');
    var captionHtml = caption ? '<figcaption>' + escapeHtml(caption) + '</figcaption>' : '';
    return '<figure class="table-figure">\n    <table>\n      <thead>' + head + '</thead>\n      <tbody>\n      ' + bodyRows + '\n      </tbody>\n    </table>\n    ' + captionHtml + '\n  </figure>';
  }

  function buildImage(section, alt) {
    var captionHtml = section.caption ? '<figcaption>' + escapeHtml(section.caption) + '</figcaption>' : '';
    return '<figure class="media-frame"><img src="' + section.image.dataUrl + '" alt="' + escapeHtml(section.caption || alt) + '">' + captionHtml + '</figure>';
  }

  function buildH5(state) {
    var styles = DATA.STYLES;
    var styleEntry = styles.find(function (s) { return s.id === state.style; }) || styles[0];
    var mode = state.mode === 'deck' ? 'deck' : 'scroll';
    var layout = state.layout || {};
    var widthSetting = ['narrow', 'standard', 'wide'].indexOf(layout.width) >= 0 ? layout.width : '';
    var densitySetting = ['compact', 'relaxed'].indexOf(layout.density) >= 0 ? layout.density : '';
    var titleSetting = ['sans', 'serif'].indexOf(layout.title) >= 0 ? layout.title : '';
    var pointsMode = ['cards', 'list', 'plain'].indexOf(layout.points) >= 0 ? layout.points : 'cards';
    var meta = state.meta || {};
    var title = String(meta.title || '').trim() || '未命名';
    var subtitle = String(meta.subtitle || '').trim();
    var presenter = String(meta.presenter || '').trim();
    var sections = Array.isArray(state.sections) ? state.sections : [];
    var totalPages = sections.length + 1;

    var pages = [];

    // 封面（布局：跟随风格或用户指定）
    var coverMode = ['classic', 'centered', 'panel'].indexOf(layout.cover) >= 0 ? layout.cover : (styleEntry.cover || 'classic');
    pages.push([
      '<section class="page cover cover-' + coverMode + '" id="cover" data-label="封面">',
      '  <div class="chapter-head"><span>' + escapeHtml(clampText(title, 48)) + '</span><span>封面</span></div>',
      '  <div class="cover-body">',
      '    <h1 tabindex="-1">' + escapeHtml(title) + '</h1>',
      subtitle ? '    <p class="lead">' + escapeHtml(subtitle) + '</p>' : '',
      presenter ? '    <p class="source-note">' + escapeHtml(presenter) + '</p>' : '',
      '  </div>',
      '  <div class="page-foot"><span>内容网页 · ' + escapeHtml(styleEntry.name) + '</span><span>共 ' + totalPages + ' 页</span></div>',
      '</section>'
    ].filter(Boolean).join('\n'));

    sections.forEach(function (section, index) {
      var label = String(section.title || '').trim() || '第 ' + (index + 1) + ' 节';
      var part = [];
      part.push('<section class="page" id="sec-' + (index + 1) + '" data-label="' + escapeHtml(clampText(label, 40)) + '">');
      part.push('  <div class="chapter-head"><span>' + escapeHtml(clampText(title, 48)) + '</span><span>' + pad2(index + 1) + ' / ' + escapeHtml(clampText(label, 40)) + '</span></div>');
      if (String(section.subtitle || '').trim()) part.push('  <p class="kicker">' + escapeHtml(section.subtitle.trim()) + '</p>');
      part.push('  <h2 tabindex="-1">' + escapeHtml(label) + '</h2>');
      linesOf(section.paragraphs).forEach(function (paragraph, i) {
        part.push(i === 0 ? '  <p class="lead">' + escapeHtml(paragraph) + '</p>' : '  <p>' + escapeHtml(paragraph) + '</p>');
      });
      var points = linesOf(section.points);
      if (points.length) part.push('  ' + buildPoints(points, pointsMode));
      var table = parseTable(section.tableTsv);
      if (table) part.push('  ' + buildTable(table, String(section.caption || '').trim()));
      if (section.image && section.image.dataUrl) part.push('  ' + buildImage(section, label));
      part.push('</section>');
      pages.push(part.join('\n'));
    });

    var description = subtitle || (title + ' · 内容网页');
    return [
      '<!DOCTYPE html>',
      '<html lang="zh-CN">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="description" content="' + escapeHtml(description) + '">',
      '<title>' + escapeHtml(title) + '</title>',
      '<!-- 由网页版工作室生成：单文件、离线可用、无外部依赖。 -->',
      '<style>',
      H5_CSS,
      '</style>',
      '</head>',
      '<body data-style="' + styleEntry.id + '" data-mode="' + mode + '"' +
        (widthSetting ? ' data-width="' + widthSetting + '"' : '') +
        (densitySetting ? ' data-density="' + densitySetting + '"' : '') +
        (titleSetting ? ' data-title="' + titleSetting + '"' : '') + '>',
      '<a class="skip-link" href="#document">跳到内容</a>',
      '<header class="document-tools">',
      '  <div class="tool-row">',
      '    <div class="document-identity"><span id="document-title">' + escapeHtml(title) + '</span></div>',
      '    <div class="reader-controls">',
      '      <label class="sr-only" for="toc">跳转章节</label>',
      '      <select id="toc" aria-label="跳转章节"></select>',
      '      <button class="tool-button" type="button" id="print-document">打印 / PDF</button>',
      '    </div>',
      '  </div>',
      '  <nav class="deck-nav" aria-label="演示翻页">',
      '    <button class="tool-button" type="button" id="previous-page">← 上一页</button>',
      '    <span id="page-status" role="status" aria-live="polite"></span>',
      '    <button class="tool-button" type="button" id="next-page">下一页 →</button>',
      '  </nav>',
      '  <progress id="reading-progress" class="progress" max="100" value="0" aria-label="阅读进度"></progress>',
      '</header>',
      '<main class="document" id="document" tabindex="-1">',
      pages.join('\n'),
      '</main>',
      '<script>',
      H5_RUNTIME,
      '</script>',
      '</body>',
      '</html>',
      ''
    ].join('\n');
  }

  // ---------- 表格解析（制表符 / 竖线 / 逗号） ----------

  function parseTable(text) {
    var rows = linesOf(text).map(function (line) {
      var cells = line.indexOf('\t') >= 0 ? line.split('\t')
        : line.indexOf('|') >= 0 ? line.split('|')
        : line.split(',');
      return cells.map(function (cell) { return cell.trim(); });
    });
    if (rows.length < 2 || rows[0].length < 2) return null;
    var width = rows[0].length;
    return {
      headers: rows[0],
      rows: rows.slice(1).map(function (row) {
        var out = row.slice(0, width);
        while (out.length < width) out.push('');
        return out;
      })
    };
  }

  SB.escapeHtml = escapeHtml;
  SB.linesOf = linesOf;
  SB.clampText = clampText;
  SB.parseTable = parseTable;
  SB.buildH5 = buildH5;
  SB.H5_CSS = H5_CSS;

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);
