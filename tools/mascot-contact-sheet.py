"""Preview center frames at page size on a light and dark background."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
names = ('red', 'cynthia', 'dawn', 'gloria')
for style in ('', '-pixel'):
    canvas = Image.new('RGB', (960, 600), '#f6f4ef')
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 300, 960, 600), fill='#161b28')
    for index, name in enumerate(names):
        for row, kind in enumerate(('directions', 'reactions')):
            image = Image.open(root / 'assets' / 'mascots' / f'{name}{style}-{kind}.webp').convert('RGBA')
            tile = image.width // 3
            # Straight-ahead directions, delighted expressions.
            cell = 4 if row == 0 else 8
            col, source_row = cell % 3, cell // 3
            image = image.crop((col * tile, source_row * tile, (col + 1) * tile, (source_row + 1) * tile))
            image = image.resize((220, 220), Image.Resampling.NEAREST if style else Image.Resampling.LANCZOS)
            canvas.paste(image, (index * 240 + 10, row * 300 + 25), image)
            draw.text((index * 240 + 90, row * 300 + 260), name.title(), fill='#202332' if row == 0 else '#ffffff')
    if style:
        canvas.save(root / 'assets' / 'mascots' / 'trainer-pixel-preview.png')
    else:
        canvas.save(root / 'assets' / 'mascots' / 'trainer-preview.jpg', quality=95)
