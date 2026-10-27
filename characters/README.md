# Reference trainer mascots

Generated with the built-in image generation tool using the four reference images supplied by the user. Source sheets are retained here so the atlases can be rebuilt without generating the art again.

Each character has `directions.png` (nine head turns) and `reactions.png` (nine expressions). The page-mascot skill builds and aligns them into `assets/mascots/<name>-{directions,reactions}.webp`.

The `-pixel` atlases are separately generated 16-bit pixel artwork, with their own source sheets in `<name>-pixel/`. Alignment uses nearest-neighbour resampling, a shared 64-colour palette and binary alpha; it does not downscale the Modern portraits to create the artwork. Existing appearance preferences and mascot IDs remain compatible.

Characters: Red, Cynthia (Shirona), Dawn (Hikari), Gloria (Yuri). These are fan-art adaptations of the supplied Pokémon Masters EX character references.

Build with the page-mascot skill's `scripts/mascot.py <name> --skip-generate --dest assets/mascots`. Python requires Pillow, NumPy and SciPy. Generation prompts and validation results are retained alongside each source pair.

## Preferred first portraits

Cynthia and Gloria use the user's preferred first directions sheets, retained unchanged as `directions-original.png`. `tools/mascot-modern.py` removes disconnected fragments, pads the cells and rebuilds those two with a shallow 3.5% bottom fade to preserve their fuller hair and shoulders. It does not redraw the selected art.

Run `python tools/mascot-pixel.py` to build the four pixel atlases from their own source PNGs. Pass a character name to rebuild only that pair. The script uses the installed page-mascot skill at `~/.agents/skills/page-mascot` (or `--skill-dir`). `tools/mascot-contact-sheet.py` creates the light/dark previews.
