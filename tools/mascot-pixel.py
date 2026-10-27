"""Build hand-drawn pixel sources using the page-mascot alignment pipeline.

All alignment resampling is nearest-neighbour and the bottom vignette is disabled,
so the exported pixel artwork never acquires the Modern atlas's soft edges.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('names', nargs='*', default=['red', 'cynthia', 'dawn', 'gloria'])
parser.add_argument('--skill-dir', type=Path, default=Path.home() / '.agents/skills/page-mascot')
parser.add_argument('--prepare-only', action='store_true', help='Normalize/screen directions before generating reactions')
args = parser.parse_args()
scripts = args.skill_dir / 'scripts'
build_source = (scripts / 'build.py').read_text().replace('Image.LANCZOS', 'Image.Resampling.NEAREST')

for name in args.names:
    source = root / 'characters' / f'{name}-pixel'
    original = source / 'directions-original.png'
    if original.is_file():
        image = Image.open(original).convert('RGBA')
        if image.width != image.height:
            # Recover the nine separate sprites from an uneven generated layout.
            pixels = np.array(image)
            labels, count = ndimage.label(pixels[:, :, 3] > 64)
            ids = np.argsort(np.bincount(labels.ravel())[1:])[-9:] + 1
            items = []
            for label in ids:
                ys, xs = np.where(labels == label)
                items.append((ys.mean(), xs.mean(), label, (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)))
            items.sort()
            ordered = []
            for row in range(3):
                ordered.extend(sorted(items[row * 3:(row + 1) * 3], key=lambda item: item[1]))
            scale = 310 / max(max(box[2] - box[0], box[3] - box[1]) for _, _, _, box in ordered)
            tile = 418
            cleaned = Image.new('RGBA', (tile * 3, tile * 3))
            for index, (_, _, label, _) in enumerate(ordered):
                keep = ndimage.binary_dilation(labels == label, iterations=2)
                ys, xs = np.where(keep)
                x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
                crop = pixels[y0:y1, x0:x1].copy()
                crop[~keep[y0:y1, x0:x1]] = 0
                frame = Image.fromarray(crop).resize((round((x1 - x0) * scale), round((y1 - y0) * scale)), Image.Resampling.NEAREST)
                cleaned.alpha_composite(frame, (index % 3 * tile + (tile - frame.width) // 2, index // 3 * tile + 370 - frame.height))
        else:
            tile = image.width // 3
            cleaned = Image.new('RGBA', image.size)
            for index in range(9):
                x, y = index % 3 * tile, index // 3 * tile
                pixels = np.array(image.crop((x, y, x + tile, y + tile)))
                mask = pixels[:, :, 3] > 64
                labels, count = ndimage.label(mask)
                main = labels == int(np.argmax(ndimage.sum(mask, labels, range(1, count + 1)))) + 1
                pixels[~ndimage.binary_dilation(main, iterations=2)] = 0
                frame = Image.fromarray(pixels).resize((360, 360), Image.Resampling.NEAREST)
                cleaned.alpha_composite(frame, (x + (tile - 360) // 2, y + (tile - 360) // 2))
        cleaned.save(source / 'directions.png')
    if args.prepare_only:
        subprocess.run([sys.executable, str(scripts / 'screen.py'), str(source / 'directions.png')], check=True)
        continue
    for kind in ('directions', 'reactions'):
        if not (source / f'{kind}.png').is_file():
            raise SystemExit(f'Missing hand-drawn source: {source / kind}.png')
    with tempfile.TemporaryDirectory(prefix='pmex-pixel-') as temporary:
        directory = Path(temporary)
        builder = directory / 'build-nearest.py'
        builder.write_text(build_source)
        env = {**os.environ, 'MASCOT_ROOT': str(root), 'MASCOT_DEST': str(directory)}
        subprocess.run([sys.executable, str(builder), f'{name}-pixel', '--anchor', 'shoulders', '--no-vignette'], env=env, check=True)
        sheets = [Image.open(directory / f'{name}-pixel-{kind}.webp').convert('RGBA').resize((288, 288), Image.Resampling.NEAREST) for kind in ('directions', 'reactions')]
        # A shared palette prevents the character's colours changing on a click.
        combined = Image.new('RGB', (288, 576))
        for row, sheet in enumerate(sheets):
            combined.paste(sheet.convert('RGB'), (0, row * 288))
        palette = combined.quantize(colors=64, dither=Image.Dither.NONE)
        final = directory / 'final'
        final.mkdir()
        for kind, sheet in zip(('directions', 'reactions'), sheets):
            alpha = sheet.getchannel('A').point(lambda value: 255 if value >= 128 else 0)
            image = sheet.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE).convert('RGBA')
            image.putalpha(alpha)
            image.save(final / f'{name}-pixel-{kind}.webp', lossless=True)
        report = subprocess.run([sys.executable, str(scripts / 'verify.py'), f'{name}-pixel'], env={**env, 'MASCOT_DEST': str(final)}, check=True, capture_output=True, text=True)
        shift = float(re.search(r'moves ([\d.]+) rendered px', report.stdout)[1])
        width = float(re.search(r'worst width change: \S+ at ([\d.]+)%', report.stdout)[1])
        match = float(re.search(r'weakest palette match: \S+ at ([\d.]+)%', report.stdout)[1])
        if shift > 2 or width > 12 or match < 22:
            raise SystemExit(f'{name}: pixel alignment failed; previous atlases retained.\n{report.stdout}')
        for kind in ('directions', 'reactions'):
            path = f'{name}-pixel-{kind}.webp'
            shutil.copy2(final / path, root / 'assets/mascots' / path)
        (source / 'validation.txt').write_text(report.stdout)
        print(report.stdout)
