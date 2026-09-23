"""PPT 审阅适配、完整反馈闭环及两个独立副本一致性测试。"""

import copy
import io
import json
import tempfile
import unittest
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from review import Review, main
from test_check_pptx import P, A, R, REL

BASE = Path(__file__).resolve().parent


class PPTReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='review-test-', dir=BASE)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'my-report'
        self.root.mkdir()
        self.config = {'schema_version': 1, 'slug': 'my-report', 'title': '测试答辩',
                       'slides': [{'id': 'method', 'title': '方法说明', 'points': ['精简内容']}]}
        self.save()
        self.review = Review(self.root)

    def save(self):
        (self.root / 'presentation.json').write_text(json.dumps(self.config, ensure_ascii=False), encoding='utf-8')

    def artifact(self, version='v001', text='实际页面原生文字'):
        output = self.root / 'dist' / version
        output.mkdir(parents=True, exist_ok=True)
        file = output / ('my-report-{}.pptx'.format(version))
        members = {
            '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
            '_rels/.rels': '<Relationships xmlns="{}"><Relationship Id="r1" Type="{}/officeDocument" Target="ppt/presentation.xml"/></Relationships>'.format(REL, R),
            'ppt/presentation.xml': '<p:presentation xmlns:p="{}" xmlns:r="{}"><p:sldIdLst><p:sldId id="256" r:id="r1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>'.format(P, R),
            'ppt/_rels/presentation.xml.rels': '<Relationships xmlns="{}"><Relationship Id="r1" Type="{}/slide" Target="slides/slide1.xml"/></Relationships>'.format(REL, R),
            'ppt/slides/slide1.xml': '<p:sld xmlns:p="{}" xmlns:a="{}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>{}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'.format(P, A, text),
        }
        with zipfile.ZipFile(file, 'w') as archive:
            for name, content in members.items():
                archive.writestr(name, content)
        return file

    def register(self):
        self.artifact()
        return self.review.register('v001')

    def test_real_ppt_stats_not_configuration_slide_count(self):
        self.config['slides'].append({'id': 'extra', 'title': '配置尚未生成的页面'})
        self.save()
        result = self.register()
        self.assertEqual(result['stats']['slides'], 1)
        self.assertEqual(result['stats']['characters'], len('实际页面原生文字'))
        self.assertFalse(result['stats']['rendered'])
        self.assertTrue(result['stats']['warnings'])

    def test_feedback_revision_acceptance_end_to_end(self):
        self.register()
        original = copy.deepcopy(self.config)
        issue = self.review.feedback('v001', 'too_much', '方法页文字偏多', 'method', '不要改结论')
        self.config['slides'][0]['points'] = ['合并后的内容']
        self.save()
        self.artifact('v002', '精简后的原生文字')
        registered = self.review.register('v002', base='v001', changes=['精简方法页'])
        self.assertEqual(registered['pending'][0]['keep'], '不要改结论')
        self.assertEqual(registered['diff']['configured_items']['modified'], ['method'])
        with self.assertRaisesRegex(ValueError, '未处理反馈'):
            self.review.set_state('v002', 'accepted', confirmation='定稿')
        self.review.resolve('v002', issue['id'], '已精简并检查原生文字与备注')
        with self.assertRaisesRegex(ValueError, '确认原话'):
            self.review.set_state('v002', 'accepted')
        self.review.set_state('v002', 'accepted', confirmation='这版可以定稿')
        self.assertEqual(self.review.status()['effective_status'], 'accepted')
        self.assertEqual(self.review.load()['versions'][0]['config_snapshot'], original)
        self.assertEqual(self.review.status()['next_version'], 'v003')

    def test_manual_ppt_change_is_detected_and_cannot_be_accepted(self):
        self.register()
        self.artifact(text='手工修改了 PPT')
        self.assertTrue(self.review.status()['artifact_drift']['changed'])
        with self.assertRaisesRegex(ValueError, '手工改动'):
            self.review.set_state('v001', 'accepted', confirmation='确认')
        self.artifact('v002', '保留手工内容的新版本')
        with self.assertRaisesRegex(ValueError, '手工修改'):
            self.review.register('v002', base='v001', changes=['继续改'])
        self.review.register('v002', base='v001', changes=['继续改'], reconcile_note='已比对并保留用户手改内容')

    def test_readonly_status_and_invalid_ppt(self):
        self.assertEqual(self.review.status()['status'], 'not_registered')
        self.assertFalse((self.root / 'review').exists())
        self.artifact().write_bytes(b'broken zip')
        with redirect_stderr(io.StringIO()) as err:
            self.assertEqual(main(['register', str(self.root), 'v001']), 1)
        self.assertIn('审阅操作失败', err.getvalue())
        self.assertFalse(self.review.history.exists())

    def test_atomic_failure_does_not_lose_feedback(self):
        self.register()
        before = self.review.history.read_bytes()
        with patch('review.os.replace', side_effect=OSError('test failure')):
            with self.assertRaises(OSError):
                self.review.feedback('v001', 'missing', '需要补图')
        self.assertEqual(self.review.history.read_bytes(), before)
        self.assertFalse((self.root / 'review/write.lock').exists())

    def test_skip_review_and_pause_never_imply_acceptance(self):
        self.register()
        self.review.set_state('v001', 'paused', note='用户暂不处理')
        self.assertNotEqual(self.review.status()['status'], 'accepted')
        self.review.set_state('v001', 'delivered_without_review', note='按用户要求', confirmation='直接交付，不用问')
        self.assertEqual(self.review.status()['status'], 'delivered_without_review')

    def test_notes_or_attachment_edits_also_invalidate_snapshot(self):
        self.register()
        (self.root / 'dist/v001/speaker-notes.txt').write_text('新讲稿', encoding='utf-8')
        self.assertEqual(self.review.status()['artifact_drift']['added'], ['speaker-notes.txt'])

    def test_cli_complete_round_trip(self):
        def call(*args):
            with redirect_stdout(io.StringIO()) as out:
                self.assertEqual(main(list(args)), 0)
            return json.loads(out.getvalue())
        project = str(self.root)
        self.artifact()
        call('register', project, 'v001')
        issue = call('feedback', project, 'v001', '--kind', 'too_much', '--text', '精简背景')
        self.artifact('v002', '精简后的内容')
        call('register', project, 'v002', '--base', 'v001', '--change', '精简背景')
        call('resolve', project, 'v002', issue['id'], '--note', '检查文字与备注')
        call('state', project, 'v002', 'accepted', '--confirmation', '测试用户确认定稿')
        self.assertEqual(call('diff', project, 'v001', 'v002')['to'], 'v002')
        self.assertEqual(call('status', project)['effective_status'], 'accepted')

    def test_standalone_script_copies_match(self):
        sibling = BASE.parents[1] / 'summary-to-html/scripts/review.py'
        if not sibling.exists():
            self.skipTest('独立安装场景，无另一 Skill 可比较')
        self.assertEqual((BASE / 'review.py').read_bytes(), sibling.read_bytes())


if __name__ == '__main__':
    unittest.main()
