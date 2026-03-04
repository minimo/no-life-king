import os
from PIL import Image

input_path = '/Users/MacbookAir/Documents/GitHubRepository/no-life-king/public/assets/Denzi111023-1_processed_v3.png'
base_dir = '/Users/MacbookAir/.gemini/antigravity/brain/3efdb631-e2c9-4e3c-8ace-a656991fc1a0/'
output_dir = os.path.join(base_dir, 'tiles')
os.makedirs(output_dir, exist_ok=True)

img = Image.open(input_path).convert("RGBA")
cols = img.width // 64
rows = img.height // 64

md_content = "# Tileset Guide\n\n水、山、木、橋の画像を探し、その（列, 行）をお知らせください。\n\n"

for y in range(rows):
    row_empty = True
    row_md = f"## Row {y}\n\n"
    for x in range(cols):
        box = (x*64, y*64, (x+1)*64, (y+1)*64)
        crop = img.crop(box)
        if crop.getbbox():
            fname = f"tile_col{x}_row{y}.png"
            fpath = os.path.join(output_dir, fname)
            crop.save(fpath)
            row_md += f"![Col {x}, Row {y}](file://{fpath}) "
            row_empty = False
    
    if not row_empty:
        md_content += row_md + "\n\n"

md_path = os.path.join(base_dir, 'tileset_guide.md')
with open(md_path, 'w') as f:
    f.write(md_content)

print(f"Generated {md_path}")
