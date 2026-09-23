"""两份独立 Skill 使用相同审阅契约，全部写操作限于临时项目。"""

import copy
import io
import json
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from unittest.mock import patch

from review import Review, main, safe_path

SCRIPTS = Path(__file__).resolve().parent
IS_PPT = (SCRIPTS / 'check_pptx.py').is_file()
HTML = '''<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>审阅测试</title>
<style>:focus-visible{outline:2px solid blue}@media(max-width:600px){main{padding:16px}}
@media print{nav{display:none}}@media(prefers-reduced-motion:reduce){*{animation:none}}</style>
</head><body><main><section id="method"><h1>方法说明</h1><p>正文需要详细解释。</p></section></main></body></html>'''


def ppt_fixture(file, text):
    p = 'http://schemas.openxmlformats.org/presentationml/2006/main'
    a = 'http://schemas.openxmlformats.org/drawingml/2006/main'
    r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    rel = 'http://schemas.openxmlformats.org/package/2006/relationships'
    parts = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
        '_rels/.rels': '<Relationships xmlns="{}"><Relationship Id="r1" Type="{}/officeDocument" Target="ppt/presentation.xml"/></Relationships>'.format(rel, r),
        'ppt/presentation.xml': '<p:presentation xmlns:p="{}" xmlns:r="{}"><p:sldIdLst><p:sldId id="256" r:id="r1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>'.format(p, r),
        'ppt/_rels/presentation.xml.rels': '<Relationships xmlns="{}"><Relationship Id="r1" Type="{}/slide" Target="slides/slide1.xml"/></Relationships>'.format(rel, r),
        'ppt/slides/slide1.xml': '<p:sld xmlns:p="{}" xmlns:a="{}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>{}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'.format(p, a, text),
    }
    with zipfile.ZipFile(file, 'w') as archive:
        for name, content in parts.items():
            archive.writestr(name, content)


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='review-test-', dir=SCRIPTS)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'project'
        self.root.mkdir()
        self.config_name = 'presentation.json' if IS_PPT else 'project.json'
        self.collection = 'slides' if IS_PPT else 'outline'
        self.config = {'schema_version': 1, 'slug': 'my-project', 'title': '测试项目',
                       self.collection: [{'id': 'method', 'title': '方法说明'}]}
        self.save_config()
        self.review = Review(self.root)

    def save_config(self):
        (self.root / self.config_name).write_text(json.dumps(self.config, ensure_ascii=False), encoding='utf-8')

    def artifact(self, version='v001', content='正文需要详细解释。'):
        folder = self.root / 'dist' / version
        folder.mkdir(parents=True, exist_ok=True)
        file = folder / ('my-project-{}.pptx'.format(version) if IS_PPT else 'index.html')
        if IS_PPT:
            ppt_fixture(file, content)
        else:
            file.write_text(HTML.replace('正文需要详细解释。', content), encoding='utf-8')
        return file

    def register(self):
        self.artifact()
        return self.review.register('v001')

    def test_status_is_read_only_before_registration(self):
        result = self.review.status()
        self.assertEqual(result['status'], 'not_registered')
        self.assertEqual(result['next_version'], 'v001')
        self.assertFalse((self.root / 'review').exists())

    def test_register_requires_real_artifact(self):
        with self.assertRaisesRegex(ValueError, '产物尚不存在'):
            self.review.register('v001')
        self.assertFalse(self.review.history.exists())

    def test_snapshot_is_frozen_and_no_automatic_acceptance(self):
        result = self.register()
        self.assertEqual(result['status'], 'awaiting_feedback')
        self.assertFalse(result['stats']['rendered'])
        old = copy.deepcopy(self.config)
        self.config['title'] = '下一轮标题'
        self.save_config()
        state = self.review.load()
        self.assertEqual(state['versions'][0]['config_snapshot'], old)
        self.assertTrue(self.review.status()['config_changed'])
        with self.assertRaisesRegex(ValueError, '工作配置'):
            self.review.set_state('v001', 'accepted', confirmation='测试确认')

    def test_feedback_survives_new_version_and_needs_resolution(self):
        self.register()
        issue = self.review.feedback('v001', 'missing', '方法缺解释', scope='method', keep='结论不要动')
        self.artifact('v002', '补充方法解释和依据。')
        result = self.review.register('v002', base='v001', changes=['补方法解释'])
        self.assertEqual(result['pending'][0]['id'], issue['id'])
        self.assertEqual(result['pending'][0]['keep'], '结论不要动')
        with self.assertRaisesRegex(ValueError, '未处理反馈'):
            self.review.set_state('v002', 'accepted', confirmation='这版可以')
        self.review.resolve('v002', issue['id'], '已按原材料补充方法')
        with self.assertRaisesRegex(ValueError, '确认原话'):
            self.review.set_state('v002', 'accepted')
        self.review.set_state('v002', 'accepted', confirmation='这版可以定稿')
        self.assertEqual(self.review.status()['effective_status'], 'accepted')
        self.assertEqual(self.review.load()['versions'][0]['feedback'][0]['status'], 'open')

    def test_resolve_original_version_requires_explicit_waiver(self):
        self.register()
        issue = self.review.feedback('v001', 'too_much', '文字太多')
        with self.assertRaisesRegex(ValueError, '新版本'):
            self.review.resolve('v001', issue['id'], '已经处理')
        with self.assertRaisesRegex(ValueError, '明确原话'):
            self.review.resolve('v001', issue['id'], '暂不处理', waive=True)
        self.review.resolve('v001', issue['id'], '按用户要求保留', waive=True, confirmation='不用删了，保持原样')
        self.review.set_state('v001', 'accepted', confirmation='这版可以')
        self.assertEqual(self.review.status()['pending'], [])

    def test_paused_and_no_review_are_not_acceptance(self):
        self.register()
        self.review.set_state('v001', 'paused', note='用户说先暂停')
        self.assertEqual(self.review.status()['confirmation'], '')
        with self.assertRaisesRegex(ValueError, '待反馈'):
            self.review.set_state('v001', 'accepted', confirmation='这版可以')
        self.review.set_state('v001', 'awaiting_feedback', note='用户恢复审阅')
        self.review.set_state('v001', 'delivered_without_review', confirmation='直接交付不用追问', note='按用户要求')
        self.assertNotEqual(self.review.status()['status'], 'accepted')

    def test_new_feedback_reopens_confirmed_version(self):
        self.register()
        self.review.set_state('v001', 'accepted', confirmation='可以定稿')
        self.review.feedback('v001', 'layout', '后来发现第三页太挤')
        self.assertEqual(self.review.status()['status'], 'revising')
        self.assertEqual(self.review.status()['confirmation'], '')
        self.assertTrue(any(event['note'] == '可以定稿' for event in self.review.load()['versions'][0]['events']))

    def test_detects_added_removed_or_modified_attachments(self):
        self.register()
        extra = self.root / 'dist/v001/notes.txt'
        extra.write_text('手工新增附件', encoding='utf-8')
        result = self.review.status()
        self.assertTrue(result['artifact_drift']['changed'])
        self.assertEqual(result['effective_status'], 'modified_after_review')
        with self.assertRaisesRegex(ValueError, '成品或附件发生变化'):
            self.review.set_state('v001', 'accepted', confirmation='定稿')

    def test_changed_base_requires_reconciliation_note(self):
        self.register()
        before = copy.deepcopy(self.review.load()['versions'][0]['files'])
        self.artifact(content='用户手工修改过原版')
        self.artifact('v002', '已保留手工内容并补充新内容')
        with self.assertRaisesRegex(ValueError, '手工修改'):
            self.review.register('v002', base='v001', changes=['补充内容'])
        self.review.register('v002', base='v001', changes=['补充内容'], reconcile_note='已对照手工版本合并修改')
        self.assertEqual(self.review.load()['versions'][0]['files'], before)
        self.assertTrue(self.review.load()['versions'][1]['base_drift_at_registration']['changed'])

    def test_old_version_cannot_receive_silent_branch_feedback(self):
        self.register()
        self.artifact('v002')
        self.review.register('v002', base='v001', changes=['确认新一轮文件'])
        with self.assertRaisesRegex(ValueError, '最新'):
            self.review.feedback('v001', 'other', '旧页码反馈')
        self.artifact('v003')
        with self.assertRaisesRegex(ValueError, '最新'):
            self.review.register('v003', base='v001', changes=['基线错误'])

    def test_diff_finds_configuration_items_and_order(self):
        self.config[self.collection] = [{'id': 'a', 'title': '甲'}, {'id': 'b', 'title': '乙'}, {'id': 'c', 'title': '丙'}]
        self.save_config()
        self.register()
        self.config[self.collection] = [{'id': 'b', 'title': '乙'}, {'id': 'a', 'title': '甲改'}, {'id': 'd', 'title': '丁'}]
        self.save_config()
        self.artifact('v002')
        self.review.register('v002', base='v001', changes=['新增、删减并重排'])
        delta = self.review.diff('v001', 'v002')['configured_items']
        self.assertEqual(delta, {'added': ['d'], 'removed': ['c'], 'modified': ['a'], 'reordered': True})

    def test_next_version_skips_existing_unregistered_outputs(self):
        self.artifact('v003')
        self.assertEqual(self.review.status()['next_version'], 'v004')

    def test_repeated_registration_keeps_original_history(self):
        self.register()
        before = self.review.history.read_bytes()
        with self.assertRaises(ValueError):
            self.review.register('v001')
        self.assertEqual(before, self.review.history.read_bytes())

    def test_json_replacement_failure_preserves_history(self):
        self.register()
        before = self.review.history.read_bytes()
        with patch('review.os.replace', side_effect=OSError('写入失败')):
            with self.assertRaises(OSError):
                self.review.feedback('v001', 'other', '测试原子写入')
        self.assertEqual(before, self.review.history.read_bytes())
        self.assertFalse((self.root / 'review/write.lock').exists())

    def test_concurrent_writer_fails_without_overwriting(self):
        self.register()
        with self.review.transaction():
            with self.assertRaisesRegex(ValueError, 'write.lock'):
                self.review.feedback('v001', 'other', '不能抢锁')
        self.assertFalse(self.review.status()['pending'])

    def test_unknown_history_format_is_preserved(self):
        (self.root / 'review').mkdir()
        self.review.history.write_text('[{"version":"v001"}]', encoding='utf-8')
        before = self.review.history.read_bytes()
        with self.assertRaisesRegex(ValueError, '迁移'):
            self.review.register('v001')
        self.assertEqual(before, self.review.history.read_bytes())

    def test_path_and_symlink_rejection(self):
        for relative in ('../outside', '/tmp/x', 'dist/v001/../../x', 'dist\\v001', 'review/.hidden'):
            with self.assertRaises(ValueError):
                safe_path(self.root, relative)
        external = Path(self.temp.name) / 'external'
        external.mkdir()
        (self.root / 'review').symlink_to(external)
        with self.assertRaisesRegex(ValueError, '符号链接'):
            Review(self.root)
        self.assertEqual(list(external.iterdir()), [])

    def test_bad_artifact_fails_before_history_commit(self):
        file = self.artifact()
        file.write_bytes(b'not an artifact')
        with self.assertRaises((ValueError, zipfile.BadZipFile)):
            self.review.register('v001')
        self.assertFalse(self.review.history.exists())

    def test_cli_complete_round_trip(self):
        def call(*args):
            with redirect_stdout(io.StringIO()) as out:
                self.assertEqual(main(list(args)), 0)
            return json.loads(out.getvalue())
        project = str(self.root)
        self.artifact()
        call('register', project, 'v001')
        issue = call('feedback', project, 'v001', '--kind', 'missing', '--text', '补方法', '--keep', '配色不变')
        self.artifact('v002', '补充了方法细节。')
        call('register', project, 'v002', '--base', 'v001', '--change', '补方法')
        call('resolve', project, 'v002', issue['id'], '--note', '逐项核对完成')
        call('state', project, 'v002', 'accepted', '--confirmation', '测试用户明确确认')
        delta = call('diff', project, 'v001', 'v002')
        self.assertEqual(delta['to'], 'v002')
        self.assertEqual(call('status', project)['effective_status'], 'accepted')

    def test_cli_status_and_errors(self):
        with redirect_stdout(io.StringIO()) as out:
            self.assertEqual(main(['status', str(self.root)]), 0)
        self.assertEqual(json.loads(out.getvalue())['status'], 'not_registered')
        with redirect_stderr(io.StringIO()):
            self.assertEqual(main(['register', str(self.root), 'v000']), 1)

    def test_confirmation_rejected_if_accepted_file_changes(self):
        self.register()
        self.review.set_state('v001', 'accepted', confirmation='用户确认本版')
        self.artifact(content='确认后手工改了内容')
        status = self.review.status()
        self.assertEqual(status['status'], 'accepted')
        self.assertEqual(status['effective_status'], 'modified_after_review')

    def test_revision_requires_a_change_summary(self):
        self.register()
        self.artifact('v002')
        with self.assertRaisesRegex(ValueError, '变更|change'):
            self.review.register('v002', base='v001')

    def test_cli_corrupt_file_returns_clear_error(self):
        file = self.artifact()
        file.write_bytes(b'broken')
        with redirect_stderr(io.StringIO()) as err:
            self.assertEqual(main(['register', str(self.root), 'v001']), 1)
        self.assertIn('审阅操作失败', err.getvalue())

    def test_empty_or_oversize_feedback_fails(self):
        self.register()
        for value in ('', 'x' * 5001):
            with self.assertRaises(ValueError):
                self.review.feedback('v001', 'missing', value)
        self.assertFalse(self.review.status()['pending'])


if __name__ == '__main__':
    unittest.main()
