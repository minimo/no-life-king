import os

base_dir = '/Users/MacbookAir/.gemini/antigravity/brain/3efdb631-e2c9-4e3c-8ace-a656991fc1a0/'
output_dir = os.path.join(base_dir, 'tiles')

md_content = "# タイルセット一覧\n\n水（川）、山、木（森）、橋の画像を探し、そのブロックの「列番号 (Col)」「行番号 (Row)」を教えてください。\n\n"

for y in range(6):
    row_empty = True
    row_md = f"## Row {y}\n\n"
    for x in range(13):
        fname = f"tile_col{x}_row{y}.png"
        fpath = os.path.join(output_dir, fname)
        if os.path.exists(fpath):
            row_md += f"![Col {x}, Row {y}]({fpath}) "
            row_empty = False
    
    if not row_empty:
        md_content += row_md + "\n\n"

print(md_content)
