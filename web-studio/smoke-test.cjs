#!/usr/bin/env node
/* 网页版工作室 · 冒烟测试
 * 运行：node web-studio/smoke-test.cjs
 * 检查内容：
 *   1. 12 种基调与 .qoder/skills/report-to-pptx/assets/tones.json 完全一致（防止两处漂移）；
 *   2. H5 单文件文档结构完备（doctype / 单 H1 / 运行时控件 / 打印样式等）；
 *   3. 12 种基调下版式元素坐标有限且不越出画布；
 *   4. presentation.json 导出 -> 导入 -> 再导出 往返一致；
 *   5. 表格解析与密度检查可用；
 *   6. 版式设置（阅读宽度 / 密度 / 要点样式 / 标题字体 / 封面；PPT 封面结构 / 字体 / 密度）在生成结果中生效。
 * 如果本机已安装 report-to-pptx 技能依赖，还会生成真实 PPTX（_smoke-deck.pptx），
 * 可继续执行技能检查器复核：
 *   python3 .qoder/skills/report-to-pptx/scripts/check_pptx.py web-studio/_smoke-deck.pptx
 * 生成的 _smoke-* 文件仅为验证产物，可随时删除。 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const data = require('./data.js');
const h5 = require('./build-h5.js');
const ppt = require('./build-ppt.js');

// 1) 与技能资产一致性
const tonesPath = path.join(__dirname, '../.qoder/skills/report-to-pptx/assets/tones.json');
assert.ok(fs.existsSync(tonesPath), '未找到技能基调文件：' + tonesPath);
const tonesFile = JSON.parse(fs.readFileSync(tonesPath, 'utf8'));
assert.deepStrictEqual(Object.keys(data.TONES), Object.keys(tonesFile), 'TONES 键顺序或数量不一致');
for (const key of Object.keys(tonesFile)) {
  assert.deepStrictEqual(data.TONES[key], tonesFile[key], '基调不一致：' + key);
}
assert.strictEqual(data.STYLES.length, 12, '风格数量应为 12');
assert.strictEqual(data.TONE_ORDER.length, 12, '基调数量应为 12');

// 2) H5 生成
const state = data.demoState();
const html = h5.buildH5(state);
assert.ok(html.startsWith('<!DOCTYPE html>'), '缺少 doctype');
assert.ok(html.includes('data-style="brief"') && html.includes('data-mode="scroll"'), '缺少 data-style/data-mode');
assert.ok(html.includes('<h1 tabindex="-1">我的第一份网页版作品</h1>'), '缺少 H1');
assert.strictEqual((html.match(/<h1/g) || []).length, 1, 'H1 应恰好一个');
assert.ok(html.includes('id="toc"') && html.includes('id="previous-page"') && html.includes('id="next-page"'), '缺少运行时控件');
assert.ok(html.includes('@media print') && html.includes('prefers-reduced-motion'), '缺少打印/动效适配');
assert.ok(!html.includes('undefined'), 'HTML 中出现 undefined');
assert.ok(!/\son\w+=/.test(html), 'HTML 中出现内联事件处理器');
fs.writeFileSync(path.join(__dirname, '_smoke-index.html'), html);

const htmlDeck = h5.buildH5(Object.assign({}, state, { mode: 'deck', style: 'blueprint' }));
assert.ok(htmlDeck.includes('data-mode="deck"') && htmlDeck.includes('data-style="blueprint"'), 'deck 模式生成失败');

// 3) 演示模型与版式
for (const toneKey of Object.keys(data.TONES)) {
  const deck = ppt.buildDeck(Object.assign({}, state, { tone: toneKey }));
  assert.strictEqual(deck.slides.length, 1 + state.sections.length, '幻灯片数量不符（' + toneKey + '）');
  deck.slides.forEach((slide, index) => {
    const els = ppt.layoutSlide(slide, deck.tone, index + 1, deck.slides.length);
    assert.ok(els.length > 0, '版式元素为空');
    els.forEach(el => {
      for (const key of ['x', 'y', 'w', 'h']) assert.ok(Number.isFinite(el[key]), key + ' 非有限数');
      assert.ok(el.x >= 0 && el.y >= 0 && el.x + el.w <= 13.34 && el.y + el.h <= 7.51, '元素越出画布：' + JSON.stringify({ x: el.x, y: el.y, w: el.w, h: el.h }));
    });
  });
}

// 4) presentation.json 往返
const exported = ppt.exportPresentationJson(state);
assert.strictEqual(exported.json.schema_version, 1);
assert.strictEqual(exported.json.slides.length, 1 + state.sections.length, '导出幻灯片数量不符');
assert.strictEqual(exported.warnings.length, 0, '示例内容不应产生导出警告：' + exported.warnings.join(' / '));
const imported = ppt.importPresentationJson(exported.json);
assert.ok(imported && imported.patch.sections.length === state.sections.length, '导入板块数量不符');
const reExported = ppt.exportPresentationJson({
  meta: imported.patch.meta, tone: imported.patch.tone, sections: imported.patch.sections
});
assert.strictEqual(reExported.json.slides.length, exported.json.slides.length, '往返后幻灯片数量变化');

// 5) 表格解析与密度检查
const table = h5.parseTable('指标 | 数值\n完成率 | 90%\n延迟 | 12ms');
assert.deepStrictEqual(table.headers, ['指标', '数值']);
assert.strictEqual(table.rows.length, 2);
assert.strictEqual(table.rows[1][1], '12ms');
assert.strictEqual(h5.parseTable('只有一行'), null, '单行不应成为表格');
assert.ok(Array.isArray(ppt.inspect(state)), 'inspect 应返回数组');

// 6) 版式设置
const layoutState = data.demoState();
layoutState.layout = {
  width: 'narrow', density: 'compact', points: 'list', title: 'serif', cover: 'panel',
  pptCover: 'centered', pptTitleFont: 'song', pptDensity: 'relaxed'
};
const htmlLayout = h5.buildH5(layoutState);
assert.ok(htmlLayout.includes('data-width="narrow"'), '缺少阅读宽度设置');
assert.ok(htmlLayout.includes('data-density="compact"'), '缺少排版密度设置');
assert.ok(htmlLayout.includes('data-title="serif"'), '缺少标题字体设置');
assert.ok(htmlLayout.includes('cover-panel'), '缺少封面布局类');
assert.ok(htmlLayout.includes('points-list'), '要点样式未按编号列表渲染');
const plainState = data.demoState();
plainState.layout = Object.assign(data.demoState().layout, { points: 'plain' });
assert.ok(h5.buildH5(plainState).includes('points-plain'), '要点样式未按简洁列表渲染');
const deckLayout = ppt.buildDeck(layoutState);
assert.strictEqual(deckLayout.tone.coverLayout, 'centered', 'PPT 封面结构设置未生效');
assert.strictEqual(deckLayout.tone.titleFontFace, 'SimSun', 'PPT 标题字体设置未生效');
assert.notDeepStrictEqual(deckLayout.metrics, ppt.buildDeck(state).metrics, 'PPT 信息密度未生效');
const compactDeck = ppt.buildDeck(Object.assign({}, layoutState, { layout: Object.assign({}, layoutState.layout, { pptDensity: 'compact' }) }));
const relaxedTitle = ppt.layoutSlide(deckLayout.slides[0], deckLayout.tone, 1, deckLayout.slides.length, deckLayout.metrics).find(el => el.objectName === 'slide-title');
const compactTitle = ppt.layoutSlide(compactDeck.slides[0], compactDeck.tone, 1, compactDeck.slides.length, compactDeck.metrics).find(el => el.objectName === 'slide-title');
assert.ok(relaxedTitle.size >= compactTitle.size, '密度与标题字号关系异常');

console.log(JSON.stringify({
  htmlKB: Math.round(html.length / 1024),
  deckSlides: 1 + state.sections.length,
  exportSlides: exported.json.slides.length
}, null, 2));

// 7) 可选：生成真实 PPTX（需要技能依赖 pptxgenjs；使用带版式覆盖的状态）
const pptxModule = path.join(__dirname, '../.qoder/skills/report-to-pptx/node_modules/pptxgenjs/dist/pptxgen.cjs.js');
if (!fs.existsSync(pptxModule)) {
  console.log('SKIP PPTX（未安装技能依赖 pptxgenjs，网页端不受影响）');
  console.log('SMOKE OK');
  return;
}

const PptxBase = require(pptxModule);
class PptxPatched extends PptxBase {
  write() { return super.write({ outputType: 'nodebuffer' }); } // Node 环境直接取 Buffer 落盘
}
globalThis.PptxGenJS = PptxPatched;

ppt.buildPptxBlob(layoutState).then(async (result) => {
  const buffer = Buffer.from(await result.blob.arrayBuffer());
  assert.ok(buffer.length > 10000, 'pptx 体积异常');
  assert.strictEqual(buffer.slice(0, 2).toString('latin1'), 'PK', '不是 ZIP 容器');
  fs.writeFileSync(path.join(__dirname, '_smoke-deck.pptx'), buffer);
  console.log(JSON.stringify({ pptxBytes: buffer.length, pageCount: result.pageCount, tone: result.toneName }));
  console.log('SMOKE OK');
}).catch((error) => {
  console.error('PPTX SMOKE FAILED:', error.message);
  process.exitCode = 1;
});
