# Reference trainer mascots

Generated with the built-in image generation tool using the four reference images supplied by the user. Source sheets are retained here so the atlases can be rebuilt without generating the art again.

Each character has `directions.png` (nine head turns) and `reactions.png` (nine expressions). The page-mascot skill builds and aligns them into `assets/mascots/<name>-{directions,reactions}.webp`.

The `-pixel` atlases are a nearest-neighbour, reduced-resolution rendering of the same aligned artwork, rather than a separately redrawn character. Existing appearance preferences and mascot IDs remain compatible.

Characters: Red, Cynthia (Shirona), Dawn (Hikari), Gloria (Yuri). These are fan-art adaptations of the supplied Pokémon Masters EX character references.

Build with the page-mascot skill's `scripts/mascot.py <name> --skip-generate --dest assets/mascots`. Python requires Pillow, NumPy and SciPy. Generation prompts and validation results are retained alongside each source pair.
