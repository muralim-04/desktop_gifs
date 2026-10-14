#!/usr/bin/env python3
"""Builds the two release ZIPs from the extension folder.

The folder itself loads in both browsers, but its manifest names a background
script twice: background.service_worker for Chromium and background.scripts
for Firefox. Chromium lists the key it does not use as an error on the
extension's card, which people take for a failed install. Each ZIP therefore
gets a manifest with only its own browser's keys; every other file is copied
as it is.

    python3 tools/package.py

writes dist/desktop-gifs-chromium.zip and dist/desktop-gifs-firefox.zip, each
with manifest.json at its top level.
"""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'extension'
DIST = ROOT / 'dist'


def chromium(manifest):
    del manifest['background']['scripts']
    del manifest['browser_specific_settings']


def firefox(manifest):
    del manifest['background']['service_worker']
    del manifest['minimum_chrome_version']


def build(name, strip):
    manifest = json.loads((SRC / 'manifest.json').read_text(encoding='utf-8'))
    strip(manifest)
    out = DIST / f'desktop-gifs-{name}.zip'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('manifest.json', json.dumps(manifest, indent=2) + '\n')
        for path in sorted(SRC.rglob('*')):
            if path.is_file() and path.name != 'manifest.json' and path.suffix not in ('.ts', '.map'):
                z.write(path, path.relative_to(SRC).as_posix())
    return out, manifest['version']


def main():
    DIST.mkdir(exist_ok=True)
    for name, strip in (('chromium', chromium), ('firefox', firefox)):
        out, version = build(name, strip)
        print(f'{out.relative_to(ROOT)}  (version {version}, {out.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
