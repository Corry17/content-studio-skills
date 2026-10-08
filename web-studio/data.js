/* 网页版工作室 · 基础数据
 * 网页风格令牌与 .qoder/skills/summary-to-html/references/style-presets.md 保持一致；
 * PPT 基调令牌与 .qoder/skills/report-to-pptx/assets/tones.json 保持一致。
 * 修改任何一处时，两个来源文件与本文件都要同步。
 * layout（版式设置）与 mini / cover 等选择器示意字段只服务于网页版界面，不属于技能契约。 */
(function (root) {
  'use strict';

  var STYLES = [
    { id: 'brief', name: '商务简报', mini: 'Aa', dark: false, serifTitle: false, monoLabel: false, radius: 16,
      bg: '#f3f6fb', surface: '#ffffff', ink: '#182334', muted: '#566477', accent: '#245ad9', line: '#d5deec', soft: '#eaf0ff' },
    { id: 'editorial', name: '纸感杂志', mini: '阅', dark: false, serifTitle: true, monoLabel: false, radius: 0,
      bg: '#f4f0e8', surface: '#faf7f0', ink: '#2c2925', muted: '#706559', accent: '#a63727', line: '#d2c8b9', soft: '#eee5d8' },
    { id: 'terminal', name: '暗色科技', mini: '>_', dark: true, serifTitle: false, monoLabel: true, radius: 6,
      bg: '#101720', surface: '#17232f', ink: '#e5f0ef', muted: '#a6b9bd', accent: '#86e2c4', line: '#344954', soft: '#203a3b' },
    { id: 'dashboard', name: '数据报告', mini: 'Aa', dark: false, serifTitle: false, monoLabel: false, radius: 20,
      bg: '#eef0f7', surface: '#ffffff', ink: '#202740', muted: '#606781', accent: '#5841c6', line: '#d8dced', soft: '#eeebfc' },
    { id: 'notebook', name: '暖色手记', mini: '记', dark: false, serifTitle: false, monoLabel: false, radius: 24,
      bg: '#f4f3e9', surface: '#fffef6', ink: '#293b30', muted: '#627064', accent: '#3d694c', line: '#cbd4c4', soft: '#e3ebd9' },
    { id: 'spotlight', name: '极简演示', mini: 'Aa.', dark: true, serifTitle: false, monoLabel: false, radius: 0,
      bg: '#191a17', surface: '#20211c', ink: '#f4f3e9', muted: '#b5b6a7', accent: '#ddf274', line: '#44463b', soft: '#343c21' },
    { id: 'minimal', name: '极简白纸', mini: 'Aa', dark: false, serifTitle: false, monoLabel: false, radius: 0,
      bg: '#ffffff', surface: '#ffffff', ink: '#202124', muted: '#596068', accent: '#30363c', line: '#d9dde1', soft: '#f3f4f5' },
    { id: 'academic', name: '学术报告', mini: '研', dark: false, serifTitle: true, monoLabel: false, radius: 4,
      bg: '#f5f7fb', surface: '#ffffff', ink: '#243247', muted: '#55647a', accent: '#2a4b75', line: '#ccd7e5', soft: '#eaf0f7' },
    { id: 'swiss', name: '瑞士网格', mini: 'Aa', dark: false, serifTitle: false, monoLabel: false, radius: 0,
      bg: '#f5f4f0', surface: '#ffffff', ink: '#202020', muted: '#62605a', accent: '#b32b23', line: '#cbc8bf', soft: '#ece8df' },
    { id: 'gallery', name: '作品画廊', mini: '展', dark: false, serifTitle: true, monoLabel: false, radius: 8, cover: 'centered',
      bg: '#f8f5ef', surface: '#ffffff', ink: '#302c26', muted: '#706352', accent: '#7c582d', line: '#d9cebf', soft: '#eee6d9' },
    { id: 'blueprint', name: '蓝图工程', mini: '[+]', dark: true, serifTitle: false, monoLabel: true, radius: 0,
      bg: '#153552', surface: '#1d4262', ink: '#edf5fc', muted: '#bed1e3', accent: '#a8d6fa', line: '#527797', soft: '#234d70' },
    { id: 'pastel', name: '柔彩轻读', mini: 'Aa', dark: false, serifTitle: false, monoLabel: false, radius: 28,
      bg: '#f8f5fc', surface: '#ffffff', ink: '#35303f', muted: '#696076', accent: '#6b4d83', line: '#ddd2e7', soft: '#eee5f5' }
  ];

  /* 与 report-to-pptx/assets/tones.json 相同：六位 HEX 不带 #。 */
  var TONES = {
    'academic-blue': { name: '学术白蓝', background: 'FFFFFF', text: '1E293B', muted: '526071', accent: '244A73', surface: 'EEF3F8', fontFace: 'Microsoft YaHei' },
    'business-slate': { name: '商务灰蓝', background: 'FFFFFF', text: '232B36', muted: '596370', accent: '3A526B', surface: 'EFF1F4', fontFace: 'Microsoft YaHei', coverLayout: 'panel' },
    'warm-neutral': { name: '温和米白', background: 'FAF8F3', text: '302E2A', muted: '696056', accent: '795538', surface: 'EEE9DF', fontFace: 'Microsoft YaHei', coverLayout: 'centered', titleFontFace: 'SimSun' },
    'quiet-green': { name: '沉稳青绿', background: 'FFFFFF', text: '26332F', muted: '56665E', accent: '35614F', surface: 'EDF3EF', fontFace: 'Microsoft YaHei', panelStyle: 'outline' },
    'ink-mono': { name: '黑白极简', background: 'FFFFFF', text: '202124', muted: '52565B', accent: '30363C', surface: 'F1F2F3', fontFace: 'Microsoft YaHei', coverLayout: 'centered', panelStyle: 'none' },
    'classic-burgundy': { name: '学院酒红', background: 'FFFEFC', text: '2F2528', muted: '69535B', accent: '752D43', surface: 'F4ECEF', fontFace: 'Microsoft YaHei', titleFontFace: 'SimSun', panelStyle: 'outline' },
    'slate-indigo': { name: '理性靛蓝', background: 'F8F9FD', text: '242A3D', muted: '566079', accent: '444F86', surface: 'EDF0F8', fontFace: 'Microsoft YaHei', coverLayout: 'panel' },
    'teal-white': { name: '清朗青蓝', background: 'FFFFFF', text: '203139', muted: '506570', accent: '1F6172', surface: 'EDF5F7', fontFace: 'Microsoft YaHei', coverLayout: 'centered', panelStyle: 'outline' },
    'sandstone': { name: '岩砂暖灰', background: 'FAF9F6', text: '332F29', muted: '665E53', accent: '786040', surface: 'EEEAE2', fontFace: 'Microsoft YaHei', titleFontFace: 'SimSun', panelStyle: 'none' },
    'olive-paper': { name: '橄榄纸白', background: 'FBFBF5', text: '31372B', muted: '5D6650', accent: '556638', surface: 'EEF1E5', fontFace: 'Microsoft YaHei', coverLayout: 'panel', titleFontFace: 'SimSun' },
    'navy-focus': { name: '藏蓝聚焦', background: 'FFFFFF', text: '1F2B3A', muted: '526276', accent: '263F65', surface: 'ECF1F7', fontFace: 'Microsoft YaHei', coverLayout: 'centered', panelStyle: 'none' },
    'steel-blue': { name: '钢蓝工程', background: 'F8FAFC', text: '253342', muted: '586878', accent: '3D5D78', surface: 'EAF0F5', fontFace: 'Microsoft YaHei', coverLayout: 'panel', panelStyle: 'outline' }
  };

  var TONE_ORDER = Object.keys(TONES);

  /* 新的空板块。 */
  function emptySection(index) {
    return {
      id: 's' + index + '-' + Math.random().toString(36).slice(2, 7),
      kind: 'content',
      title: '',
      subtitle: '',
      paragraphs: '',
      points: '',
      tableTsv: '',
      image: null,
      caption: '',
      notes: ''
    };
  }

  /* 首次打开或恢复示例时使用；文案为演示内容，不是真实业务数据。 */
  function demoState() {
    return {
      tab: 'h5',
      style: 'brief',
      mode: 'scroll',
      tone: 'academic-blue',
      version: 'v001',
      layout: {
        width: 'auto',
        density: 'standard',
        points: 'cards',
        title: 'auto',
        cover: 'auto',
        pptCover: 'auto',
        pptTitleFont: 'auto',
        pptDensity: 'standard'
      },
      meta: {
        title: '我的第一份网页版作品',
        subtitle: '用网页版工作室快速生成 H5 与 PPT',
        presenter: '你的名字',
        slug: 'my-report'
      },
      sections: [
        {
          id: 'demo-1', kind: 'content',
          title: '为什么用网页版工作室',
          subtitle: '不用等待对话，马上出初稿',
          paragraphs: '把内容、要点、图片和表格填进左侧，选好风格，右边实时就能看到成品。\n全部计算都在本机浏览器里完成：不联网、不上传，生成的网页是单文件，双击即可离线阅读。',
          points: '同一份内容，可以分别导出网页和 PPT\n网页为自包含 HTML，可整包分享或打印\nPPTX 为原生对象，可在 PowerPoint / WPS 继续编辑',
          tableTsv: '', image: null, caption: '',
          notes: '本工具用于快速出稿；素材编排、附件打包、迭代审阅等完整流程仍可交给 /summary-to-html 与 /report-to-pptx。'
        },
        {
          id: 'demo-2', kind: 'content',
          title: '三步得到初稿',
          subtitle: '',
          paragraphs: '',
          points: '第一步：填写标题、副标题和内容板块\n第二步：在右侧选择网页风格或 PPT 基调\n第三步：下载 index.html 或 .pptx 文件',
          tableTsv: '输出 | 格式 | 用途\n网页 | 单文件 HTML | 阅读、分享、打印\nPPT | 原生 .pptx | 汇报、放映、二次编辑',
          image: null, caption: '演示表格：两种输出的差别',
          notes: '如果表格不适合这一页，可以只保留要点。'
        },
        {
          id: 'demo-3', kind: 'content',
          title: '继续深入的方式',
          subtitle: '',
          paragraphs: '网页版适合快速出稿。需要扫描素材文件夹、加入视频与附件、生成图表、版本审阅与迭代时，把导出的配置交给技能流程继续制作。',
          points: '导出的 presentation.json 可直接放进 ppt-projects/ 继续制作\n网页内容可导出配置，随时导入继续编辑\n示例文案为演示内容，请替换成你的真实材料',
          tableTsv: '', image: null, caption: '',
          notes: '说明两种使用方式的配合关系。'
        }
      ]
    };
  }

  root.StudioData = {
    STYLES: STYLES,
    STYLE_ORDER: STYLES.map(function (s) { return s.id; }),
    TONES: TONES,
    TONE_ORDER: TONE_ORDER,
    emptySection: emptySection,
    demoState: demoState
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.StudioData;
})(typeof window !== 'undefined' ? window : globalThis);
