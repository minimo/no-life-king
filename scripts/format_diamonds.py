import os

output_dir = '/Users/MacbookAir/.gemini/antigravity/brain/3efdb631-e2c9-4e3c-8ace-a656991fc1a0/'
images_dir = os.path.join(output_dir, 'diamonds')

files = [f for f in os.listdir(images_dir) if f.startswith('diamond_') and f.endswith('.png')]
# Sort by Y then X
def parse_xy(fname):
    parts = fname.replace('diamond_', '').replace('.png', '').split('_')
    return int(parts[0]), int(parts[1])

files.sort(key=lambda fname: (parse_xy(fname)[1], parse_xy(fname)[0]))

md = "# 菱形タイル一覧 (32x16)\n\n"
md += "タイルセットから菱形タイルを抜き出し、わかりやすく拡大しました。\n"
md += "水（川）、山、木（森）、橋 に該当するタイルの **X, Y** を教えてください。\n\n"

current_y = -1
for fname in files:
    x, y = parse_xy(fname)
    if y != current_y:
        if current_y != -1:
            md += "\n\n"
        md += f"## Row {y}\n\n"
        current_y = y
    
    fpath = os.path.join(images_dir, fname)
    md += f"![X:{x} Y:{y}]({fpath}) "

md_path = os.path.join(output_dir, 'diamonds_guide.md')
with open(md_path, 'w') as f:
    f.write(md)

print("Generated compact markdown.")
