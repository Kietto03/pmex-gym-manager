"""Restore the user's preferred first Cynthia/Gloria sheets and build fuller busts."""
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

root = Path(__file__).resolve().parents[1]
skill = Path.home() / '.agents/skills/page-mascot/scripts'
for name in ('cynthia', 'gloria'):
    source = root / 'characters' / name
    image = Image.open(source / 'directions-original.png').convert('RGBA')
    tile = image.width // 3
    output = Image.new('RGBA', image.size)
    for index in range(9):
        x, y = index % 3 * tile, index // 3 * tile
        pixels = np.array(image.crop((x, y, x + tile, y + tile)))
        mask = pixels[:, :, 3] > 64
        labels, count = ndimage.label(mask)
        sizes = ndimage.sum(mask, labels, range(1, count + 1))
        main = labels == int(np.argmax(sizes)) + 1
        # Keep the original drawing; remove detached fragments between cells.
        pixels[~ndimage.binary_dilation(main, iterations=2)] = 0
        frame = Image.fromarray(pixels).resize((360, 360), Image.Resampling.LANCZOS)
        output.alpha_composite(frame, (x + (tile - 360) // 2, y + (tile - 360) // 2))
    output.save(source / 'directions.png')
    env = {**os.environ, 'FADE_DEPTH': '0.035', 'MASCOT_ROOT': str(root)}
    result = subprocess.run([sys.executable, str(skill / 'mascot.py'), name, '--skip-generate', '--dest', str(root / 'assets/mascots')], env=env, capture_output=True, text=True, check=True)
    (source / 'validation.txt').write_text(result.stdout)
    print(result.stdout)
