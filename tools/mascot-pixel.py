"""Make the pixel rendering from aligned atlases without changing cell placement."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
for name in ('red', 'cynthia', 'dawn', 'gloria'):
    for kind in ('directions', 'reactions'):
        source = root / 'assets' / 'mascots' / f'{name}-{kind}.webp'
        image = Image.open(source).convert('RGBA')
        # 60px per cell retains the small accessories, with crisp square pixels.
        image = image.resize((180, 180), Image.Resampling.NEAREST)
        image.save(source.with_name(f'{name}-pixel-{kind}.webp'), lossless=True)
