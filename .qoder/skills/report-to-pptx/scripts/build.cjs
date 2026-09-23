'use strict';

// 无模板 PPTX 生成骨架；仅处理已授权项目，文本/图表均为原生对象。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PptxGenJS = require('pptxgenjs');
const SKILL = path.resolve(__dirname, '..');
const TONES = JSON.parse(fs.readFileSync(path.join(SKILL, 'assets/tones.json'), 'utf8'));
const MAX_FILE = 128 * 1024 * 1024;
const TOP = ['schema_version', 'slug', 'title', 'purpose', 'audience', 'duration_minutes', 'presenter', 'tone', 'tone_notes', 'custom_tone', 'aspect_ratio', 'template', 'speaker_notes', 'slides'];
const COMMON = ['id', 'layout', 'title', 'subtitle', 'notes', 'source', 'links'];
const LAYOUTS = { cover: [], section: [], closing: [], points: ['points'], 'two-column': ['columns'], image: ['image', 'caption', 'points'], table: ['table'], chart: ['chart'] };
const ATTACHMENTS = new Set(['.pdf', '.txt', '.md', '.csv', '.json', '.docx', '.pptx', '.xlsx', '.zip', '.mp4', '.webm', '.mov', '.mp3', '.wav', '.png', '.jpg', '.jpeg']);

