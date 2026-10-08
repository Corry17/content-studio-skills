/* 网页版工作室 · PPT 生成器：状态 -> 演示模型 / 原生 PPTX / presentation.json
 * 版式与基调取自 report-to-pptx 技能：scripts/build.cjs 与 assets/tones.json。
 * PPTX 与页面示意共用同一份“版式计算”（layoutSlide，单位：英寸），保证两者一致。 */
(function (root) {
  'use strict';

  var DATA = root.StudioData;
  var SB = root.StudioBuild = root.StudioBuild || {};
  var linesOf = SB.linesOf;
  var parseTable = SB.parseTable;
  var clampText = SB.clampText;

  var SLIDE_W = 13.333333;
  var SLIDE_H = 7.5;
  var MARGIN = 0.6;
  var MIME_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

  function pad2(value) { return value < 10 ? '0' + value : String(value); }

  // ---------- 文本容量估算（与 build.cjs 相同的保守算法） ----------

  function estimatedLines(value, width, size) {
    var capacity = width * 72 / size;
    return String(value == null ? '' : value).split('\n').reduce(function (sum, line) {
      var units = 0;
      Array.from(line).forEach(function (ch) { units += /[^\x00-\x7F]/.test(ch) ? 1 : 0.58; });
      return sum + Math.max(1, Math.ceil(units / capacity));
    }, 0);
  }

  /* 从大到小挑选能放下的字号；粗体按 0.94 折减宽度。 */
  function fitSize(text, width, height, sizes, bold) {
    var usable = bold ? width * 0.94 : width;
    for (var i = 0; i < sizes.length; i++) {
      var size = sizes[i];
      if (estimatedLines(text, usable, size) * size * 1.25 / 72 <= height + 0.01) return size;
    }
    return sizes[sizes.length - 1];
  }

  function fitItems(items, width, area, sizes, gap) {
    for (var i = 0; i < sizes.length; i++) {
      var size = sizes[i];
      var need = items.reduce(function (sum, item) { return sum + estimatedLines(item, width, size) * size * 1.25 / 72; }, 0);
      if (need + gap * Math.max(0, items.length - 1) <= area + 0.01) return size;
    }
    return sizes[sizes.length - 1];
  }

  function titleFontOf(tone) { return tone.titleFontFace || tone.fontFace; }

  // ---------- 信息密度预设（网页版式设置，影响生成文件字号与行距） ----------

  var DENSITIES = {
    compact: { coverTitle: [36, 30, 26], coverSubtitle: [22, 20], coverLabel: 16, presenter: 16, title: [28, 24, 20, 18], subtitle: [16, 14], points: [22, 20, 18, 16, 14], numberSize: 20, gap: 0.1, imagePoints: [20, 18, 16], tableSmall: 12, tableLarge: 14 },
    standard: { coverTitle: [40, 34, 30], coverSubtitle: [24, 22, 20], coverLabel: 18, presenter: 18, title: [32, 28, 24, 20], subtitle: [18, 16], points: [24, 22, 20, 18, 16], numberSize: 22, gap: 0.12, imagePoints: [22, 20, 18, 16], tableSmall: 14, tableLarge: 16 },
    relaxed: { coverTitle: [44, 38, 32], coverSubtitle: [26, 24, 22], coverLabel: 20, presenter: 20, title: [36, 32, 28, 24], subtitle: [20, 18], points: [26, 24, 22, 20, 18], numberSize: 24, gap: 0.16, imagePoints: [24, 22, 20, 18], tableSmall: 16, tableLarge: 18 }
  };

  function resolveDensity(state) {
    var key = state.layout && DENSITIES[state.layout.pptDensity] ? state.layout.pptDensity : 'standard';
    return DENSITIES[key];
  }

  // ---------- 演示模型 ----------

  function buildDeck(state) {
    var meta = state.meta || {};
    var title = String(meta.title || '').trim() || '未命名汇报';
    var subtitle = String(meta.subtitle || '').trim();
    var presenter = String(meta.presenter || '').trim();
    var toneEntry = DATA.TONES[state.tone] || DATA.TONES['academic-blue'];
    var tone = {};
    Object.keys(toneEntry).forEach(function (key) { tone[key] = toneEntry[key]; });
    tone.coverLayout = tone.coverLayout || 'classic';
    var layout = state.layout || {};
    if (['classic', 'centered', 'panel'].indexOf(layout.pptCover) >= 0) tone.coverLayout = layout.pptCover;
    if (layout.pptTitleFont === 'yahei') tone.titleFontFace = 'Microsoft YaHei';
    else if (layout.pptTitleFont === 'song') tone.titleFontFace = 'SimSun';
    var sections = Array.isArray(state.sections) ? state.sections : [];
    var slides = [];

    slides.push({ layout: 'cover', title: title, subtitle: subtitle, presenter: presenter, footer: subtitle, notes: '' });

    sections.forEach(function (section, index) {
      var label = String(section.title || '').trim() || '第 ' + (index + 1) + ' 节';
      var secSubtitle = String(section.subtitle || '').trim();
      var notes = String(section.notes || '').trim();
      if (section.kind === 'section' || section.kind === 'closing') {
        slides.push({ layout: section.kind, title: label, subtitle: secSubtitle, presenter: '', footer: subtitle, notes: notes });
        return;
      }
      var points = linesOf(section.points);
      if (!points.length) points = linesOf(section.paragraphs);
      var table = parseTable(section.tableTsv);
      if (section.image && section.image.dataUrl) {
        slides.push({
          layout: 'image', title: label, subtitle: secSubtitle, points: points.slice(0, 4), footer: subtitle, notes: notes,
          image: { dataUrl: section.image.dataUrl, caption: String(section.caption || '').trim() }
        });
      } else if (table) {
        slides.push({ layout: 'table', title: label, subtitle: secSubtitle, table: table, footer: subtitle, notes: notes });
      } else {
        slides.push({ layout: 'points', title: label, subtitle: secSubtitle, points: points, footer: subtitle, notes: notes });
      }
    });

    return {
      toneKey: DATA.TONES[state.tone] ? state.tone : 'academic-blue',
      tone: tone,
      metrics: resolveDensity(state),
      meta: { title: title, subtitle: subtitle, presenter: presenter },
      slides: slides
    };
  }

  // ---------- 版式计算（英寸坐标；PPTX 与页面示意共用） ----------

  function layoutSlide(slide, tone, page, total, metrics) {
    var els = [];
    var W = SLIDE_W - MARGIN * 2;
    var M2 = metrics || DENSITIES.standard;
    var titleFont = titleFontOf(tone);

    els.push({ kind: 'text', x: MARGIN, y: 6.96, w: W - 1.1, h: 0.32, text: slide.footer || '', size: 11, color: tone.muted, font: 'body', align: 'left', objectName: 'footer-source' });
    els.push({ kind: 'text', x: SLIDE_W - 1.45, y: 6.96, w: 0.85, h: 0.32, text: page + ' / ' + total, size: 11, color: tone.muted, font: 'body', align: 'right', objectName: 'footer-page' });

    if (slide.layout === 'cover' || slide.layout === 'section' || slide.layout === 'closing') {
      var align = tone.coverLayout === 'centered' ? 'center' : 'left';
      if (tone.coverLayout === 'panel') {
        els.push({ kind: 'shape', x: 0.4, y: 1.1, w: SLIDE_W - 0.8, h: 5.05, fill: tone.surface, line: tone.surface, objectName: 'cover-panel' });
      }
      els.push({ kind: 'text', x: 0.65, y: 1.35, w: W, h: 0.45, text: tone.name, size: M2.coverLabel, color: tone.accent, font: 'body', align: align });
      els.push({ kind: 'text', x: 0.65, y: 2.15, w: W - 0.1, h: 1.9, text: slide.title, size: fitSize(slide.title, W - 0.1, 1.9, M2.coverTitle, true), color: tone.accent, bold: true, font: 'title', align: align, objectName: 'slide-title' });
      if (slide.subtitle) {
        els.push({ kind: 'text', x: 0.65, y: 4.4, w: W, h: 1.0, text: slide.subtitle, size: fitSize(slide.subtitle, W, 1.0, M2.coverSubtitle), color: tone.muted, font: 'body', align: align });
      }
      if (slide.presenter) {
        els.push({ kind: 'text', x: 0.65, y: 5.75, w: W, h: 0.5, text: slide.presenter, size: M2.presenter, color: tone.text, font: 'body', align: align });
      }
      return els;
    }

    els.push({ kind: 'text', x: MARGIN, y: 0.55, w: W, h: 1.05, text: slide.title, size: fitSize(slide.title, W, 1.05, M2.title, true), color: tone.text, bold: true, font: 'title', align: 'left', objectName: 'slide-title' });
    if (slide.subtitle) {
      els.push({ kind: 'text', x: MARGIN, y: 1.58, w: W, h: 0.7, text: slide.subtitle, size: fitSize(slide.subtitle, W, 0.7, M2.subtitle), color: tone.muted, font: 'body', align: 'left' });
    }
    var top = slide.subtitle ? 2.42 : 1.95;
    var area = 6.18 - top;

    if (slide.layout === 'points') layoutPoints(els, slide.points || [], top, W, area, tone, M2);
    else if (slide.layout === 'image') layoutImage(els, slide, top, W, area, tone, M2);
    else if (slide.layout === 'table') layoutTable(els, slide.table, top, W, area, tone, M2);
    return els;
  }

  function layoutPoints(els, items, top, W, area, tone, M2) {
    if (!items.length) return;
    var n = items.length;
    var gap = M2.gap;
    var textX = 1.5;
    var textW = W - 0.9;
    var size = fitItems(items, textW, area, M2.points, gap);
    var rowH = (area - gap * (n - 1)) / n;
    var y = top;
    items.forEach(function (item, i) {
      els.push({ kind: 'text', x: MARGIN + 0.05, y: y, w: 0.65, h: 0.6, text: pad2(i + 1), size: Math.min(M2.numberSize, size), color: tone.accent, bold: true, font: 'body', align: 'left' });
      els.push({ kind: 'text', x: textX, y: y, w: textW, h: rowH - 0.06, text: item, size: size, color: tone.text, font: 'body', align: 'left' });
      y += rowH + gap;
    });
  }

  function layoutImage(els, slide, top, W, area, tone, M2) {
    var tw = W * 0.39;
    var iw = W - tw - 0.4;
    var items = (slide.points || []).slice(0, 4);
    if (items.length) {
      var n = items.length;
      var gap = 0.1;
      var size = fitItems(items, tw, area, M2.imagePoints, gap);
      var rowH = (area - gap * (n - 1)) / n;
      var y = top;
      items.forEach(function (item) {
        els.push({ kind: 'text', x: MARGIN, y: y, w: tw, h: rowH - 0.06, text: item, size: size, color: tone.text, font: 'body', align: 'left' });
        y += rowH + gap;
      });
    }
    els.push({ kind: 'image', x: 1 + tw, y: top, w: iw, h: area - 0.8, dataUrl: slide.image.dataUrl, objectName: 'evidence-image' });
    if (slide.image.caption) {
      els.push({ kind: 'text', x: 1 + tw, y: top + area - 0.7, w: iw, h: 0.7, text: slide.image.caption, size: 14, color: tone.muted, font: 'body', align: 'left' });
    }
  }

  function layoutTable(els, table, top, W, area, tone, M2) {
    var headers = table.headers.slice(0, 5);
    var rows = table.rows.slice(0, 5).map(function (row) { return row.slice(0, 5); });
    var totalRows = rows.length + 1;
    els.push({ kind: 'table', x: MARGIN, y: top, w: W, h: area, headers: headers, rows: rows, size: totalRows > 4 ? M2.tableSmall : M2.tableLarge, objectName: 'editable-table' });
  }

  // ---------- PPTX 输出 ----------

  function buildPptxBlob(state) {
    var PptxGenJS = root.PptxGenJS;
    if (typeof PptxGenJS !== 'function') {
      return Promise.reject(new Error('PptxGenJS 未加载：请确认 vendor/pptxgen.bundle.js（自包含版）与 index.html 同目录存在且未被改名。'));
    }
    var deck = buildDeck(state);
    var pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'REPORT', width: SLIDE_W, height: SLIDE_H });
    pptx.layout = 'REPORT';
    pptx.author = deck.meta.presenter || '';
    pptx.subject = deck.meta.subtitle || '';
    pptx.title = deck.meta.title;
    pptx.company = '';
    pptx.lang = 'zh-CN';
    var titleFont = titleFontOf(deck.tone);

    deck.slides.forEach(function (slide, index) {
      var s = pptx.addSlide();
      s.background = { color: deck.tone.background };
      layoutSlide(slide, deck.tone, index + 1, deck.slides.length, deck.metrics).forEach(function (el) {
        if (el.kind === 'shape') {
          s.addShape(pptx.ShapeType.rect, {
            x: el.x, y: el.y, w: el.w, h: el.h,
            fill: { color: el.fill }, line: { color: el.line, width: 0.75 }, objectName: el.objectName
          });
        } else if (el.kind === 'text') {
          if (!el.text) return;
          s.addText(String(el.text), {
            x: el.x, y: el.y, w: el.w, h: el.h,
            fontFace: el.font === 'title' ? titleFont : deck.tone.fontFace,
            fontSize: el.size, color: el.color, bold: !!el.bold, align: el.align || 'left',
            valign: 'top', margin: 0, breakLine: false, objectName: el.objectName || 'native-text'
          });
        } else if (el.kind === 'image') {
          s.addImage({
            data: el.dataUrl, x: el.x, y: el.y, w: el.w, h: el.h,
            sizing: { type: 'contain', w: el.w, h: el.h }, objectName: el.objectName
          });
        } else if (el.kind === 'table') {
          var rows = [el.headers.map(function (header) {
            return { text: String(header), options: { bold: true, color: deck.tone.accent, fill: { color: deck.tone.surface } } };
          })].concat(el.rows.map(function (row) {
            return row.map(function (cell) { return String(cell); });
          }));
          s.addTable(rows, {
            x: el.x, y: el.y, w: el.w, h: el.h,
            colW: el.w / el.headers.length, rowH: el.h / rows.length,
            autoPage: false, fontFace: deck.tone.fontFace, fontSize: el.size,
            color: deck.tone.text, fill: { color: deck.tone.background },
            border: { color: deck.tone.surface, pt: 1 }, margin: 6, valign: 'mid',
            objectName: el.objectName
          });
        }
      });
      if (slide.notes && slide.notes.trim()) s.addNotes(slide.notes.trim());
    });

    return Promise.resolve(pptx.write()).then(function (blob) {
      if (!(typeof Blob !== 'undefined' && blob instanceof Blob)) {
        if (blob instanceof ArrayBuffer) blob = new Blob([blob], { type: MIME_PPTX });
        else if (blob && blob.buffer) blob = new Blob([blob], { type: MIME_PPTX });
        else if (typeof blob === 'string') throw new Error('导出返回了文件名而不是数据：' + blob);
        else throw new Error('生成结果类型异常。');
      }
      return { blob: blob, pageCount: deck.slides.length, toneName: deck.tone.name };
    });
  }

  // ---------- 文件名与标识 ----------

  function slugifyTitle(value) {
    var slug = String(value || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    return /^[a-z0-9]/.test(slug) ? slug : '';
  }

  function fileBase(value) {
    var base = String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().replace(/\s+/g, '-');
    return Array.from(base).slice(0, 48).join('') || 'presentation';
  }

  // ---------- presentation.json 互导（与 report-to-pptx 技能配置兼容） ----------

  function exportPresentationJson(state) {
    var warnings = [];
    var meta = state.meta || {};
    var title = String(meta.title || '').trim() || '未命名汇报';
    var slug = slugifyTitle(meta.slug) || slugifyTitle(title);
    if (!slug) { slug = 'my-report'; warnings.push('文件名标识不是合法 ASCII slug，已使用 my-report。'); }
    var toneKey = DATA.TONES[state.tone] ? state.tone : 'academic-blue';
    var sections = Array.isArray(state.sections) ? state.sections : [];

    var slides = [{
      id: 'cover', layout: 'cover',
      title: clampText(title, 100),
      subtitle: clampText(String(meta.subtitle || '').trim(), 100),
      notes: '', source: ''
    }];

    sections.forEach(function (section, index) {
      var id = 's-' + pad2(index + 1);
      var secTitle = clampText(String(section.title || '').trim() || ('第 ' + (index + 1) + ' 节'), 56);
      var subtitle = clampText(String(section.subtitle || '').trim(), 100);
      var notes = clampText(String(section.notes || '').trim(), 5000);
      if (section.kind === 'section' || section.kind === 'closing') {
        slides.push({ id: id, layout: section.kind, title: secTitle, subtitle: subtitle, notes: notes, source: '' });
        return;
      }
      var table = parseTable(section.tableTsv);
      if (table) {
        if (table.headers.length > 5) warnings.push('「' + secTitle + '」表头超过 5 列，导出时已截断。');
        if (table.rows.length > 5) warnings.push('「' + secTitle + '」表格超过 5 行，导出时已截断。');
        slides.push({
          id: id, layout: 'table', title: secTitle, subtitle: subtitle, notes: notes, source: '',
          table: {
            headers: table.headers.slice(0, 5).map(function (h) { return clampText(h, 20); }),
            rows: table.rows.slice(0, 5).map(function (row) {
              return row.slice(0, 5).map(function (cell) { return clampText(cell, 28); });
            })
          }
        });
        return;
      }
      var points = linesOf(section.points);
      if (!points.length) points = linesOf(section.paragraphs);
      if (points.length > 4) warnings.push('「' + secTitle + '」要点超过 4 条，导出时保留前 4 条。');
      points = points.slice(0, 4).map(function (point) {
        if (Array.from(point).length > 64) {
          warnings.push('「' + secTitle + '」有要点超过 64 字，导出时已截断。');
          return clampText(point, 64);
        }
        return point;
      });
      if (!points.length) points = ['（此页暂无内容，请在技能流程中补充）'];
      slides.push({ id: id, layout: 'points', title: secTitle, subtitle: subtitle, notes: notes, source: '', points: points });
      if (section.image && section.image.dataUrl) {
        warnings.push('「' + secTitle + '」的图片无法写入 JSON：已导出为纯要点，图片请在技能流程中放入 materials/images。');
      }
    });

    var json = {
      schema_version: 1,
      slug: slug,
      title: clampText(title, 100),
      purpose: clampText(String(meta.subtitle || '').trim(), 500),
      audience: '',
      duration_minutes: null,
      presenter: clampText(String(meta.presenter || '').trim(), 500),
      tone: toneKey,
      tone_notes: '由网页版工作室导出，可继续用 /report-to-pptx 迭代。',
      custom_tone: null,
      aspect_ratio: '16:9',
      template: null,
      speaker_notes: true,
      slides: slides
    };
    return { json: json, warnings: warnings };
  }

  /* 识别并转换 presentation.json；不是该格式时返回 null。 */
  function importPresentationJson(obj) {
    if (!obj || obj.schema_version !== 1 || !Array.isArray(obj.slides)) return null;
    var warnings = [];
    var meta = {
      title: String(obj.title || '').trim(),
      subtitle: String(obj.purpose || '').trim(),
      presenter: String(obj.presenter || '').trim(),
      slug: slugifyTitle(obj.slug) || slugifyTitle(obj.title) || 'my-report'
    };
    var tone = obj.tone;
    if (!DATA.TONES[tone]) {
      if (tone && tone !== 'custom') warnings.push('基调「' + tone + '」不在预设中，已改用学术白蓝；自定义基调请用技能流程。');
      tone = 'academic-blue';
    }
    var sections = [];
    obj.slides.forEach(function (slide, index) {
      var layout = slide.layout;
      if (layout === 'cover') {
        if (!meta.title && slide.title) meta.title = String(slide.title);
        if (!meta.subtitle && slide.subtitle) meta.subtitle = String(slide.subtitle);
        return;
      }
      var section = {
        id: 'imp-' + (index + 1),
        kind: layout === 'section' ? 'section' : layout === 'closing' ? 'closing' : 'content',
        title: String(slide.title || ''),
        subtitle: String(slide.subtitle || ''),
        paragraphs: '', points: '', tableTsv: '', image: null, caption: '',
        notes: String(slide.notes || '')
      };
      if (layout === 'points' || layout === 'image') section.points = (slide.points || []).join('\n');
      if (layout === 'two-column') {
        if (Array.isArray(slide.columns)) {
          section.points = slide.columns.map(function (column) {
            return (column.title ? column.title + '：' : '') + (column.points || []).join('；');
          }).join('\n');
        }
        warnings.push('双栏页「' + (slide.title || '') + '」已转换为要点，请在编辑器中确认。');
      }
      if (layout === 'table' && slide.table) {
        section.tableTsv = [slide.table.headers.join('|')].concat((slide.table.rows || []).map(function (row) { return row.join('|'); })).join('\n');
      }
      if (layout === 'chart') warnings.push('图表页「' + (slide.title || '') + '」暂不支持导入，只保留标题，请用技能流程继续。');
      if (layout === 'image') warnings.push('图片页「' + (slide.title || '') + '」的图片文件需要重新上传。');
      if (['cover', 'section', 'closing', 'points', 'image', 'table', 'chart', 'two-column'].indexOf(layout) < 0) {
        warnings.push('未知版式 ' + layout + '，已按要点处理。');
      }
      sections.push(section);
    });
    return { patch: { meta: meta, tone: tone, sections: sections }, warnings: warnings };
  }

  // ---------- 密度提示 ----------

  function inspect(state) {
    var hints = new Set();
    var meta = state.meta || {};
    var sections = Array.isArray(state.sections) ? state.sections : [];
    if (!String(meta.title || '').trim()) hints.add('标题为空，将使用占位标题。');
    if (!sections.length) hints.add('还没有内容板块：网页只会生成封面，PPT 也只有封面页。');
    var deck = buildDeck(state);
    if (deck.slides.length > 32) hints.add('PPT 共 ' + deck.slides.length + ' 页，主线偏长，建议合并内容或把细节移入备注。');
    sections.forEach(function (section) {
      if (section.kind !== 'content') return;
      var label = String(section.title || '').trim() || '未命名板块';
      var points = linesOf(section.points);
      if (!points.length) points = linesOf(section.paragraphs);
      if (points.length > 6) hints.add('「' + label + '」有 ' + points.length + ' 条要点，PPT 一页会偏挤，建议拆成多个板块。');
      if (points.some(function (point) { return Array.from(point).length > 64; })) {
        hints.add('「' + label + '」有要点超过 64 字，PPT 中会自动换行并缩小字号。');
      }
      var table = parseTable(section.tableTsv);
      if (table && (table.rows.length > 5 || table.headers.length > 5)) {
        hints.add('「' + label + '」表格超过 5 行或 5 列，PPT 将只保留前 5 行/列。');
      }
      if (section.image && section.image.dataUrl && !points.length) {
        hints.add('「' + label + '」只有图片：PPT 上为“图片 + 说明”，左侧文字为空。');
      }
    });
    return Array.from(hints);
  }

  SB.SLIDE_W = SLIDE_W;
  SB.SLIDE_H = SLIDE_H;
  SB.MIME_PPTX = MIME_PPTX;
  SB.DENSITIES = DENSITIES;
  SB.estimatedLines = estimatedLines;
  SB.titleFontOf = titleFontOf;
  SB.buildDeck = buildDeck;
  SB.layoutSlide = layoutSlide;
  SB.buildPptxBlob = buildPptxBlob;
  SB.slugifyTitle = slugifyTitle;
  SB.fileBase = fileBase;
  SB.exportPresentationJson = exportPresentationJson;
  SB.importPresentationJson = importPresentationJson;
  SB.inspect = inspect;

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);
