"""素材项目回归测试：使用项目内临时目录，不联网，不读取用户真实素材。"""

import base64
import json
import re
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import project_tool as tool
from test_validate_html import VALID
from validate_html import validate

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=')


class ProjectTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='test-', dir=tool.SKILL / 'scripts')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'my-project'
        tool.init_project(self.root, '自定义内容')
        self.config = tool.load_project(self.root)

    def save(self):
        (self.root / 'project.json').write_text(json.dumps(self.config, ensure_ascii=False), encoding='utf-8')

    def asset(self, identifier='diagram', relative='materials/images/系统图 #1 %.png', data=PNG, use='embed'):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        entry = {'id': identifier, 'path': relative, 'title': '<script>alert(1)</script> 系统图', 'use': use}
        if relative.endswith('.png'):
            entry['alt'] = '真实图像说明'
        self.config['resources'].append(entry)
        self.save()
        return entry

    def prepare(self):
        self.save()
        tool.prepare_project(self.root, 'v001')
        return self.root / 'dist/v001'

    def main_page(self, output):
        (output / 'index.html').write_text(VALID.replace('</main>', '<a href="resources.html">相关资料</a></main>'), encoding='utf-8')

    def test_init_never_overwrites(self):
        with self.assertRaisesRegex(ValueError, '已存在'):
            tool.init_project(self.root, '另一份内容')
        self.assertEqual(tool.load_project(self.root)['title'], '自定义内容')
        for folder in ('docs', 'images', 'videos', 'audio', 'files'):
            self.assertTrue((self.root / 'materials' / folder).is_dir())

    def test_scan_is_stable_and_read_only(self):
        self.asset()
        first = tool.scan_project(self.root)
        second = tool.scan_project(self.root)
        self.assertEqual(first, second)
        self.assertEqual(first['files'][0]['use'], 'reference')
        self.assertEqual(first['files'][0]['size'], len(PNG))
        self.assertEqual(list((self.root / 'dist').iterdir()), [])

    def test_scan_skips_secrets_and_symlinks(self):
        self.asset()
        (self.root / 'materials/files/.env').write_text('not-a-secret', encoding='utf-8')
        (self.root / 'materials/files/private.key').write_text('not-a-key', encoding='utf-8')
        (self.root / 'materials/files/link').symlink_to(self.root / 'BRIEF.txt')
        result = tool.scan_project(self.root)
        self.assertEqual(len(result['files']), 1)
        self.assertEqual(len(result['skipped']), 3)

    def test_scan_limit_is_not_silent_truncation(self):
        with patch.object(tool, 'MAX_ITEMS', 2):
            with self.assertRaisesRegex(ValueError, '未截断'):
                tool.scan_project(self.root)

    def test_all_preview_styles_are_accepted_by_configuration(self):
        source = (tool.SKILL / 'assets/style-preview.html').read_text(encoding='utf-8')
        styles = re.findall(r'data-theme="([a-z-]+)"', source)
        self.assertEqual(len(styles), 12)
        for style in styles:
            self.config['style'] = style
            self.save()
            self.assertEqual(tool.load_project(self.root)['style'], style)

    def test_unknown_config_field(self):
        self.config['resoruces'] = []
        self.save()
        with self.assertRaisesRegex(ValueError, '未知'):
            tool.load_project(self.root)

    def test_duplicate_json_key(self):
        (self.root / 'project.json').write_text('{"slug":"a","slug":"b"}', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '重复'):
            tool.load_project(self.root)

    def test_invalid_types(self):
        for field, value in [('duration_minutes', True), ('mode', 'invalid'), ('resources', {})]:
            original = self.config[field]
            self.config[field] = value
            self.save()
            with self.assertRaises(ValueError):
                tool.load_project(self.root)
            self.config[field] = original

    def test_missing_asset_does_not_create_version(self):
        self.config['resources'] = [{'id': 'missing', 'path': 'materials/files/absent.pdf', 'title': '论文', 'use': 'attachment'}]
        with self.assertRaisesRegex(ValueError, '文件不存在'):
            self.prepare()
        self.assertFalse((self.root / 'dist/v001').exists())

    def test_raw_paths_cannot_escape(self):
        for path in ('../outside.txt', '/tmp/a', 'materials/../../BRIEF.txt', 'materials\\x', 'materials/.env'):
            with self.assertRaises(ValueError):
                tool.local_path(self.root, path)

    def test_symlink_asset_is_rejected(self):
        link = self.root / 'materials/files/linked.txt'
        link.symlink_to(self.root / 'BRIEF.txt')
        self.config['resources'] = [{'id': 'link', 'path': 'materials/files/linked.txt', 'title': '符号链接', 'use': 'attachment'}]
        with self.assertRaisesRegex(ValueError, '符号链接'):
            self.prepare()

    def test_chinese_filename_and_reference_exclusion(self):
        self.asset()
        self.asset('private-source', 'materials/docs/research.md', b'reference only', 'reference')
        output = self.prepare()
        manifest = tool.load_json(output / 'manifest.json')
        self.assertEqual(len(manifest['resources']), 1)
        entry = manifest['resources'][0]
        self.assertRegex(entry['href'], r'^assets/images/diagram--[a-f0-9]{12}\.png$')
        self.assertEqual((output / entry['href']).read_bytes(), PNG)
        self.assertNotIn('path', entry)
        self.assertTrue((self.root / 'materials/docs/research.md').exists())
        source = (output / 'resources.html').read_text(encoding='utf-8')
        self.assertIn('&lt;script&gt;', source)
        self.assertNotIn('<script>alert', source)
        self.assertFalse(validate(source, output)[0])
        self.assertFalse((output / 'index.html').exists())

    def test_text_preview_preserves_original_and_escapes_markup(self):
        original = '中文附件 #1\n<script>alert(1)</script>'.encode('utf-8')
        self.asset('text', 'materials/files/中文.txt', original, 'attachment')
        output = self.prepare()
        entry = tool.load_json(output / 'manifest.json')['resources'][0]
        preview = output / entry['preview_href']
        source = preview.read_text(encoding='utf-8')
        self.assertIn('中文附件 #1', source)
        self.assertIn('&lt;script&gt;', source)
        self.assertEqual((output / entry['href']).read_bytes(), original)
        self.assertFalse(validate(source, preview.parent, package_root=output)[0])
        self.main_page(output)
        tool.pack_project(self.root, 'v001')

    def test_non_utf8_attachment_is_not_silently_transcoded(self):
        original = '中文'.encode('gb18030')
        self.asset('legacy', 'materials/files/legacy.txt', original, 'attachment')
        output = self.prepare()
        entry = tool.load_json(output / 'manifest.json')['resources'][0]
        self.assertNotIn('preview_href', entry)
        self.assertEqual((output / entry['href']).read_bytes(), original)

    def test_same_names_in_different_directories_do_not_collide(self):
        self.asset('a', 'materials/images/a/same.png')
        self.asset('b', 'materials/images/b/same.png')
        output = self.prepare()
        entries = tool.load_json(output / 'manifest.json')['resources']
        self.assertNotEqual(entries[0]['href'], entries[1]['href'])

    def test_duplicate_ids(self):
        entry = self.asset()
        self.config['resources'].append(dict(entry))
        with self.assertRaisesRegex(ValueError, 'ID 重复'):
            self.prepare()

    def test_no_automatic_html_or_svg_publication(self):
        self.asset('unsafe', 'materials/files/active.svg', b'<svg/>', 'attachment')
        with self.assertRaisesRegex(ValueError, '不能直接交付'):
            self.prepare()

    def test_external_links_are_validated_without_fetch(self):
        for url in ('javascript:alert(1)', 'file:///tmp/a', 'https://name:pass@example.com', '//example.org', 'https://[bad'):
            self.config['links'] = [{'id': 'site', 'title': '外链', 'url': url}]
            with self.assertRaises(ValueError):
                self.prepare()
        self.config['links'] = [{'id': 'site', 'title': '外链', 'url': 'https://example.org/?x=1&y=2'}]
        output = self.prepare()
        self.assertIn('x=1&amp;y=2', (output / 'resources.html').read_text(encoding='utf-8'))

    def test_media_relationships(self):
        self.asset('poster')
        video = self.asset('demo', 'materials/videos/demo.mp4', b'fixture-not-a-real-video')
        video['poster_id'] = 'poster'
        video['captions_id'] = 'missing'
        with self.assertRaisesRegex(ValueError, 'captions_id'):
            self.prepare()
        self.asset('captions', 'materials/files/captions.vtt', b'WEBVTT\n')
        video['captions_id'] = 'captions'
        video['transcript'] = '此测试仅验证标签与路径，不宣称能够播放。'
        output = self.prepare()
        page = (output / 'resources.html').read_text(encoding='utf-8')
        self.assertIn('<video controls playsinline', page)
        self.assertIn('<track kind="captions"', page)
        self.assertFalse(validate(page, output)[0])

    def test_outline_uses_custom_layout(self):
        self.asset()
        self.config['outline'] = [{'id': 'method', 'title': '方法', 'layout': '左图右文，保留全部原文', 'asset_ids': ['diagram']}]
        self.config['resources'][0]['section'] = 'method'
        self.prepare()

    def test_prepare_never_overwrites_and_version_rejects_paths(self):
        self.prepare()
        with self.assertRaisesRegex(ValueError, '已存在'):
            self.prepare()
        for version in ('v000', '../v001', 'final'):
            with self.assertRaises(ValueError):
                tool.prepare_project(self.root, version)

    def test_size_limit(self):
        self.asset()
        with patch.object(tool, 'MAX_FILE', 1):
            with self.assertRaisesRegex(ValueError, '超过'):
                self.prepare()

    def test_pack_requires_main_and_verifies_assets(self):
        self.asset()
        output = self.prepare()
        with self.assertRaisesRegex(ValueError, 'index.html'):
            tool.pack_project(self.root, 'v001')
        self.main_page(output)
        manifest = tool.load_json(output / 'manifest.json')
        (output / manifest['resources'][0]['href']).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, '不一致'):
            tool.pack_project(self.root, 'v001')

    def test_pack_no_extra_files_and_no_overwrite(self):
        self.asset()
        output = self.prepare()
        self.main_page(output)
        result = tool.pack_project(self.root, 'v001')
        with zipfile.ZipFile(result['archive']) as archive:
            names = archive.namelist()
        self.assertTrue(any(name.endswith('/index.html') for name in names))
        self.assertFalse(any('/materials/' in name or name.endswith('project.json') for name in names))
        with self.assertRaises(FileExistsError):
            tool.pack_project(self.root, 'v001')

    def test_pack_rejects_unselected_files(self):
        output = self.prepare()
        self.main_page(output)
        (output / 'unselected.txt').write_text('extra', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '未选定'):
            tool.pack_project(self.root, 'v001')

    def test_relocated_package_works_and_child_relative_paths(self):
        self.asset()
        output = self.prepare()
        self.main_page(output)
        relocated = Path(self.temp.name) / '另一个 目录'
        shutil.copytree(output, relocated)
        for path in relocated.glob('*.html'):
            self.assertFalse(validate(path.read_text(encoding='utf-8'), relocated, package_root=relocated)[0])
        child = relocated / 'pages'
        child.mkdir()
        source = VALID.replace('</main>', '<a href="../resources.html">附件</a></main>')
        self.assertFalse(validate(source, child, package_root=relocated)[0])
        self.assertTrue(validate(source, child)[0])

    def test_validator_checks_symlink_and_percent_encoded_file_names(self):
        self.asset()
        base = self.root / 'materials'
        source = VALID.replace('</main>', '<a href="images/%E7%B3%BB%E7%BB%9F%E5%9B%BE%20%231%20%25.png">原图</a></main>')
        self.assertFalse(validate(source, base)[0])
        (base / 'linked').symlink_to(base / 'images', target_is_directory=True)
        source = source.replace('images/', 'linked/')
        self.assertTrue(any('符号链接' in error for error in validate(source, base)[0]))