function requireThat(condition, message) { if (!condition) throw new Error(message); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fields(value, allowed, label) {
  requireThat(isObject(value), `${label} 必须是对象。`);
  requireThat(Object.keys(value).every(key => allowed.includes(key)), `${label} 含未知字段，请检查拼写或扩展生成器。`);
}
function text(value, label, max = 500, empty = false) {
  requireThat(typeof value === 'string' && (empty || value.trim()) && Array.from(value).length <= max, `${label} 必须是${empty ? '' : '非空'}文本，最多 ${max} 字符；请拆页而不是缩小字号。`);
  requireThat(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value), `${label} 含非法控制字符。`);
  return value;
}
function slug(value) {
  requireThat(typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(value), '标识应为 1–48 位小写字母、数字或连字符。');
  return value;
}
function version(value) {
  requireThat(/^v\d{3}$/.test(value) && value !== 'v000', '版本必须是 v001 至 v999。');
  return value;
}
function sanitizePath(userPath, safeDir) {
  requireThat(typeof userPath === 'string' && userPath.length > 0 && !/[\\:\u0000-\u001F]/u.test(userPath), '路径格式非法。');
  const parts = userPath.split('/');
  requireThat(!path.isAbsolute(userPath) && parts.every(part => part && part !== '..' && part !== '.' && !part.startsWith('.')), '路径必须是项目内相对路径，不能含隐藏目录或 ..。');
  const base = path.resolve(safeDir);
  const result = path.resolve(base, userPath);
  const relative = path.relative(base, result);
  requireThat(relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), '路径越出授权项目。');
  let current = base;
  for (const part of parts) {
    current = path.join(current, part);
    try { requireThat(!fs.lstatSync(current).isSymbolicLink(), '不能跟随符号链接。'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return result;
}
function readJson(file) {
  requireThat(fs.statSync(file).size <= 1024 * 1024, '配置超过 1 MiB。');
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/u, ''));
}
function loadConfig(root) { return readJson(sanitizePath('presentation.json', root)); }
function localMaterial(relative, root, extensions) {
  requireThat(typeof relative === 'string' && relative.startsWith('materials/'), '素材必须位于 materials/。');
  const resolved = sanitizePath(relative, root);
  requireThat(extensions.has(path.extname(resolved).toLowerCase()), '素材格式不支持；主动内容或程序不能作为附件。');
  const stat = fs.statSync(resolved);
  requireThat(stat.isFile() && stat.size <= MAX_FILE, '素材不是普通文件或超过 128 MiB。');
  return resolved;
}
function webUrl(value) {
  text(value, '链接 URL', 2000);
  requireThat(!/[\s\\]/u.test(value), '外链含空白或反斜杠。');
  const url = new URL(value);
  requireThat(['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password, '只接受无凭证的完整 HTTP(S) 外链。');
  return value;
}
function luminance(hex) {
  const c = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function resolveTone(config) {
  requireThat(config.tone === 'custom' || Object.hasOwn(TONES, config.tone), '请先选择基调，不能把 ask 当作已确认选择。');
  fields(config.custom_tone || {}, ['name', 'background', 'text', 'muted', 'accent', 'surface', 'fontFace', 'titleFontFace', 'coverLayout', 'panelStyle'], 'custom_tone');
  const tone = { coverLayout: 'classic', panelStyle: 'filled', ...(TONES[config.tone] || TONES['academic-blue']), ...config.custom_tone };
  tone.titleFontFace = tone.titleFontFace || tone.fontFace;
  requireThat(['classic', 'centered', 'panel'].includes(tone.coverLayout), 'coverLayout 必须是 classic/centered/panel。');
  requireThat(['filled', 'outline', 'none'].includes(tone.panelStyle), 'panelStyle 必须是 filled/outline/none。');
  for (const key of ['background', 'text', 'muted', 'accent', 'surface']) requireThat(/^[a-fA-F0-9]{6}$/.test(tone[key]), `基调 ${key} 必须是无 # 的六位 HEX。`);
  for (const bg of ['background', 'surface']) for (const ink of ['text', 'muted', 'accent']) requireThat(contrast(tone[bg], tone[ink]) >= 4.5, `${ink} 与 ${bg} 对比度不足。`);
  text(tone.fontFace, 'fontFace', 80);
  text(tone.titleFontFace, 'titleFontFace', 80);
  text(tone.name, '基调名称', 48);
  return tone;
}
function stringList(value, label, count, length) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= count, `${label} 应含 1–${count} 项。`);
  value.forEach(item => text(item, label, length));
}
function validateConfig(config, root, preview = false) {
  fields(config, TOP, 'presentation.json');
  requireThat(config.schema_version === 1, '仅支持 schema_version=1。');
  slug(config.slug); text(config.title, 'title', 100);
  for (const key of ['purpose', 'audience', 'presenter', 'tone_notes']) text(config[key] ?? '', key, 500, true);
  requireThat(config.duration_minutes === null || (typeof config.duration_minutes === 'number' && Number.isFinite(config.duration_minutes) && config.duration_minutes > 0), '时长必须是正数或 null。');
  requireThat(['16:9', '4:3'].includes(config.aspect_ratio), '骨架支持 16:9 或 4:3；其他比例请扩展布局。');
  requireThat(typeof config.speaker_notes === 'boolean', 'speaker_notes 必须是布尔值。');
  requireThat(config.template === null || config.template === undefined, '已指定模板：请走模板复制/编辑流程，骨架不会忽略模板重建。');
  if (!preview) resolveTone(config);
  requireThat(Array.isArray(config.slides) && config.slides.length <= 200 && (preview || config.slides.length > 0), '请填写 1–200 页内容。');
  const ids = new Set();
  for (const slide of config.slides) {
    requireThat(isObject(slide) && Object.hasOwn(LAYOUTS, slide.layout), '页面 layout 不受骨架支持，请按需扩展而非忽略内容。');
    fields(slide, [...COMMON, ...LAYOUTS[slide.layout]], 'slide');
    slug(slide.id); requireThat(!ids.has(slide.id), '页面 ID 不能重复。'); ids.add(slide.id);
    text(slide.title, '页面标题', 56);
    text(slide.subtitle ?? '', 'subtitle', 100, true);
    text(slide.source ?? '', 'source', 100, true);
    if (config.speaker_notes) text(slide.notes, '演讲备注', 5000);
    else if (slide.notes !== undefined) text(slide.notes, '演讲备注', 5000, true);
    if (slide.layout === 'points' || slide.layout === 'image') stringList(slide.points, '要点', 4, 64);
    if (slide.layout === 'two-column') {
      requireThat(Array.isArray(slide.columns) && slide.columns.length === 2, '双栏必须恰好两列。');
      for (const column of slide.columns) { fields(column, ['title', 'points'], 'column'); text(column.title, '列标题', 24); stringList(column.points, '列要点', 3, 54); }
    }
    if (slide.layout === 'image') { localMaterial(slide.image, root, new Set(['.png', '.jpg', '.jpeg'])); text(slide.caption, '图片说明/替代文本', 100); }
    if (slide.layout === 'table') {
      fields(slide.table, ['headers', 'rows'], 'table');
      stringList(slide.table.headers, '表头', 5, 20);
      requireThat(Array.isArray(slide.table.rows) && slide.table.rows.length > 0 && slide.table.rows.length <= 5, '表格最多 5 行正文，更多请拆页。');
      for (const row of slide.table.rows) {
        requireThat(Array.isArray(row) && row.length === slide.table.headers.length, '表格列数不一致。');
        row.forEach(cell => { requireThat(typeof cell === 'string' || (typeof cell === 'number' && Number.isFinite(cell)), '表格单元格必须是文本或有限数值。'); text(String(cell), '表格单元格', 28, true); });
      }
      text(slide.source, '表格来源', 100);
    }
    if (slide.layout === 'chart') {
      fields(slide.chart, ['kind', 'categories', 'series', 'unit'], 'chart');
      requireThat(['bar', 'line'].includes(slide.chart.kind), '骨架图表支持 bar/line。');
      stringList(slide.chart.categories, '图表分类', 8, 14);
      requireThat(Array.isArray(slide.chart.series) && slide.chart.series.length > 0 && slide.chart.series.length <= 3, '图表支持 1–3 个序列。');
      for (const series of slide.chart.series) { fields(series, ['name', 'values'], 'series'); text(series.name, '序列名称', 20); requireThat(Array.isArray(series.values) && series.values.length === slide.chart.categories.length && series.values.every(v => typeof v === 'number' && Number.isFinite(v)), '图表数据必须为与分类数一致的有限数值。'); }
      text(slide.chart.unit, '图表单位', 20); text(slide.source, '图表来源', 100);
    }
    requireThat(slide.links === undefined || (Array.isArray(slide.links) && slide.links.length <= 2), '每页最多两个链接，更多请做附件页。');
    for (const link of slide.links || []) {
      fields(link, ['label', 'url', 'file'], 'link'); text(link.label, '链接文字', 30);
      requireThat(Boolean(link.url) !== Boolean(link.file), '链接必须且只能填写 url 或 file。');
      if (link.url) webUrl(link.url); else localMaterial(link.file, root, ATTACHMENTS);
    }
  }
  return config;
}

// 只作保守的排版容量检查，实际换行仍需目标 Office 渲染验收。
function estimatedLines(value, width, size) {
  const capacity = width * 72 / size;
  return value.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).reduce((n, c) => n + (/[^\x00-\x7F]/u.test(c) ? 1 : 0.58), 0) / capacity)), 0);
}
function addText(slide, value, x, y, w, h, size, tone, options = {}) {
  if (!value) return;
  requireThat(estimatedLines(value, w, size) * size * 1.25 <= h * 72 + 2, `文本可能溢出，请拆分：${value.slice(0, 36)}`);
  slide.addText(value, { x, y, w, h, fontFace: tone.fontFace, fontSize: size, color: tone.text, margin: 0, breakLine: false, valign: 'top', ...options });
}
function sampleSlides(config) {
  return [
    { id: 'cover', layout: 'cover', title: '让内容清楚，让证据可信', subtitle: '汇报与答辩 · 同内容基调样张', notes: '这组页面只用于选择基调，不是实际汇报内容。', source: '设计样张，无研究或业务数据' },
    { id: 'points', layout: 'points', title: '清晰表达，不需要过多装饰', points: ['先明确听众需要理解或决定的问题。', '每页围绕一个观点，用材料和证据支撑。', '把复杂细节放入备注与附录，保持放映可读。'], notes: '说明基调会同时影响语言、信息密度、配色和留白，而不只是换颜色。', source: '设计样张，无研究或业务数据' },
    { id: 'compare', layout: 'two-column', title: '汇报与答辩，各有重点', columns: [{ title: '工作汇报', points: ['目标、进展与结果。', '问题、原因与风险。', '下一步和需要的支持。'] }, { title: '研究答辩', points: ['问题、方法与证据。', '贡献、边界与局限。', '备选解释与后续研究。'] }], notes: '结构仅作示例。实际制作尊重用户给定的章节、模板和评价要求。', source: '用户可自定义结构与基调' },
  ];
}
function newPresentation(config) {
  const pptx = new PptxGenJS();
  const width = config.aspect_ratio === '4:3' ? 10 : 13.333333;
  pptx.defineLayout({ name: 'REPORT', width, height: 7.5 }); pptx.layout = 'REPORT';
  pptx.author = config.presenter || ''; pptx.subject = config.purpose; pptx.title = config.title;
  pptx.company = ''; pptx.lang = 'zh-CN';
  return { pptx, width };
}
function attachFiles(slides, root) {
  const files = new Map(); let total = 0;
  for (const slide of slides) for (const link of slide.links || []) if (link.file && !files.has(link.file)) {
    const file = localMaterial(link.file, root, ATTACHMENTS);
    const data = fs.readFileSync(file); total += data.length;
    requireThat(total <= 256 * 1024 * 1024, '选定附件总计超过 256 MiB，请拆包。');
    const digest = crypto.createHash('sha256').update(data).digest('hex');
    const href = `assets/file-${digest.slice(0, 16)}${path.extname(file).toLowerCase()}`;
    files.set(link.file, { href, data, sha256: digest });
  }
  return files;
}
function renderSlide(pptx, width, spec, tone, config, number, total, files) {
  const slide = pptx.addSlide(); slide.background = { color: tone.background };
  const W = width - 1.2;
  const footer = spec.source || config.purpose || '';
  addText(slide, footer, 0.6, 6.96, W - 1.1, 0.32, 11, tone, { color: tone.muted, objectName: 'footer-source' });
  addText(slide, `${number} / ${total}`, width - 1.45, 6.96, 0.85, 0.32, 11, tone, { color: tone.muted, align: 'right', objectName: 'footer-page' });
  const titleFontFace = tone.titleFontFace || tone.fontFace;
  if (['cover', 'section', 'closing'].includes(spec.layout)) {
    const align = tone.coverLayout === 'centered' ? 'center' : 'left';
    if (tone.coverLayout === 'panel') slide.addShape(pptx.ShapeType.rect, { x: 0.4, y: 1.1, w: width - 0.8, h: 5.05, fill: { color: tone.surface }, line: { color: tone.surface }, objectName: 'cover-panel' });
    addText(slide, tone.name, 0.65, 1.35, W, 0.45, 18, tone, { color: tone.accent, align });
    addText(slide, spec.title, 0.65, 2.15, W - 0.1, 1.9, 40, tone, { bold: true, color: tone.accent, fontFace: titleFontFace, align, objectName: 'slide-title' });
    addText(slide, spec.subtitle || '', 0.65, 4.4, W, 1.0, 24, tone, { color: tone.muted, align });
    addText(slide, config.presenter || '', 0.65, 5.75, W, 0.5, 18, tone, { align });
  } else {
    addText(slide, spec.title, 0.6, 0.55, W, 1.05, 32, tone, { bold: true, fontFace: titleFontFace, objectName: 'slide-title' });
    if (spec.subtitle) addText(slide, spec.subtitle, 0.6, 1.58, W, 0.7, 18, tone, { color: tone.muted });
    const top = spec.subtitle ? 2.42 : 1.95;
    const area = 6.18 - top;
    if (spec.layout === 'points') {
      const row = area / spec.points.length;
      spec.points.forEach((value, i) => { addText(slide, String(i + 1).padStart(2, '0'), 0.65, top + i * row, 0.65, 0.6, 22, tone, { color: tone.accent, bold: true }); addText(slide, value, 1.5, top + i * row, W - 0.9, row - 0.14, 24, tone); });
    } else if (spec.layout === 'two-column') {
      const cw = (W - 0.4) / 2;
      spec.columns.forEach((column, i) => {
        const x = 0.6 + i * (cw + 0.4);
        if (tone.panelStyle !== 'none') slide.addShape(pptx.ShapeType.rect, { x, y: top, w: cw, h: area, fill: { color: tone.panelStyle === 'outline' ? tone.background : tone.surface }, line: { color: tone.panelStyle === 'outline' ? tone.muted : tone.surface, width: 0.75 }, objectName: 'column-panel' });
        addText(slide, column.title, x + 0.25, top + 0.2, cw - 0.5, 0.7, 24, tone, { bold: true, color: tone.accent, fontFace: titleFontFace });
        const row = (area - 1.1) / column.points.length;
        column.points.forEach((value, j) => addText(slide, value, x + 0.25, top + 1.05 + j * row, cw - 0.5, row - 0.08, 22, tone));
      });
    } else if (spec.layout === 'image') {
      const tw = W * 0.39, iw = W - tw - 0.4;
      const row = area / spec.points.length;
      spec.points.forEach((value, i) => addText(slide, value, 0.6, top + i * row, tw, row - 0.12, 22, tone));
      const file = localMaterial(spec.image, config.root, new Set(['.png', '.jpg', '.jpeg']));
      slide.addImage({ path: file, x: 1 + tw, y: top, w: iw, h: area - 0.8, sizing: { type: 'contain', w: iw, h: area - 0.8 }, altText: spec.caption, objectName: 'evidence-image' });
      addText(slide, spec.caption, 1 + tw, top + area - 0.7, iw, 0.7, 14, tone, { color: tone.muted });
    } else if (spec.layout === 'table') {
      const rows = [spec.table.headers.map(value => ({ text: value, options: { bold: true, color: tone.accent, fill: { color: tone.surface } } })), ...spec.table.rows.map(row => row.map(String))];
      const cw = W / spec.table.headers.length, rh = area / rows.length;
      rows.flat().forEach(cell => requireThat(estimatedLines(typeof cell === 'string' ? cell : cell.text, cw - 0.24, 18) * 23 <= (rh - 0.15) * 72, '表格过密，请减少列数或拆页。'));
      slide.addTable(rows, { x: 0.6, y: top, w: W, h: area, rowH: rh, colW: cw, autoPage: false, fontFace: tone.fontFace, fontSize: 18, color: tone.text, fill: { color: tone.background }, border: { color: tone.surface, pt: 1 }, margin: 6, valign: 'mid', objectName: 'editable-table' });
    } else if (spec.layout === 'chart') {
      const data = spec.chart.series.map(series => ({ name: series.name, labels: spec.chart.categories, values: series.values }));
      slide.addChart(spec.chart.kind === 'bar' ? pptx.ChartType.bar : pptx.ChartType.line, data, { x: 0.6, y: top, w: W, h: area, barDir: 'col', showLegend: data.length > 1, legendPos: 'b', legendFontSize: 16, catAxisLabelFontSize: 18, valAxisLabelFontSize: 16, showValue: true, dataLabelFormatCode: '0.##', dataLabelColor: tone.text, dataLabelPosition: 'outEnd', chartColors: [tone.accent, tone.muted, tone.text], catAxisLabelColor: tone.text, valAxisLabelColor: tone.muted, showCatName: false, showTitle: false, showValueName: false, showValAxisTitle: true, valAxisTitle: spec.chart.unit, valAxisTitleFontSize: 16, chartArea: { fill: { color: tone.background } }, plotArea: { fill: { color: tone.background } }, objectName: 'editable-chart' });
    }
  }
  (spec.links || []).forEach((link, i) => { const url = link.url || files.get(link.file).href; addText(slide, link.label, 0.65 + i * W / 2, 6.4, W / 2 - 0.2, 0.38, 16, tone, { color: tone.accent, underline: true, hyperlink: { url }, objectName: 'resource-link' }); });
  if (config.speaker_notes) slide.addNotes(`${spec.notes}\n${spec.source ? '来源：' + spec.source : ''}`);
}
async function savePresentation(root, relative, filename, pptx, files, report, notes) {
  const output = sanitizePath(relative, root);
  requireThat(!fs.existsSync(output), '输出版本已存在，未做覆盖；请选择新版本。');
  const buffer = await pptx.write({ outputType: 'nodebuffer', compression: true });
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.mkdirSync(output);
  for (const asset of files.values()) {
    const target = sanitizePath(asset.href, output); fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) fs.writeFileSync(target, asset.data, { flag: 'wx' });
  }
  fs.writeFileSync(sanitizePath(filename, output), buffer, { flag: 'wx' });
  fs.writeFileSync(sanitizePath('build-report.json', output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  if (notes) fs.writeFileSync(sanitizePath('speaker-notes.txt', output), notes, { flag: 'wx' });
  return { file: path.join(output, filename), slides: report.slides, attachments: files.size, warning: '已生成原生 PPTX；仍需结构检查与目标 Office 渲染验收。' };
}
async function build(root, selectedVersion = 'v001', preview = false) {
  version(selectedVersion);
  const cfg = validateConfig(loadConfig(root), root, preview);
  const slides = preview ? (cfg.slides.length ? cfg.slides.slice(0, 3) : sampleSlides(cfg)) : cfg.slides;
  const files = attachFiles(slides, root);
  const { pptx, width } = newPresentation(cfg);
  const tones = preview ? Object.keys(TONES).map(tone => resolveTone({ tone, custom_tone: {} })) : [resolveTone(cfg)];
  let page = 0; const notes = [];
  for (const tone of tones) for (const spec of slides) {
    renderSlide(pptx, width, spec, tone, { ...cfg, root }, ++page, slides.length * tones.length, files);
    notes.push(`第 ${page} 页：${spec.title}\n${spec.notes || ''}\n${spec.source || ''}`);
  }
  const report = { slides: page, aspect_ratio: cfg.aspect_ratio, tones: tones.map(t => t.name), native_objects: true, rendered: false, attachments: [...files.values()].map(({ href, sha256, data }) => ({ href, sha256, bytes: data.length })) };
  return savePresentation(root, `${preview ? 'preview' : 'dist'}/${selectedVersion}`, preview ? 'tone-preview.pptx' : `${cfg.slug}-${selectedVersion}.pptx`, pptx, files, report, cfg.speaker_notes ? notes.join('\n\n') + '\n' : '');
}
function init(root) {
  requireThat(!fs.existsSync(root), '项目已存在，未做覆盖。');
  const cfg = readJson(path.join(SKILL, 'assets/project-template.json')); cfg.slug = slug(path.basename(root));
  fs.mkdirSync(root, { recursive: true });
  for (const folder of ['docs', 'images', 'videos', 'files', 'templates', 'data']) fs.mkdirSync(sanitizePath(`materials/${folder}`, root), { recursive: true });
  fs.writeFileSync(sanitizePath('presentation.json', root), JSON.stringify(cfg, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(sanitizePath('BRIEF.txt', root), '用途与听众：\n时长或页数：\n章节顺序：\n希望采用的基调：默认克制清晰，可自定义。\n是否有机构模板：\n图表、视频和附件的位置：\n是否需要演讲备注：\n哪些内容不能公开：\n\n可直接在对话说明要求，不必自己编辑 JSON。\n', { flag: 'wx' });
  return { project: root, message: '请放入材料并填写要求；配置可以由助手代填。' };
}
async function main() {
  const [command, project, selectedVersion = 'v001'] = process.argv.slice(2);
  requireThat(['init', 'preview', 'build'].includes(command) && project, '用法：node build.cjs init|preview|build <项目目录> [v001]');
  const safeDir = path.resolve(project);
  if (fs.existsSync(safeDir)) requireThat(!fs.lstatSync(safeDir).isSymbolicLink(), '项目根目录不能是符号链接。');
  const result = command === 'init' ? init(safeDir) : await build(safeDir, selectedVersion, command === 'preview');
  console.log(JSON.stringify(result, null, 2));
}
module.exports = { TONES, sanitizePath, webUrl, resolveTone, validateConfig, estimatedLines, init, build, sampleSlides };
if (require.main === module) main().catch(error => { console.error(`操作失败：${error.message}\n未改写原件；如果有未完成输出，请先检查，不能直接交付。`); process.exitCode = 1; });
