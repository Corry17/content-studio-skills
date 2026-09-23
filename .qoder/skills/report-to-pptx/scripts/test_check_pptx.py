"""用本地最小 OOXML 夹具检查关系、边界与不安全内容。"""

import tempfile
import unittest
import zipfile
from pathlib import Path

from check_pptx import check_pptx, check_external, internal_target

BASE = Path(__file__).resolve().parent
P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'


class CheckTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='test-', dir=BASE)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.members = {
            '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
            '_rels/.rels': '<Relationships xmlns="{}"><Relationship Id="r1" Type="{}/officeDocument" Target="ppt/presentation.xml"/></Relationships>'.format(REL, R),
            'ppt/presentation.xml': '<p:presentation xmlns:p="{}" xmlns:r="{}"><p:sldIdLst><p:sldId id="256" r:id="r1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>'.format(P, R),
            'ppt/_rels/presentation.xml.rels': '<Relationships xmlns="{}"><Relationship Id="r1" Type="{}/slide" Target="slides/slide1.xml"/></Relationships>'.format(REL, R),
            'ppt/slides/slide1.xml': '<p:sld xmlns:p="{}" xmlns:a="{}"><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="2000000" cy="1000000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>可编辑的中文内容</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'.format(P, A),
        }

    def write(self):
        file = self.root / 'fixture.pptx'
        with zipfile.ZipFile(file, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, content in self.members.items():
                archive.writestr(name, content)
        return file

    def test_minimal_native_document(self):
        report = check_pptx(self.write())
        self.assertTrue(report['ok'], report)
        self.assertEqual(report['slides'], 1)
        self.assertEqual(report['pages'][0]['text'], '可编辑的中文内容')
        self.assertEqual(report['pages'][0]['native_shapes'], 1)
        self.assertFalse(report['rendered'])

    def test_missing_relationship_target(self):
        self.members.pop('ppt/slides/slide1.xml')
        self.assertTrue(check_pptx(self.write())['errors'])

    def test_bounds_error(self):
        self.members['ppt/slides/slide1.xml'] = self.members['ppt/slides/slide1.xml'].replace('x="500000"', 'x="20000000"')
        self.assertTrue(any('画布' in error for error in check_pptx(self.write())['errors']))

    def test_dtd_is_rejected(self):
        self.members['ppt/slides/slide1.xml'] = '<!DOCTYPE x [<!ENTITY a "b">]><x/>'
        with self.assertRaisesRegex(ValueError, 'DTD'):
            check_pptx(self.write())

    def test_macro_part_is_rejected(self):
        self.members['ppt/vbaProject.bin'] = b'fixture'
        self.assertFalse(check_pptx(self.write())['ok'])

    def test_package_traversal_is_rejected(self):
        self.members['../outside.xml'] = '<x/>'
        self.assertFalse(check_pptx(self.write())['ok'])

    def test_external_schemes(self):
        for url in ('file:///tmp/a', 'javascript:alert(1)', 'https://name:pass@example.org'):
            self.assertIsNotNone(check_external(url, self.root, R + '/hyperlink'))
        self.assertIsNone(check_external('https://example.org/', self.root, R + '/hyperlink'))

    def test_relative_attachment_and_missing_file(self):
        (self.root / 'assets').mkdir()
        (self.root / 'assets/paper.txt').write_text('中文原件', encoding='utf-8')
        self.assertIsNone(check_external('assets/paper.txt', self.root, R + '/hyperlink'))
        self.assertIsNotNone(check_external('assets/missing.pdf', self.root, R + '/hyperlink'))
        self.assertIsNotNone(check_external('../outside.pdf', self.root, R + '/hyperlink'))

    def test_internal_relationship_normalization(self):
        self.assertEqual(internal_target('ppt/slides/slide1.xml', '../media/image1.png'), 'ppt/media/image1.png')
        with self.assertRaises(ValueError):
            internal_target('ppt/slides/slide1.xml', '../../../../outside.xml')

    def test_external_images_are_not_offline_embeds(self):
        self.assertIsNotNone(check_external('https://example.org/a.png', self.root, R + '/image'))


if __name__ == '__main__':
    unittest.main()
