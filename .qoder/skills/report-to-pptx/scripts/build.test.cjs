'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const builder = require('./build.cjs');

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(__dirname, 'test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'my-report'); builder.init(root);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'presentation.json'), 'utf8'));
  config.tone = 'academic-blue'; config.slides = builder.sampleSlides(config);
  const save = () => fs.writeFileSync(path.join(root, 'presentation.json'), JSON.stringify(config));
  return { root, config, save };
}

test('十二种预设均满足最低对比度和布局约束', () => {
  assert.equal(Object.keys(builder.TONES).length, 12);
  for (const tone of Object.keys(builder.TONES)) assert.ok(builder.resolveTone({ tone, custom_tone: {} }));
});
test('用户可以独立组合封面、标题字体和分栏', () => {
  const tone = builder.resolveTone({ tone: 'academic-blue', custom_tone: { coverLayout: 'centered', panelStyle: 'none', titleFontFace: 'SimSun' } });
  assert.equal(tone.coverLayout, 'centered'); assert.equal(tone.panelStyle, 'none'); assert.equal(tone.titleFontFace, 'SimSun');
  assert.throws(() => builder.resolveTone({ tone: 'custom', custom_tone: { coverLayout: 'unsupported' } }), /coverLayout/);
  assert.throws(() => builder.resolveTone({ tone: 'custom', custom_tone: { panelStyle: 'unsupported' } }), /panelStyle/);
});
test('自定义颜色和字体可用，低对比度被拒绝', () => {
  assert.equal(builder.resolveTone({ tone: 'custom', custom_tone: { accent: '35614F', fontFace: 'PingFang SC' } }).fontFace, 'PingFang SC');
  assert.throws(() => builder.resolveTone({ tone: 'custom', custom_tone: { text: 'EEEEEE' } }), /对比度/);
  assert.throws(() => builder.resolveTone({ tone: 'custom', custom_tone: { accent: '#123456' } }), /HEX/);
});
test('路径拒绝越界、绝对路径、隐藏文件和符号链接', t => {
  const { root } = fixture(t);
  for (const relative of ['../x', '/tmp/x', 'materials/../../x', 'materials\\x', 'materials/.env']) assert.throws(() => builder.sanitizePath(relative, root));
  fs.symlinkSync(path.join(root, 'BRIEF.txt'), path.join(root, 'materials/files/link.txt'));
  assert.throws(() => builder.sanitizePath('materials/files/link.txt', root), /符号链接/);
});
test('外链不允许 file/javascript/带凭证 URL', () => {
  for (const url of ['file:///tmp/x', 'javascript:alert(1)', 'https://name:pass@example.org/', '//example.org', 'https://example.org/ a']) assert.throws(() => builder.webUrl(url));
  assert.equal(builder.webUrl('https://example.org/project'), 'https://example.org/project');
});
test('基调未确认时不能生成正式版', t => {
  const { root, config } = fixture(t); config.tone = 'ask';
  assert.throws(() => builder.validateConfig(config, root), /基调/);
  assert.ok(builder.validateConfig(config, root, true));
});
test('不会忽略机构模板', t => {
  const { root, config } = fixture(t); config.template = 'materials/templates/school.pptx';
  assert.throws(() => builder.validateConfig(config, root), /模板/);
});
test('未知字段、重复 ID 和缺少备注明确报错', t => {
  const { root, config } = fixture(t);
  config.sildes = []; assert.throws(() => builder.validateConfig(config, root), /未知字段/); delete config.sildes;
  config.slides[1].id = config.slides[0].id; assert.throws(() => builder.validateConfig(config, root), /重复/); config.slides[1].id = 'points';
  delete config.slides[1].notes; assert.throws(() => builder.validateConfig(config, root), /备注/);
});
test('数据来源和图表维度有约束', t => {
  const { root, config } = fixture(t);
  config.slides = [{ id: 'chart', layout: 'chart', title: '测试数据，仅用于自动验证', notes: '不是真实研究结果。', chart: { kind: 'bar', categories: ['A', 'B'], series: [{ name: '样例', values: [1] }], unit: '示例单位' } }];
  assert.throws(() => builder.validateConfig(config, root), /数据/);
  config.slides[0].chart.series[0].values.push(2);
  assert.throws(() => builder.validateConfig(config, root), /来源/);
});
test('缺失素材及可执行附件拒绝生成', t => {
  const { root, config } = fixture(t); config.slides[0].links = [{ label: '原件', file: 'materials/files/missing.pdf' }];
  assert.throws(() => builder.validateConfig(config, root), /ENOENT/);
  config.slides[0].links[0].file = 'materials/files/run.js'; assert.throws(() => builder.validateConfig(config, root), /格式不支持/);
});
test('初始化不覆盖已有项目', t => {
  const { root } = fixture(t); assert.throws(() => builder.init(root), /已存在/);
});
test('过密内容失败且不留下正式文件', async t => {
  const { root, config, save } = fixture(t);
  config.aspect_ratio = '4:3'; config.slides[1].title = '非常长的标题'.repeat(8); save();
  await assert.rejects(builder.build(root), /溢出/);
  assert.equal(fs.existsSync(path.join(root, 'dist/v001')), false);
});
test('十二基调真实样张具有原生文字、备注且不加动画', async t => {
  const { root, config, save } = fixture(t); config.slides = []; config.tone = 'ask'; save();
  const result = await builder.build(root, 'v001', true);
  assert.equal(result.slides, Object.keys(builder.TONES).length * 3);
  const zip = await JSZip.loadAsync(fs.readFileSync(result.file));
  const names = Object.keys(zip.files);
  assert.equal(names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length, 36);
  const first = await zip.file('ppt/slides/slide1.xml').async('string');
  assert.match(first, /让内容清楚/); assert.match(first, /<a:t>/); assert.doesNotMatch(first, /<p:timing|<p:transition/);
  const notes = await zip.file('ppt/notesSlides/notesSlide1.xml').async('string');
  assert.match(notes, /只用于选择基调/);
  assert.match(await zip.file('ppt/slides/slide4.xml').async('string'), /cover-panel/);
  assert.match(await zip.file('ppt/slides/slide13.xml').async('string'), /algn="ctr"/);
  assert.doesNotMatch(await zip.file('ppt/slides/slide15.xml').async('string'), /column-panel/);
  assert.match(await zip.file('ppt/slides/slide16.xml').async('string'), /typeface="SimSun"/);
  await assert.rejects(builder.build(root, 'v001', true), /已存在/);
});
test('原生表格、原生图表、图片和相对附件能够生成', async t => {
  const { root, config, save } = fixture(t);
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(path.join(root, 'materials/images/图 #1.png'), image);
  fs.writeFileSync(path.join(root, 'materials/files/附件 #1.txt'), '本地附件，不含真实用户数据。');
  config.slides.push(
    { id: 'image', layout: 'image', title: '图片测试', image: 'materials/images/图 #1.png', caption: '自动测试图片', points: ['验证原生图片对象。'], notes: '自动测试，不是实际研究图。' },
    { id: 'table', layout: 'table', title: '原生表格测试', table: { headers: ['类别', '描述'], rows: [['A', '测试内容'], ['B', '测试内容']] }, source: '自动测试数据', notes: '表格应保持可编辑。' },
    { id: 'chart', layout: 'chart', title: '原生图表测试', chart: { kind: 'line', categories: ['A', 'B'], series: [{ name: '示例', values: [1, 2] }], unit: '示例单位' }, source: '自动测试数据，非研究结果', notes: '验证图表与嵌入的数据工作簿。', links: [{ label: '本地附件', file: 'materials/files/附件 #1.txt' }, { label: '外部链接', url: 'https://example.org/' }] }
  ); save();
  const result = await builder.build(root); assert.equal(result.slides, 6);
  const zip = await JSZip.loadAsync(fs.readFileSync(result.file));
  assert.match(await zip.file('ppt/slides/slide4.xml').async('string'), /<p:pic>/);
  assert.match(await zip.file('ppt/slides/slide5.xml').async('string'), /<a:tbl>/);
  assert.match(await zip.file('ppt/slides/slide6.xml').async('string'), /<c:chart/);
  assert.ok(Object.keys(zip.files).some(name => name.startsWith('ppt/embeddings/')));
  const relationships = await zip.file('ppt/slides/_rels/slide6.xml.rels').async('string');
  assert.match(relationships, /Target="assets\/file-[a-f0-9]+\.txt"/);
  assert.doesNotMatch(relationships, /file:\/\/\/|\/Users\//);
  const asset = fs.readdirSync(path.join(root, 'dist/v001/assets'))[0];
  assert.equal(fs.readFileSync(path.join(root, 'dist/v001/assets', asset), 'utf8'), '本地附件，不含真实用户数据。');
});
test('Skill 元数据与相对资源完整', () => {
  const root = path.resolve(__dirname, '..'); const skill = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: report-to-pptx\n/); assert.ok(skill.split('\n').length < 500);
  const description = skill.match(/^description: (.+)$/m)[1]; assert.ok(description.length <= 1024);
  for (const match of skill.matchAll(/\]\(((?:references|assets|scripts)\/[^)]+|package\.json)\)/g)) assert.ok(fs.existsSync(path.join(root, match[1])), match[1]);
  assert.doesNotMatch(skill, /\/Users\//);
});
