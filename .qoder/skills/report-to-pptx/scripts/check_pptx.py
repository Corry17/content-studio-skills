#!/usr/bin/env python3
"""只读 PPTX 包结构与内容检查，不执行 Office，不替代渲染或媒体验收。"""

import argparse
import json
import posixpath
import re
import sys
import zipfile
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET

NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart'}
REL = '{http://schemas.openxmlformats.org/package/2006/relationships}'
EMU = 914400


def internal_target(source_part, target):
    if '\\' in target or '\x00' in target:
        raise ValueError('包内关系路径非法。')
    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(source_part), unquote(target)))
    if resolved.startswith('/'):
        resolved = resolved[1:]
    if resolved == '..' or resolved.startswith('../'):
        raise ValueError('包内关系越界。')
    return resolved


def check_external(target, base, relation_type):
    if not relation_type.endswith('/hyperlink'):
        return '发现非超链接的外部资源关系。'
    if any(ord(char) < 32 for char in target) or '\\' in target:
        return '外部关系包含控制字符或反斜杠。'
    try:
        parsed = urlsplit(target)
        parsed.port
    except ValueError:
        return '超链接 URL 格式错误。'
    if parsed.scheme or parsed.netloc:
        if parsed.scheme in ('http', 'https') and parsed.hostname and not parsed.username and not parsed.password:
            return None
        return '超链接含非便携或危险协议。'
    raw = unquote(parsed.path)
    if raw.startswith('/') or ':' in raw or '\x00' in raw or '\\' in raw:
        return '附件使用了非便携绝对路径。'
    current = base
    for part in Path(raw).parts:
        current = current / part
        if current.is_symlink():
            return '附件路径经过符号链接。'
    try:
        current.resolve().relative_to(base.resolve())
    except ValueError:
        return '附件路径越出同包目录。'
    if not raw or not current.is_file():
        return '同包附件不存在：{}'.format(target)
    return None