def create_browser_demo(destination):
    """生成真实、无网络的图像/静音音频/附件夹具，供浏览器核对本地直链。"""
    import io
    import struct
    import wave
    import zlib

    root = tool.project_root(destination)
    tool.init_project(root, '本地媒体与附件示例')
    config = tool.load_project(root)
    width, height = 480, 240
    pixels = b''.join(b'\x00' + b''.join(bytes((36 + x // 4, 90 + y // 3, 170)) for x in range(width)) for y in range(height))
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')
    (root / 'materials/images/示例 图 #1.png').write_bytes(png)
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(8000)
        stream.writeframes(b'\x00\x00' * 16000)
    (root / 'materials/audio/静音示例.wav').write_bytes(buffer.getvalue())
    (root / 'materials/files/本地附件 #1.txt').write_text('这是用于验证本地文件直链的示例附件。\n完整包移动后，文件仍可打开。\n', encoding='utf-8')
    config['resources'] = [
        {'id': 'sample-image', 'path': 'materials/images/示例 图 #1.png', 'title': '自动生成的示例图', 'use': 'embed', 'alt': '蓝绿渐变验证图', 'caption': '仅用于验证图片加载，不是用户研究数据。'},
        {'id': 'sample-audio', 'path': 'materials/audio/静音示例.wav', 'title': '两秒静音音频', 'use': 'embed', 'caption': '可检查播放进度，无声音，避免干扰。'},
        {'id': 'sample-file', 'path': 'materials/files/本地附件 #1.txt', 'title': '中文名与井号附件', 'use': 'attachment'},
    ]
    (root / 'project.json').write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
    tool.prepare_project(root, 'v001')
    output = root / 'dist/v001'
    manifest = tool.load_json(output / 'manifest.json')
    page = tool.resource_page(manifest)
    with (output / 'index.html').open('x', encoding='utf-8') as stream:
        stream.write(page)
    result = tool.pack_project(root, 'v001')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    import sys
    if len(sys.argv) == 3 and sys.argv[1] == '--demo-project':
        create_browser_demo(sys.argv[2])
    else:
        unittest.main()
