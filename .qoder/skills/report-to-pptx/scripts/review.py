#!/usr/bin/env python3
"""记录交付版本、用户反馈与确认；只写 review/，不改配置、成品或原始素材。"""

import argparse
import copy
import hashlib
import json
import os
import re
import stat
import sys
import tempfile
import zipfile
from contextlib import contextmanager
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

FORMAT = 'content-review/v1'
KINDS = ('missing', 'too_much', 'too_little', 'focus', 'layout', 'accuracy', 'media', 'other')
STATES = ('awaiting_feedback', 'revising', 'blocked_on_materials', 'accepted', 'paused', 'delivered_without_review')
MAX_FILE, MAX_TOTAL, MAX_ENTRIES = 1024 ** 3, 4 * 1024 ** 3, 4100


def require(condition, message):
    if not condition:
        raise ValueError(message)


def version_name(value):
    require(isinstance(value, str) and re.fullmatch(r'v[0-9]{3}', value) and value != 'v000', '版本必须为 v001 至 v999。')
    return value


def message(value, label='说明', required=True):
    require(isinstance(value, str) and len(value) <= 5000 and '\x00' not in value, label + '必须是最多 5000 字符的文本。')
    require(not required or value.strip(), label + '不能为空。')
    return value.strip()


def safe_path(root, relative):
    require(isinstance(relative, str) and relative, '路径不能为空。')
    require(not re.search(r'[\\:\x00-\x1f\x7f]', relative), '路径含非法字符。')
    parts = relative.split('/')
    require(all(part and not part.startswith('.') for part in parts), '路径须在项目内，不能含隐藏目录、绝对路径或 ..。')
    result = root
    for part in parts:
        result = result / part
        require(not result.is_symlink(), '不能跟随符号链接：' + relative)
    result.resolve().relative_to(root.resolve())
    return result


def read_json(path, limit=1024 ** 2):
    require(path.is_file() and path.stat().st_size <= limit, 'JSON 文件缺失、非普通文件或超过大小限制。')
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'JSON 字段重复：' + key)
            result[key] = value
        return result
    def invalid(value):
        raise ValueError('非法 JSON 数值：' + value)
    return json.loads(path.read_text(encoding='utf-8-sig'), object_pairs_hook=pairs, parse_constant=invalid)


def stamp():
    return datetime.now(timezone.utc).isoformat()


def fingerprint(path):
    info = path.stat()
    require(stat.S_ISREG(info.st_mode) and info.st_size <= MAX_FILE, '不是普通文件或单文件超过 1 GiB：' + path.name)
    before = (info.st_size, info.st_mtime_ns, info.st_ino)
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 ** 2), b''):
            digest.update(block)
    after = path.stat()
    require(before == (after.st_size, after.st_mtime_ns, after.st_ino), '读取期间文件发生变化，请稍后重试。')
    return {'bytes': info.st_size, 'sha256': digest.hexdigest()}


def inventory(folder):
    require(folder.is_dir() and not folder.is_symlink(), '交付版本目录不存在或为符号链接。')
    result, count, total = {}, 0, 0
    def onerror(error):
        raise error
    for current, dirs, files in os.walk(folder, followlinks=False, onerror=onerror):
        relative = Path(current).relative_to(folder)
        require(len(relative.parts) <= 12, '交付目录超过 12 层。')
        count += len(dirs) + len(files)
        require(count <= MAX_ENTRIES, '交付目录超过 4100 项，未截断记录。')
        for name in sorted(dirs + files):
            if name == '.DS_Store':
                continue
            candidate = safe_path(folder, (relative / name).as_posix())
            if name in files:
                size = candidate.stat().st_size
                total += size
                require(total <= MAX_TOTAL, '交付目录超过 4 GiB。')
                result[(relative / name).as_posix()] = fingerprint(candidate)
    return result


def map_diff(before, after):
    return {'added': sorted(after.keys() - before.keys()),
            'removed': sorted(before.keys() - after.keys()),
            'modified': sorted(key for key in before.keys() & after.keys() if before[key] != after[key])}


class TextStats(HTMLParser):
    """统计 HTML 静态文本，不把 CSS/JS 源码或活动页显示状态当作内容。"""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ignore = None
        self.text = []
        self.sections = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.ignore = tag
        if tag == 'section':
            data = dict(attrs)
            self.sections.append(data.get('id') or data.get('data-label') or '(未命名章节)')

    def handle_endtag(self, tag):
        if self.ignore == tag:
            self.ignore = None

    def handle_data(self, data):
        if not self.ignore:
            self.text.append(data)


