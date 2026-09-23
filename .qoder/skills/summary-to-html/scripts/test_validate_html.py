"""检查器和 Skill 资源契约的回归测试，只读本地资源。"""

import re
import unittest
from pathlib import Path

from validate_html import validate

ROOT = Path(__file__).resolve().parents[1]
VALID = '''<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>总结</title>
<style>:focus-visible{outline:2px solid blue}@media(max-width:600px){main{padding:16px}}
@media print{nav{display:none}}@media(prefers-reduced-motion:reduce){*{animation:none}}</style>
</head><body><main id="main"><h1>结论</h1><p>可验证的正文。</p></main></body></html>'''


class ValidatorTests(unittest.TestCase):
    def check_error(self, source, text, **kwargs):
        errors, _ = validate(source, **kwargs)
        self.assertTrue(any(text in error for error in errors), errors)

    def test_valid_offline_document(self):
        self.assertEqual(validate(VALID), ([], []))

    def test_missing_structure(self):
        self.check_error('<html><body>不完整</body></html>', 'doctype')

    def test_duplicate_ids(self):
        self.check_error(VALID.replace('<p>', '<p id="main">'), '重复的 id')

    def test_missing_anchor(self):
        self.check_error(VALID.replace('</main>', '<a href="#absent">链接</a></main>'), '锚点不存在')

    def test_preview_requires_explicit_mode(self):
        source = VALID.replace('<body>', '<body data-preview-only="true">')
        self.check_error(source, '预览/示例')
        self.assertFalse(validate(source, preview=True)[0])

    def test_external_assets(self):
        source = VALID.replace('</head>', '<script src="https://example.com/a.js"></script></head>')
        self.check_error(source, '非内联资源')
        errors, warnings = validate(source, allow_external=True)
        self.assertFalse(errors)
        self.assertTrue(warnings)

    def test_external_hyperlink_is_not_dependency(self):
        source = VALID.replace('</main>', '<a href="https://example.com" target="_blank" rel="noopener noreferrer">来源</a></main>')
        self.assertEqual(validate(source), ([], []))

    def test_unsafe_link_and_inline_event(self):
        source = VALID.replace('<p>', '<p onclick="alert(1)"><a href="java&#x09;script:alert(1)">链接</a>')
        self.check_error(source, '内联事件')
        self.check_error(source, '不安全 URL')

    def test_new_window_requires_rel(self):
        self.check_error(VALID.replace('</main>', '<a href="https://example.com" target="_blank">来源</a></main>'), 'noopener')

    def test_zoom_accessibility(self):
        self.check_error(VALID.replace('initial-scale=1', 'initial-scale=1, user-scalable=no'), '禁止用户缩放')

    def test_missing_local_asset(self):
        source = VALID.replace('</main>', '<img src="not-present.png" alt="图"></main>')
        self.check_error(source, '本地资源不存在', base=ROOT)

    def test_css_external_resource(self):
        source = VALID.replace('<style>', '<style>body{background:url(https://example.com/a.png)}')
        self.check_error(source, '非内联资源')

    def test_network_and_dynamic_script(self):
        source = VALID.replace('</body>', '<script>fetch("/api"); eval("1");</script></body>')
        self.check_error(source, '网络调用')
        self.check_error(source, '动态执行')

    def test_escaped_code_is_not_executed_markup(self):
        source = VALID.replace('</main>', '<pre>&lt;script&gt;eval(1)&lt;/script&gt;</pre></main>')
        self.assertFalse(validate(source)[0])

    def test_local_file_link_requires_existing_target(self):
        source = VALID.replace('</main>', '<a href="not-present.pdf">论文</a></main>')
        self.check_error(source, '本地资源不存在', base=ROOT)

    def test_absolute_file_and_unsupported_protocol_links(self):
        for url in ('file:///Users/example/a.pdf', 'ftp://example.com/a.pdf', '//example.com/a.pdf'):
            source = VALID.replace('</main>', '<a href="{}">附件</a></main>'.format(url))
            self.check_error(source, '非便携或不安全 URL', base=ROOT)

    def test_encoded_traversal_is_rejected(self):
        source = VALID.replace('</main>', '<a href="%2e%2e/outside.pdf">附件</a></main>')
        self.check_error(source, '越出交付包', base=ROOT)

    def test_video_controls_are_required(self):
        self.check_error(VALID.replace('</main>', '<video></video></main>'), 'controls')

    def test_malformed_url_returns_error(self):
        self.check_error(VALID.replace('</main>', '<a href="https://[bad">外链</a></main>'), 'URL 格式错误')

    def test_preview_asset(self):
        path = ROOT / 'assets/style-preview.html'
        source = path.read_text(encoding='utf-8')
        self.assertEqual(validate(source, path.parent, preview=True), ([], []))
        self.check_error(source, '预览/示例')
        ids = re.findall(r'data-theme="([a-z-]+)"', source)
        self.assertEqual(len(ids), 12)
        self.assertEqual(len(set(ids)), 12)
        for identifier in ids:
            self.assertIn(identifier + ": '", source)
            if identifier != 'brief':
                self.assertIn('body[data-style="' + identifier + '"]', source)
        self.assertEqual(len(re.findall(r'<section class="page', source)), 3)

    def test_skill_metadata_and_references(self):
        text = (ROOT / 'SKILL.md').read_text(encoding='utf-8')
        self.assertTrue(text.startswith('---\n'))
        frontmatter = text.split('---', 2)[1]
        name = re.search(r'^name: (.+)$', frontmatter, re.M).group(1)
        description = re.search(r'^description: (.+)$', frontmatter, re.M).group(1)
        self.assertRegex(name, r'^[a-z0-9-]{1,64}$')
        self.assertEqual(name, ROOT.name)
        self.assertTrue(0 < len(description) <= 1024)
        self.assertLess(len(text.splitlines()), 500)
        references = re.findall(r'\]\(((?:references|assets|scripts)/[^)]+)\)', text)
        self.assertEqual(len(references), 9)
        for reference in references:
            self.assertTrue((ROOT / reference).is_file(), reference)
        self.assertNotIn('/Users/', text)


if __name__ == '__main__':
    unittest.main()