def check_pptx(file):
    file = Path(file)
    errors, warnings, slides = [], [], []
    if file.suffix.lower() != '.pptx' or file.stat().st_size > 512 * 1024 ** 2:
        raise ValueError('输入必须是小于 512 MiB 的 .pptx。')
    with zipfile.ZipFile(file) as archive:
        infos = archive.infolist()
        if len(infos) > 10000 or sum(info.file_size for info in infos) > 1024 ** 3:
            raise ValueError('PPTX 包过大，停止解析。')
        names = set()
        xml = {}
        xml_bytes = 0
        for info in infos:
            name = info.filename
            if name in names:
                errors.append('重复包成员：{}'.format(name))
            names.add(name)
            if name.startswith('/') or '..' in name.split('/') or '\\' in name:
                errors.append('包成员路径不规范。')
            if 'vbaproject' in name.lower():
                errors.append('PPTX 含宏项目。')
            if name.endswith(('.xml', '.rels')):
                xml_bytes += info.file_size
                if info.file_size > 4 * 1024 ** 2 or xml_bytes > 32 * 1024 ** 2:
                    raise ValueError('XML 内容过大，停止解析。')
                content = archive.read(info)
                if re.search(br'<!\s*(?:DOCTYPE|ENTITY)', content, re.I):
                    raise ValueError('不接受含 DTD/实体声明的 Office XML。')
                try:
                    xml[name] = ET.fromstring(content)
                except ET.ParseError:
                    errors.append('XML 解析失败：{}'.format(name))
        for required in ('[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml'):
            if required not in xml:
                errors.append('缺少必要部件：{}'.format(required))
        relationships = {}
        for name, root in xml.items():
            if not name.endswith('.rels'):
                continue
            if name == '_rels/.rels':
                source_part = ''
            else:
                source_part = posixpath.join(posixpath.dirname(posixpath.dirname(name)), posixpath.basename(name)[:-5])
            mapping = {}
            for rel in root.findall(REL + 'Relationship'):
                rid, target, kind = rel.get('Id'), rel.get('Target', ''), rel.get('Type', '')
                if rid in mapping:
                    errors.append('关系 ID 重复：{}'.format(name))
                if rel.get('TargetMode') == 'External':
                    error = check_external(target, file.parent, kind)
                    if error:
                        errors.append('{}：{}'.format(name, error))
                    mapping[rid] = (target, kind, True)
                else:
                    try:
                        resolved = internal_target(source_part, target)
                        if resolved not in names:
                            errors.append('包内关系目标缺失：{}'.format(resolved))
                        mapping[rid] = (resolved, kind, False)
                    except ValueError as exc:
                        errors.append(str(exc))
            relationships[source_part] = mapping
        pres = xml.get('ppt/presentation.xml')
        if pres is not None:
            size = pres.find('p:sldSz', NS)
            if size is None:
                errors.append('缺少幻灯片尺寸。')
            width = int(size.get('cx', '0')) if size is not None else 0
            height = int(size.get('cy', '0')) if size is not None else 0
            order = pres.findall('p:sldIdLst/p:sldId', NS)
            if not order:
                errors.append('演示文稿没有页面。')
            for number, reference in enumerate(order, 1):
                relation = relationships.get('ppt/presentation.xml', {}).get(reference.get('{' + NS['r'] + '}id'))
                if not relation or relation[2] or relation[0] not in xml:
                    errors.append('第 {} 页关系无效。'.format(number))
                    continue
                member = relation[0]
                slide = xml[member]
                texts = [node.text or '' for node in slide.findall('.//a:t', NS)]
                native = len(slide.findall('.//p:sp', NS))
                pictures = len(slide.findall('.//p:pic', NS))
                tables = len(slide.findall('.//a:tbl', NS))
                charts = len(slide.findall('.//c:chart', NS))
                if not texts:
                    warnings.append('第 {} 页没有原生文字，请确认不是整页截图。'.format(number))
                notes_text = []
                for target, kind, external in relationships.get(member, {}).values():
                    if kind.endswith('/notesSlide') and not external and target in xml:
                        notes_text.extend(node.text or '' for node in xml[target].findall('.//a:t', NS))
                if not notes_text:
                    warnings.append('第 {} 页未找到演讲备注。'.format(number))
                for shape in slide.findall('p:cSld/p:spTree/*', NS):
                    transform = shape.find('p:spPr/a:xfrm', NS)
                    if transform is None:
                        transform = shape.find('p:xfrm', NS)
                    if transform is None:
                        continue
                    offset, extent = transform.find('a:off', NS), transform.find('a:ext', NS)
                    if offset is None or extent is None:
                        continue
                    x, y = int(offset.get('x', '0')), int(offset.get('y', '0'))
                    w, h = int(extent.get('cx', '0')), int(extent.get('cy', '0'))
                    if min(x, y, w, h) < -100 or x + w > width + 100 or y + h > height + 100:
                        errors.append('第 {} 页存在越出画布的对象。'.format(number))
                for node in slide.iter():
                    if any('ppaction://macro' in value or 'ppaction://program' in value for value in node.attrib.values()):
                        errors.append('第 {} 页含宏或程序动作。'.format(number))
                joined = '\n'.join(texts)
                if re.search(r'\b(?:TODO|PLACEHOLDER|lorem ipsum)\b', joined, re.I):
                    warnings.append('第 {} 页疑似残留占位文本。'.format(number))
                slides.append({'page': number, 'text': joined, 'native_shapes': native,
                               'pictures': pictures, 'tables': tables, 'charts': charts,
                               'notes': '\n'.join(notes_text)})
    return {'ok': not errors, 'slides': len(slides), 'errors': sorted(set(errors)),
            'warnings': sorted(set(warnings)), 'pages': slides, 'rendered': False,
            'note': '仅结构与内容检查，尚未验证 Office 渲染、实际裁切、字体替换和媒体播放。'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pptx', type=Path)
    parser.add_argument('--details', action='store_true', help='同时输出逐页文字、原生对象计数和备注')
    args = parser.parse_args()
    try:
        report = check_pptx(args.pptx)
        if not args.details:
            del report['pages']
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report['ok'] else 1
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, RuntimeError) as exc:
        print('检查失败：{}'.format(exc), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
