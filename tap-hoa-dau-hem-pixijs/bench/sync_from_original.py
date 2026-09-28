"""Dùng: python bench/sync_from_original.py [--dry]

Chép mã từ bản gốc (thư mục ../tap-hoa-dau-hem, gồm cả thay đổi chưa commit) sang bản PixiJS,
chỉ đổi dòng import Phaser → engine. Các file bắt buộc khác do engine (SKIP) không bị ghi đè.
"""
import os
import re
import sys

# Bản PixiJS là thư mục cha của bench/, bản gốc nằm cạnh nó.
P = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
O = os.path.join(os.path.dirname(P), 'tap-hoa-dau-hem')
# File bắt buộc khác do engine / lưu riêng: xử lý tay.
SKIP = {'src/ui/scroll.ts', 'src/ui/liveMap.ts', 'src/ui/perfOverlay.ts', 'src/ui/roundrect.ts',
        'src/core/save.ts', 'src/main.ts', 'src/game.ts'}
dry = '--dry' in sys.argv


def convert(text: str) -> str:
    text = text.replace("import Phaser from 'phaser';", "import * as Engine from '../engine';")
    text = text.replace("import type Phaser from 'phaser';", "import type * as Engine from '../engine';")
    return re.sub(r'\bPhaser\.', 'Engine.', text)


changed = []
for dirpath, _, files in os.walk(os.path.join(O, 'src')):
    for name in files:
        src = os.path.join(dirpath, name)
        rel = os.path.relpath(src, O).replace('\\', '/')
        if rel in SKIP:
            continue
        with open(src, 'rb') as fh:
            data = fh.read()
        if rel.endswith('.ts'):
            data = convert(data.decode('utf8')).encode('utf8')
        dst = os.path.join(P, rel)
        old = open(dst, 'rb').read() if os.path.exists(dst) else None
        if old == data:
            continue
        changed.append(rel)
        if not dry:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, 'wb') as fh:
                fh.write(data)
print('\n'.join(changed))
print(f'{len(changed)} file(s) {"would change" if dry else "synced"}')
