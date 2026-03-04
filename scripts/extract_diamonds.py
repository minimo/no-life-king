import os
from PIL import Image

input_path = '/Users/MacbookAir/Documents/GitHubRepository/no-life-king/public/assets/Denzi111023-1_processed_v3.png'
output_dir = '/Users/MacbookAir/.gemini/antigravity/brain/3efdb631-e2c9-4e3c-8ace-a656991fc1a0/diamonds/'
os.makedirs(output_dir, exist_ok=True)

img = Image.open(input_path).convert("RGBA")

# Diamond tile: 32x16, offset 16px left, 16px top
tile_w = 32
tile_h = 16
offset_x = 16
offset_y = 16

cols = (img.width - offset_x) // tile_w
rows = (img.height - offset_y) // tile_h

scale = 8  # Scale up 8x for very clear view

results = []

for y in range(rows):
    for x in range(cols):
        x0 = offset_x + x * tile_w
        y0 = offset_y + y * tile_h
        crop = img.crop((x0, y0, x0 + tile_w, y0 + tile_h))
        
        if crop.getbbox():
            # Scale up
            big = crop.resize((tile_w * scale, tile_h * scale), Image.NEAREST)
            fname = f"diamond_{x}_{y}.png"
            fpath = os.path.join(output_dir, fname)
            big.save(fpath)
            results.append((x, y, fpath))

# Generate markdown
md = "# 菱形タイル一覧\n\n"
md += "タイルセットから32x16の菱形タイルを全て抜き出し、8倍に拡大しました。\n\n"
md += "水（川）、山、木（森）、橋 に該当するタイルの **X, Y** を教えてください。\n\n"

for x, y, fpath in results:
    md += f"### X:{x}, Y:{y}\n\n"
    md += f"![X:{x} Y:{y}]({fpath})\n\n"

md_path = os.path.join(os.path.dirname(output_dir), 'diamonds_guide.md')
with open(md_path, 'w') as f:
    f.write(md)

print(f"Extracted {len(results)} diamond tiles")
print(f"Markdown: {md_path}")