def inspect_artifact(kind, file, folder):
    if kind == 'html':
        from validate_html import validate
        require(file.stat().st_size <= 20 * 1024 ** 2, 'HTML 超过 20 MiB。')
        source = file.read_text(encoding='utf-8-sig')
        errors, warnings = validate(source, file.parent, package_root=folder)
        require(not errors, 'HTML 静态检查未通过：' + '；'.join(errors))
        parser = TextStats()
        parser.feed(source)
        return {'sections': len(parser.sections), 'characters': len(re.sub(r'\s+', '', ''.join(parser.text))),
                'section_ids': parser.sections, 'warnings': warnings, 'rendered': False}
    from check_pptx import check_pptx
    report = check_pptx(file)
    require(report['ok'], 'PPTX 结构检查未通过：' + '；'.join(report['errors']))
    return {'slides': report['slides'], 'characters': sum(len(re.sub(r'\s+', '', page['text'])) for page in report['pages']),
            'warnings': report['warnings'], 'rendered': False}


def config_items(config, kind):
    items = config.get('slides' if kind == 'pptx' else 'outline', [])
    require(isinstance(items, list), 'slides/outline 必须是数组。')
    result = {}
    for item in items:
        require(isinstance(item, dict), '章节配置必须是对象。')
        key = item.get('id')
        require(isinstance(key, str) and key and key not in result, '章节配置的 ID 缺失或重复。')
        result[key] = item
    return result


