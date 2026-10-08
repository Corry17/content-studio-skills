/* 网页版工作室 · 界面与交互
 * 状态 -> 编辑器 / 实时预览 / 下载；全部在本机浏览器完成，不上传任何内容。 */
(function () {
  'use strict';

  var DATA = window.StudioData;
  var SB = window.StudioBuild;
  var STORAGE_KEY = 'content-studio-web/v1';

  var state = loadState() || DATA.demoState();
  var mockIndex = 0;
  var refreshTimer = null;
  var saveTimer = null;
  var storageWarned = false;

  var el = {
    sections: document.getElementById('sections'),
    status: document.getElementById('status'),
    styleGrid: document.getElementById('style-grid'),
    toneGrid: document.getElementById('tone-grid'),
    modePicker: document.getElementById('mode-picker'),
    htmlPreview: document.getElementById('html-preview'),
    pptMock: document.getElementById('ppt-mock'),
    pptHints: document.getElementById('ppt-hints'),
    mockLabel: document.getElementById('mock-label'),
    version: document.getElementById('version'),
    importFile: document.getElementById('import-file'),
    metaTitle: document.getElementById('meta-title'),
    metaSubtitle: document.getElementById('meta-subtitle'),
    metaPresenter: document.getElementById('meta-presenter'),
    metaSlug: document.getElementById('meta-slug')
  };

  // ---------- 状态存取 ----------

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalizeState(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (_) {
        if (!storageWarned) {
          storageWarned = true;
          setStatus('内容较大（可能含图片），草稿未能自动保存；建议用「导出配置」保留全部内容。', 'warn');
        }
      }
    }, 600);
  }

  function str(value) { return typeof value === 'string' ? value : ''; }

  function normalizeState(input) {
    var demo = DATA.demoState();
    var styleOk = DATA.STYLES.some(function (s) { return s.id === input.style; });
    return {
      tab: input.tab === 'ppt' ? 'ppt' : 'h5',
      style: styleOk ? input.style : demo.style,
      mode: input.mode === 'deck' ? 'deck' : 'scroll',
      tone: DATA.TONES[input.tone] ? input.tone : demo.tone,
      version: /^v\d{3}$/.test(str(input.version)) ? input.version : 'v001',
      layout: normalizeLayout(input.layout),
      meta: {
        title: str(input.meta && input.meta.title),
        subtitle: str(input.meta && input.meta.subtitle),
        presenter: str(input.meta && input.meta.presenter),
        slug: str(input.meta && input.meta.slug) || 'my-report'
      },
      sections: Array.isArray(input.sections) ? input.sections.map(normalizeSection) : []
    };
  }

  /* 版式设置（网页与 PPT 共用一份 state.layout；非法值回退默认）。 */
  function normalizeLayout(input) {
    var source = input && typeof input === 'object' ? input : {};
    function pick(value, allowed, fallback) { return allowed.indexOf(value) >= 0 ? value : fallback; }
    return {
      width: pick(source.width, ['auto', 'narrow', 'standard', 'wide'], 'auto'),
      density: pick(source.density, ['standard', 'compact', 'relaxed'], 'standard'),
      points: pick(source.points, ['cards', 'list', 'plain'], 'cards'),
      title: pick(source.title, ['auto', 'sans', 'serif'], 'auto'),
      cover: pick(source.cover, ['auto', 'classic', 'centered', 'panel'], 'auto'),
      pptCover: pick(source.pptCover, ['auto', 'classic', 'centered', 'panel'], 'auto'),
      pptTitleFont: pick(source.pptTitleFont, ['auto', 'yahei', 'song'], 'auto'),
      pptDensity: pick(source.pptDensity, ['standard', 'compact', 'relaxed'], 'standard')
    };
  }

  function normalizeSection(section, index) {
    var kind = ['content', 'section', 'closing'].indexOf(section.kind) >= 0 ? section.kind : 'content';
    return {
      id: str(section.id) || 'sec-' + index + '-' + Math.random().toString(36).slice(2, 7),
      kind: kind,
      title: str(section.title),
      subtitle: str(section.subtitle),
      paragraphs: str(section.paragraphs),
      points: str(section.points),
      tableTsv: str(section.tableTsv),
      image: section.image && section.image.dataUrl ? { dataUrl: String(section.image.dataUrl), name: str(section.image.name) } : null,
      caption: str(section.caption),
      notes: str(section.notes)
    };
  }

  // ---------- 通用 UI ----------

  function setStatus(message, kind) {
    el.status.textContent = message || '';
    el.status.dataset.kind = kind || '';
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshAll, 300);
  }

  function refreshAll() {
    renderH5Preview();
    renderMock();
    renderHints();
  }

  /* 把 state.layout 写回版式下拉（初始化、恢复示例、导入配置后调用）。 */
  function renderSettings() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-setting]'), function (select) {
      select.value = state.layout[select.dataset.setting];
    });
  }

  function renderH5Preview() {
    el.htmlPreview.srcdoc = SB.buildH5(state);
  }

  function renderHints() {
    var hints = SB.inspect(state);
    el.pptHints.textContent = hints.length
      ? '密度提示：' + hints.slice(0, 3).join(' ') + (hints.length > 3 ? '（共 ' + hints.length + ' 条）' : '')
      : '密度检查通过：当前内容可以直接生成。';
    el.pptHints.dataset.kind = hints.length ? 'warn' : 'ok';
  }

  // ---------- 编辑器 ----------

  function renderEditor() {
    el.metaTitle.value = state.meta.title;
    el.metaSubtitle.value = state.meta.subtitle;
    el.metaPresenter.value = state.meta.presenter;
    el.metaSlug.value = state.meta.slug;
    el.sections.innerHTML = state.sections.map(sectionCard).join('\n');
  }

  function sectionCard(section, index) {
    var esc = SB.escapeHtml;
    var upDisabled = index === 0 ? ' disabled' : '';
    var downDisabled = index === state.sections.length - 1 ? ' disabled' : '';
    var kindOptions = [
      ['content', '内容页'], ['section', '分节页'], ['closing', '结束页']
    ].map(function (pair) {
      return '<option value="' + pair[0] + '"' + (section.kind === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
    }).join('');
    var imageName = section.image ? (section.image.name || '已选择图片') : '未选择图片';
    return [
      '<article class="sec-card" data-id="' + esc(section.id) + '">',
      '  <div class="sec-head">',
      '    <span class="sec-no">' + (index + 1 < 10 ? '0' : '') + (index + 1) + '</span>',
      '    <input class="sec-title" data-field="title" placeholder="板块标题（必填，作为页面/幻灯片标题）" value="' + esc(section.title) + '">',
      '    <select class="sec-kind" data-field="kind" aria-label="板块类型" title="分节页 / 结束页仅在 PPT 中作为章节页；网页中仍按普通页面渲染">' + kindOptions + '</select>',
      '    <span class="sec-actions">',
      '      <button type="button" class="icon-btn" data-act="up" title="上移"' + upDisabled + '>↑</button>',
      '      <button type="button" class="icon-btn" data-act="down" title="下移"' + downDisabled + '>↓</button>',
      '      <button type="button" class="icon-btn" data-act="del" title="删除">✕</button>',
      '    </span>',
      '  </div>',
      '  <input class="sec-subtitle" data-field="subtitle" placeholder="副标题（可选）" value="' + esc(section.subtitle) + '">',
      '  <details class="sec-more">',
      '    <summary>段落 / 要点 / 表格 / 图片 / 备注</summary>',
      '    <label class="field">正文段落（每行一段，第一段作为引言）',
      '      <textarea data-field="paragraphs" rows="3" spellcheck="false" placeholder="一行一段，可留空">' + esc(section.paragraphs) + '</textarea>',
      '    </label>',
      '    <label class="field">要点列表（每行一条；网页显示为卡片，PPT 显示为编号列表）',
      '      <textarea data-field="points" rows="3" spellcheck="false" placeholder="一行一条，建议不超过 6 条">' + esc(section.points) + '</textarea>',
      '    </label>',
      '    <label class="field">表格（首行为表头，用 | 或制表符或逗号分隔；PPT 最多 5 行 5 列）',
      '      <textarea data-field="tableTsv" rows="3" spellcheck="false" placeholder="例如：指标 | 数值 | 说明">' + esc(section.tableTsv) + '</textarea>',
      '    </label>',
      '    <div class="img-row">',
      '      <label class="btn btn-small img-pick">选择图片<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-field="image" hidden></label>',
      '      <span class="hint" data-role="image-name">' + esc(imageName) + '</span>',
      '      <button type="button" class="btn btn-small" data-act="clear-image"' + (section.image ? '' : ' disabled') + '>移除图片</button>',
      '    </div>',
      '    <label class="field">图片说明（网页图注 / PPT 图片说明）',
      '      <input type="text" data-field="caption" value="' + esc(section.caption) + '" placeholder="可选">',
      '    </label>',
      '    <label class="field">演讲备注（仅写入 PPT 备注页，网页不使用）',
      '      <textarea data-field="notes" rows="2" spellcheck="false" placeholder="这一页怎么讲、证据来源等">' + esc(section.notes) + '</textarea>',
      '    </label>',
      '  </details>',
      '</article>'
    ].join('\n');
  }

  function sectionIndexFrom(id) {
    for (var i = 0; i < state.sections.length; i++) if (state.sections[i].id === id) return i;
    return -1;
  }

  function handleSectionInput(target) {
    var card = target.closest('.sec-card');
    if (!card) return;
    var index = sectionIndexFrom(card.dataset.id);
    if (index < 0) return;
    var field = target.dataset.field;
    if (!field) return;
    if (target.tagName === 'INPUT' && target.type === 'file') return; // 文件输入由 change 事件处理
    state.sections[index][field] = target.value;
    scheduleSave();
    scheduleRefresh();
  }

  function handleSectionChange(target) {
    var card = target.closest('.sec-card');
    if (!card) return;
    var index = sectionIndexFrom(card.dataset.id);
    if (index < 0) return;
    if (target.dataset.field === 'kind') {
      state.sections[index].kind = ['content', 'section', 'closing'].indexOf(target.value) >= 0 ? target.value : 'content';
      scheduleSave();
      scheduleRefresh();
      return;
    }
    if (target.dataset.field === 'image' && target.files && target.files[0]) {
      var file = target.files[0];
      var section = state.sections[index];
      compressImage(file).then(function (image) {
        section.image = image;
        var nameEl = card.querySelector('[data-role="image-name"]');
        if (nameEl) nameEl.textContent = image.name;
        var clearBtn = card.querySelector('[data-act="clear-image"]');
        if (clearBtn) clearBtn.disabled = false;
        scheduleSave();
        refreshAll();
        setStatus('图片已加入（本地处理，不会上传）。', 'ok');
      }).catch(function (error) {
        setStatus('读取图片失败：' + error.message, 'error');
      });
      target.value = '';
    }
  }

  function handleSectionClick(target) {
    var button = target.closest('[data-act]');
    if (!button) return;
    var card = target.closest('.sec-card');
    if (!card) return;
    var index = sectionIndexFrom(card.dataset.id);
    if (index < 0) return;
    var act = button.dataset.act;
    if (act === 'up' && index > 0) {
      var moved = state.sections.splice(index, 1)[0];
      state.sections.splice(index - 1, 0, moved);
    } else if (act === 'down' && index < state.sections.length - 1) {
      var movedDown = state.sections.splice(index, 1)[0];
      state.sections.splice(index + 1, 0, movedDown);
    } else if (act === 'del') {
      if (!window.confirm('删除这个板块？删除后可以用「导入配置」找回旧版本。')) return;
      state.sections.splice(index, 1);
    } else if (act === 'clear-image') {
      state.sections[index].image = null;
    } else {
      return;
    }
    scheduleSave();
    renderEditor();
    refreshAll();
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('无法读取文件')); };
      reader.onload = function () {
        var original = String(reader.result);
        if (file.size <= 700 * 1024) { resolve({ dataUrl: original, name: file.name }); return; }
        var img = new Image();
        img.onload = function () {
          try {
            var maxSide = 1600;
            var ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.86), name: file.name });
          } catch (_) {
            resolve({ dataUrl: original, name: file.name });
          }
        };
        img.onerror = function () { resolve({ dataUrl: original, name: file.name }); };
        img.src = original;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- 风格与基调 ----------

  /* 选择器示意：除配色外，也用边框、对齐、字重提示结构差异。 */
  var SWATCH_EXTRAS = {
    editorial: 'border-top: 2px solid currentColor; ',
    dashboard: 'border-left: 14px solid rgba(0, 0, 0, .12); ',
    notebook: 'border-radius: 5px 16px 5px 5px; ',
    spotlight: 'letter-spacing: -.08em; font-size: 26px; ',
    minimal: 'border: 1px solid #d9dde1; ',
    swiss: 'font-weight: 900; ',
    gallery: 'text-align: center; ',
    blueprint: 'border: 1px dashed currentColor; ',
    pastel: 'border-radius: 18px 5px 18px 5px; '
  };

  function renderStyleGrid() {
    el.styleGrid.innerHTML = DATA.STYLES.map(function (style, index) {
      var font = style.serifTitle ? 'font-family: var(--serif); ' : style.monoLabel ? 'font-family: var(--mono); ' : '';
      var extras = SWATCH_EXTRAS[style.id] || '';
      return [
        '<button type="button" class="style-chip" data-style="' + style.id + '" aria-pressed="' + (state.style === style.id) + '">',
        '  <span class="chip-swatch" style="background:' + style.soft + '; color:' + style.accent + '; border-radius:' + Math.min(style.radius, 18) + 'px; ' + font + extras + '">' + SB.escapeHtml(style.mini) + '</span>',
        '  <span class="chip-name">' + style.name + '<small>' + (index + 1 < 10 ? '0' : '') + (index + 1) + '</small></span>',
        '</button>'
      ].join('');
    }).join('\n');
  }

  var COVER_LABELS = { classic: '经典左对齐', centered: '居中', panel: '色块面板' };

  function renderToneGrid() {
    el.toneGrid.innerHTML = DATA.TONE_ORDER.map(function (key) {
      var tone = DATA.TONES[key];
      var cover = tone.coverLayout || 'classic';
      if (state.tone === key && ['classic', 'centered', 'panel'].indexOf(state.layout.pptCover) >= 0) cover = state.layout.pptCover;
      var dots = [tone.background, tone.text, tone.accent, tone.surface].map(function (hex, i) {
        return '<i style="background:#' + hex + (i === 0 ? ';box-shadow:inset 0 0 0 1px #0002' : '') + '"></i>';
      }).join('');
      return [
        '<button type="button" class="tone-chip" data-tone="' + key + '" aria-pressed="' + (state.tone === key) + '" title="' + tone.name + '（封面：' + COVER_LABELS[cover] + '）">',
        '  <span class="tone-dots">' + dots + '</span>',
        '  <span class="cover-glyph" data-cover="' + cover + '" aria-hidden="true"></span>',
        '  <span class="chip-name">' + tone.name + '</span>',
        '</button>'
      ].join('');
    }).join('\n');
  }

  function updatePressed(container, attribute, value) {
    Array.prototype.forEach.call(container.querySelectorAll('button'), function (button) {
      button.setAttribute('aria-pressed', String(button.dataset[attribute] === value));
    });
  }

  // ---------- PPT 页面示意（与 PPTX 共用版式计算） ----------

  function cssFontFor(face) {
    if (face === 'SimSun') return '"Songti SC", "SimSun", "Noto Serif CJK SC", serif';
    if (face === 'Microsoft YaHei') return '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif';
    return (face || 'sans-serif') + ', "PingFang SC", sans-serif';
  }

  function renderMock() {
    var deck = SB.buildDeck(state);
    var total = deck.slides.length;
    if (mockIndex >= total) mockIndex = 0;
    if (mockIndex < 0) mockIndex = total - 1;
    el.mockLabel.textContent = (mockIndex + 1) + ' / ' + total;

    var width = el.pptMock.clientWidth || 640;
    var scale = width / 1280;
    var els = SB.layoutSlide(deck.slides[mockIndex], deck.tone, mockIndex + 1, total, deck.metrics);

    var stage = document.createElement('div');
    stage.className = 'ppt-stage';
    stage.style.background = '#' + deck.tone.background;
    stage.style.transform = 'scale(' + scale + ')';

    els.forEach(function (entry) { stage.appendChild(mockElement(entry, deck.tone)); });
    el.pptMock.innerHTML = '';
    el.pptMock.style.height = Math.round(720 * scale) + 'px';
    el.pptMock.appendChild(stage);
  }

  function inches(value) { return Math.round(value * 96) + 'px'; }

  function mockElement(entry, tone) {
    var div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.left = inches(entry.x);
    div.style.top = inches(entry.y);
    div.style.width = inches(entry.w);
    div.style.height = inches(entry.h);
    div.style.overflow = 'hidden';

    if (entry.kind === 'shape') {
      div.style.background = '#' + entry.fill;
      return div;
    }
    if (entry.kind === 'image') {
      var img = document.createElement('img');
      img.src = entry.dataUrl;
      img.alt = '';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      div.appendChild(img);
      return div;
    }
    if (entry.kind === 'table') {
      var table = document.createElement('table');
      table.style.width = '100%';
      table.style.height = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.tableLayout = 'fixed';
      var px = Math.round(entry.size * 96 / 72) + 'px';
      var headRow = document.createElement('tr');
      entry.headers.forEach(function (header) {
        var th = document.createElement('th');
        th.textContent = header;
        th.style.cssText = 'font:600 ' + px + '/' + Math.round(entry.size * 1.3 * 96 / 72) + 'px ' + cssFontFor(tone.fontFace) + '; color:#' + tone.accent + '; background:#' + tone.surface + '; border:1px solid #' + tone.surface + '; padding:4px 8px; text-align:left; overflow:hidden; vertical-align:middle;';
        headRow.appendChild(th);
      });
      var thead = document.createElement('thead');
      thead.appendChild(headRow);
      table.appendChild(thead);
      var tbody = document.createElement('tbody');
      entry.rows.forEach(function (row) {
        var tr = document.createElement('tr');
        row.forEach(function (cell) {
          var td = document.createElement('td');
          td.textContent = cell;
          td.style.cssText = 'font:' + px + '/' + Math.round(entry.size * 1.3 * 96 / 72) + 'px ' + cssFontFor(tone.fontFace) + '; color:#' + tone.text + '; border:1px solid #' + tone.surface + '; padding:4px 8px; text-align:left; overflow:hidden; vertical-align:middle;';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      div.appendChild(table);
      return div;
    }
    // 文本
    div.textContent = entry.text;
    var fontSize = entry.size * 96 / 72;
    div.style.fontSize = fontSize.toFixed(1) + 'px';
    div.style.lineHeight = '1.25';
    div.style.color = '#' + entry.color;
    div.style.fontWeight = entry.bold ? '700' : '400';
    div.style.textAlign = entry.align || 'left';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordBreak = 'break-word';
    div.style.fontFamily = cssFontFor(entry.font === 'title' ? (tone.titleFontFace || tone.fontFace) : tone.fontFace);
    return div;
  }

  // ---------- 下载与互导 ----------

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function currentVersion() {
    var value = el.version.value.trim();
    return /^v\d{3}$/.test(value) && value !== 'v000' ? value : 'v001';
  }

  function baseName() {
    return SB.fileBase(state.meta.title || 'presentation');
  }

  function onDownloadHtml() {
    var html = SB.buildH5(state);
    download(new Blob([html], { type: 'text/html;charset=utf-8' }), 'index.html');
    setStatus('已生成 index.html（约 ' + Math.round(html.length / 1024) + ' KB，单文件离线可用）。把文件发给别人，双击即可阅读。', 'ok');
  }

  function onGeneratePptx() {
    setStatus('正在生成 PPTX…');
    SB.buildPptxBlob(state).then(function (result) {
      var name = baseName() + '-' + currentVersion() + '.pptx';
      download(result.blob, name);
      setStatus('已生成 ' + name + '（约 ' + Math.round(result.blob.size / 1024) + ' KB，共 ' + result.pageCount + ' 页，基调：' + result.toneName + '）。请用 PowerPoint / WPS 打开检查渲染效果。', 'ok');
    }).catch(function (error) {
      setStatus('生成失败：' + error.message, 'error');
    });
  }

  function onExportPresentation() {
    var exported = SB.exportPresentationJson(state);
    download(new Blob([JSON.stringify(exported.json, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }), baseName() + '-presentation.json');
    if (exported.warnings.length) {
      setStatus('已导出 presentation.json，但有 ' + exported.warnings.length + ' 处调整：' + exported.warnings.slice(0, 2).join(' ') + (exported.warnings.length > 2 ? ' …' : ''), 'warn');
    } else {
      setStatus('已导出 presentation.json：放进 ppt-projects/<slug>/ 后，可交给 /report-to-pptx 继续迭代。', 'ok');
    }
  }

  function onExportConfig() {
    var payload = { app: 'content-studio-web-v1', savedAt: new Date().toISOString(), state: state };
    download(new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }), baseName() + '-studio.json');
    setStatus('已导出完整配置（含内容与图片），可随时导入继续编辑。', 'ok');
  }

  function onImportFile(file) {
    file.text().then(function (text) {
      var obj = JSON.parse(text);
      var warnings = [];
      var presentation = SB.importPresentationJson(obj);
      if (presentation) {
        state = normalizeState({
          tab: 'ppt',
          style: state.style,
          mode: state.mode,
          tone: presentation.patch.tone,
          version: state.version,
          meta: presentation.patch.meta,
          sections: presentation.patch.sections
        });
        warnings = presentation.warnings;
      } else if (obj && obj.app === 'content-studio-web-v1' && obj.state) {
        state = normalizeState(obj.state);
      } else {
        throw new Error('无法识别的文件：需要本工具导出的配置或 report-to-pptx 的 presentation.json。');
      }
      mockIndex = 0;
      renderEditor();
      renderStyleGrid();
      renderToneGrid();
      renderSettings();
      el.version.value = state.version;
      switchTab(state.tab);
      refreshAll();
      scheduleSave();
      if (warnings.length) {
        setStatus('导入完成，有 ' + warnings.length + ' 处调整：' + warnings.slice(0, 2).join(' ') + (warnings.length > 2 ? ' …' : ''), 'warn');
      } else {
        setStatus('导入完成，可以继续编辑。', 'ok');
      }
    }).catch(function (error) {
      setStatus('导入失败：' + error.message, 'error');
    });
  }

  // ---------- 标签页与初始化 ----------

  function switchTab(tab) {
    state.tab = tab === 'ppt' ? 'ppt' : 'h5';
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (button) {
      var active = button.dataset.tab === state.tab;
      button.setAttribute('aria-selected', String(active));
      button.classList.toggle('is-active', active);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab-panel]'), function (panel) {
      panel.hidden = panel.dataset.tabPanel !== state.tab;
    });
    scheduleSave();
    if (state.tab === 'ppt') requestAnimationFrame(renderMock);
  }

  function bindEvents() {
    // 基本信息
    [['metaTitle', 'title'], ['metaSubtitle', 'subtitle'], ['metaPresenter', 'presenter'], ['metaSlug', 'slug']].forEach(function (pair) {
      el[pair[0]].addEventListener('input', function () {
        state.meta[pair[1]] = el[pair[0]].value;
        scheduleSave();
        scheduleRefresh();
      });
    });

    // 板块编辑（事件委托）
    el.sections.addEventListener('input', function (event) { handleSectionInput(event.target); });
    el.sections.addEventListener('change', function (event) { handleSectionChange(event.target); });
    el.sections.addEventListener('click', function (event) { handleSectionClick(event.target); });

    document.getElementById('add-section').addEventListener('click', function () {
      state.sections.push(DATA.emptySection(state.sections.length + 1));
      renderEditor();
      refreshAll();
      scheduleSave();
      var cards = el.sections.querySelectorAll('.sec-card');
      var last = cards[cards.length - 1];
      if (last) last.scrollIntoView({ block: 'nearest' });
      var titleInput = last && last.querySelector('.sec-title');
      if (titleInput) titleInput.focus();
    });

    document.getElementById('reset').addEventListener('click', function () {
      if (!window.confirm('恢复示例内容？当前编辑会被覆盖（可先「导出配置」备份）。')) return;
      state = DATA.demoState();
      mockIndex = 0;
      renderEditor();
      renderStyleGrid();
      renderToneGrid();
      renderSettings();
      el.version.value = state.version;
      switchTab(state.tab);
      refreshAll();
      scheduleSave();
      setStatus('已恢复示例内容。', 'ok');
    });

    // 风格 / 形式 / 基调
    el.styleGrid.addEventListener('click', function (event) {
      var button = event.target.closest('[data-style]');
      if (!button) return;
      state.style = button.dataset.style;
      updatePressed(el.styleGrid, 'style', state.style);
      scheduleSave();
      renderH5Preview();
    });
    el.modePicker.addEventListener('click', function (event) {
      var button = event.target.closest('[data-mode]');
      if (!button) return;
      state.mode = button.dataset.mode === 'deck' ? 'deck' : 'scroll';
      updatePressed(el.modePicker, 'mode', state.mode);
      scheduleSave();
      renderH5Preview();
    });
    el.toneGrid.addEventListener('click', function (event) {
      var button = event.target.closest('[data-tone]');
      if (!button) return;
      state.tone = button.dataset.tone;
      renderToneGrid();
      scheduleSave();
      renderMock();
    });

    // 操作按钮
    document.getElementById('download-html').addEventListener('click', onDownloadHtml);
    document.getElementById('generate-pptx').addEventListener('click', onGeneratePptx);
    document.getElementById('export-presentation').addEventListener('click', onExportPresentation);
    document.getElementById('export-config').addEventListener('click', onExportConfig);
    document.getElementById('import-config').addEventListener('click', function () { el.importFile.click(); });
    el.importFile.addEventListener('change', function () {
      if (el.importFile.files && el.importFile.files[0]) onImportFile(el.importFile.files[0]);
      el.importFile.value = '';
    });
    el.version.addEventListener('input', function () {
      state.version = el.version.value;
      scheduleSave();
    });

    // 版式设置（网页与 PPT）
    Array.prototype.forEach.call(document.querySelectorAll('[data-setting]'), function (select) {
      select.addEventListener('change', function () {
        state.layout[select.dataset.setting] = select.value;
        if (select.dataset.setting === 'pptCover') renderToneGrid();
        scheduleSave();
        refreshAll();
      });
    });

    // 页面示意翻页
    document.getElementById('mock-prev').addEventListener('click', function () { mockIndex -= 1; renderMock(); });
    document.getElementById('mock-next').addEventListener('click', function () { mockIndex += 1; renderMock(); });

    // 标签页
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (button) {
      button.addEventListener('click', function () { switchTab(button.dataset.tab); });
    });

    window.addEventListener('resize', function () { scheduleRefresh(); });
  }

  function init() {
    bindEvents();
    renderEditor();
    renderStyleGrid();
    renderToneGrid();
    renderSettings();
    updatePressed(el.modePicker, 'mode', state.mode);
    el.version.value = state.version;
    switchTab(state.tab);
    refreshAll();
    setStatus('已就绪：编辑左侧内容，右侧实时预览；网页与 PPT 都在本机生成。');
  }

  init();

  // 供自动化验证使用（不影响正常使用）。
  window.__studio = {
    getState: function () { return state; },
    setState: function (next) { state = normalizeState(next); renderEditor(); refreshAll(); scheduleSave(); },
    buildH5: function () { return SB.buildH5(state); },
    generatePptx: function () { return SB.buildPptxBlob(state); },
    tabs: switchTab
  };
})();