class Review:
    def __init__(self, root):
        self.root = Path(root).absolute()
        require(self.root.is_dir() and not self.root.is_symlink(), '项目目录不存在或为符号链接。')
        self.root = self.root.resolve()
        configs = [name for name in ('project.json', 'presentation.json') if safe_path(self.root, name).exists()]
        require(len(configs) == 1, '项目需要且只能有一份 project.json 或 presentation.json。')
        self.config_path = safe_path(self.root, configs[0])
        self.kind = 'pptx' if configs[0] == 'presentation.json' else 'html'
        adapter = 'check_pptx.py' if self.kind == 'pptx' else 'validate_html.py'
        require(Path(__file__).with_name(adapter).is_file(), '请使用对应 HTML/PPT Skill 内的 review.py。')
        self.folder = safe_path(self.root, 'review')
        self.history = safe_path(self.root, 'review/history.json')

    def load(self):
        if not self.history.exists():
            return {'format': FORMAT, 'kind': self.kind, 'versions': []}
        state = read_json(self.history, 32 * 1024 ** 2)
        require(isinstance(state, dict) and state.get('format') == FORMAT and state.get('kind') == self.kind,
                '旧版或非本工具的审阅记录：已保留，请先人工核对迁移，不能覆盖。')
        require(isinstance(state.get('versions'), list), '审阅历史结构错误。')
        seen = []
        for record in state['versions']:
            key = version_name(record['version'])
            require(not seen or key > seen[-1], '审阅版本顺序错误。')
            require(record['base_version'] == (seen[-1] if seen else None), '审阅版本基线错误。')
            require(record['status'] in STATES and isinstance(record['feedback'], list), '审阅状态错误。')
            require(isinstance(record['files'], dict) and isinstance(record['config_snapshot'], dict), '审阅快照错误。')
            for relative in record['files']:
                safe_path(self.root, 'dist/' + key + '/' + relative)
            require(len({item['id'] for item in record['feedback']}) == len(record['feedback']), '反馈 ID 重复。')
            require(all(item['status'] in ('open', 'resolved', 'waived') for item in record['feedback']), '反馈状态错误。')
            seen.append(key)
        return state

    @contextmanager
    def transaction(self):
        self.folder.mkdir(exist_ok=True)
        lock = safe_path(self.root, 'review/write.lock')
        try:
            descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            raise ValueError('审阅记录正被写入，或上次异常留下 write.lock；请检查，没有自动抢锁。')
        os.close(descriptor)
        try:
            state = self.load()
            yield state
            payload = (json.dumps(state, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')
            require(len(payload) <= 32 * 1024 ** 2, '审阅历史超过 32 MiB，未覆盖旧记录。')
            descriptor, name = tempfile.mkstemp(prefix='.history-', suffix='.tmp', dir=self.folder)
            try:
                with os.fdopen(descriptor, 'wb') as stream:
                    stream.write(payload)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(name, self.history)
            finally:
                if os.path.exists(name):
                    os.unlink(name)
        finally:
            os.unlink(lock)

    def latest(self, state, version):
        require(state['versions'] and state['versions'][-1]['version'] == version_name(version),
                '仅能修改最新登记版本；请先查看 status，避免遗失后续反馈。')
        return state['versions'][-1]

    def record(self, state, version):
        return next((record for record in state['versions'] if record['version'] == version_name(version)), None)

    def drift(self, record):
        try:
            files = inventory(safe_path(self.root, 'dist/' + record['version']))
            delta = map_diff(record['files'], files)
            return {'changed': any(delta.values()), **delta}
        except (ValueError, OSError) as exc:
            return {'changed': True, 'error': str(exc)}

    def clean(self, record, config=False):
        require(not self.drift(record)['changed'], '登记后成品或附件发生变化；请保留手工改动，合并到新版本再登记。')
        if config:
            require(read_json(self.config_path) == record['config_snapshot'], '工作配置已变化但没有登记新产物，不能把旧版作为本轮结果。')

    def event(self, record, action, note):
        record['events'].append({'at': stamp(), 'action': action, 'note': note, 'status': record['status']})

    def pending(self, record):
        return [item for item in record['feedback'] if item['status'] == 'open']

    def register(self, version, artifact=None, base=None, changes=None, reconcile_note=''):
        version_name(version)
        changes = [message(value, '变更说明') for value in (changes or [])]
        message(reconcile_note, '手工修改核对说明', False)
        with self.transaction() as state:
            previous = state['versions'][-1] if state['versions'] else None
            require(base == (previous['version'] if previous else None), '新版本必须显式使用最新登记版本作为 --base。')
            require(not previous or version > previous['version'], '版本已登记或未递增，不能覆盖快照。')
            baseline_drift = self.drift(previous) if previous else None
            if previous:
                require(changes, '迭代版本需要至少一条 --change，说明本轮改了什么。')
                require(not baseline_drift['changed'] or reconcile_note.strip(),
                        '基线文件有登记后的改动；先核对合并手工修改，再提供 --reconcile-note。')
            config = read_json(self.config_path)
            require(isinstance(config, dict), '配置必须是 JSON 对象。')
            config_items(config, self.kind)
            if artifact is None:
                slug = config.get('slug')
                require(isinstance(slug, str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,47}', slug), '项目 slug 无效。')
                artifact = 'index.html' if self.kind == 'html' else '{}-{}.pptx'.format(slug, version)
            require(isinstance(artifact, str) and Path(artifact).suffix.lower() == ('.html' if self.kind == 'html' else '.pptx'), '登记产物的扩展名与项目类型不符。')
            folder = safe_path(self.root, 'dist/' + version)
            file = safe_path(folder, artifact)
            require(file.is_file(), '产物尚不存在，请先生成再登记。')
            before = inventory(folder)
            stats = inspect_artifact(self.kind, file, folder)
            require(before == inventory(folder) and config == read_json(self.config_path), '登记期间产物或配置被修改，本轮未保存。')
            record = {'version': version, 'base_version': base, 'status': 'awaiting_feedback',
                      'artifact': artifact, 'created_at': stamp(), 'files': before,
                      'stats': stats, 'config_snapshot': config, 'changes': changes,
                      'reconcile_note': reconcile_note, 'base_drift_at_registration': baseline_drift,
                      'feedback': copy.deepcopy(previous['feedback']) if previous else [],
                      'confirmation': '', 'events': []}
            self.event(record, 'register', '静态检查通过，等待内容反馈；未代表视觉验收。')
            state['versions'].append(record)
            result = {'version': version, 'status': record['status'], 'stats': stats, 'pending': self.pending(record)}
            if previous:
                result['diff'] = self.compare_records(previous, record)
        return result

    def feedback(self, version, kind, text, scope='', keep=''):
        require(kind in KINDS, '未知反馈类别。')
        message(text, '用户反馈')
        message(scope, '修改范围', False)
        message(keep, '保留要求', False)
        with self.transaction() as state:
            record = self.latest(state, version)
            number = sum(item['origin_version'] == version for item in record['feedback']) + 1
            item = {'id': '{}-f{:03d}'.format(version, number), 'origin_version': version,
                    'kind': kind, 'text': text, 'scope': scope, 'keep': keep, 'status': 'open',
                    'resolution': '', 'resolved_in': None, 'confirmation': ''}
            record['feedback'].append(item)
            record['status'] = 'revising'
            record['confirmation'] = ''
            self.event(record, 'feedback', item['id'] + '：' + text)
        return item

    def resolve(self, version, issue, note, waive=False, confirmation=''):
        message(note, '处理说明')
        if waive:
            message(confirmation, '用户撤回/暂不处理的明确原话')
        with self.transaction() as state:
            record = self.latest(state, version)
            self.clean(record)
            item = next((item for item in record['feedback'] if item['id'] == issue), None)
            require(item is not None and item['status'] == 'open', '反馈不存在或已经处理。')
            require(waive or item['origin_version'] != version, '修复需先登记新版本；原版只可凭用户明确确认撤回反馈。')
            item.update(status='waived' if waive else 'resolved', resolution=note,
                        confirmation=confirmation if waive else '', resolved_in=version)
            record['status'] = 'revising' if self.pending(record) else 'awaiting_feedback'
            self.event(record, 'resolve', issue + '：' + note)
        return item

    def set_state(self, version, status, note='', confirmation=''):
        require(status in STATES, '未知状态。')
        message(note, '状态说明', status not in ('accepted',))
        if status in ('accepted', 'delivered_without_review'):
            message(confirmation, '用户明确确认原话')
        with self.transaction() as state:
            record = self.latest(state, version)
            if status == 'accepted':
                require(not self.pending(record), '仍有未处理反馈，不能定稿；修复或由用户明确撤回后再确认。')
                require(record['status'] == 'awaiting_feedback', '只有待反馈版本可以定稿，请先恢复审阅状态。')
                self.clean(record, config=True)
            record['status'] = status
            record['confirmation'] = confirmation if status in ('accepted', 'delivered_without_review') else ''
            self.event(record, 'state', confirmation or note)
        return {'version': version, 'status': status, 'confirmation': record['confirmation']}

    def next_version(self, state):
        used = [int(item['version'][1:]) for item in state['versions']]
        dist = safe_path(self.root, 'dist')
        if dist.is_dir():
            used.extend(int(path.name[1:]) for path in dist.iterdir() if re.fullmatch(r'v[0-9]{3}', path.name))
        next_number = max(used, default=0) + 1
        return 'v{:03d}'.format(next_number) if next_number <= 999 else None

    def status(self, version=None):
        state = self.load()
        record = self.record(state, version) if version else (state['versions'][-1] if state['versions'] else None)
        require(version is None or record is not None, '版本尚未登记。')
        result = {'kind': self.kind, 'next_version': self.next_version(state), 'registered_versions': len(state['versions'])}
        if not record:
            return {**result, 'status': 'not_registered', 'pending': []}
        drift = self.drift(record)
        result.update(version=record['version'], status=record['status'],
                      effective_status='modified_after_review' if drift['changed'] else record['status'],
                      artifact_drift=drift, config_changed=read_json(self.config_path) != record['config_snapshot'],
                      pending=self.pending(record), stats=record['stats'], confirmation=record['confirmation'])
        return result

    def compare_records(self, before, after):
        left = config_items(before['config_snapshot'], self.kind)
        right = config_items(after['config_snapshot'], self.kind)
        common_left = [key for key in left if key in right]
        common_right = [key for key in right if key in left]
        return {'from': before['version'], 'to': after['version'], 'files': map_diff(before['files'], after['files']),
                'configured_items': {**map_diff(left, right), 'reordered': common_left != common_right},
                'config_fields': sorted(key for key in before['config_snapshot'].keys() | after['config_snapshot'].keys()
                                        if key not in before['config_snapshot'] or key not in after['config_snapshot']
                                        or before['config_snapshot'][key] != after['config_snapshot'][key]),
                'stats_before': before['stats'], 'stats_after': after['stats'],
                'note': '章节差异来自配置快照；文件差异来自内容指纹；不是语义质量、放映效果或讲述时长的判断。'}

    def diff(self, before, after):
        state = self.load()
        left, right = self.record(state, before), self.record(state, after)
        require(left is not None and right is not None, '比较的版本必须已经登记。')
        return self.compare_records(left, right)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('register', 'feedback', 'resolve', 'state', 'status', 'diff'):
        command = sub.add_parser(name)
        command.add_argument('project', type=Path)
        if name not in ('status', 'diff'):
            command.add_argument('version')
        if name == 'register':
            command.add_argument('--artifact', help='相对于 dist/版本 的入口文件名')
            command.add_argument('--base')
            command.add_argument('--change', action='append', default=[])
            command.add_argument('--reconcile-note', default='')
        elif name == 'feedback':
            command.add_argument('--kind', choices=KINDS, required=True)
            command.add_argument('--text', required=True)
            command.add_argument('--scope', default='')
            command.add_argument('--keep', default='')
        elif name == 'resolve':
            command.add_argument('issue')
            command.add_argument('--note', required=True)
            command.add_argument('--waive', action='store_true')
            command.add_argument('--confirmation', default='')
        elif name == 'state':
            command.add_argument('status', choices=STATES)
            command.add_argument('--note', default='')
            command.add_argument('--confirmation', default='')
        elif name == 'status':
            command.add_argument('--version')
        else:
            command.add_argument('before')
            command.add_argument('after')
    args = vars(parser.parse_args(argv))
    command, project = args.pop('command'), args.pop('project')
    try:
        review = Review(project)
        if command == 'register':
            args['changes'] = args.pop('change')
        action = review.set_state if command == 'state' else getattr(review, command)
        result = action(**args)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, TypeError, ImportError, RuntimeError, zipfile.BadZipFile) as exc:
        print('审阅操作失败：{}\n未改写成品或配置；请检查原因后重试。'.format(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
