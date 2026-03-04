import os
from PIL import Image

output_dir = '/Users/MacbookAir/.gemini/antigravity/brain/17de2c0c-d3c7-4ff6-8576-3e22c1b5dfca/'
img = Image.open('public/assets/Denzi111023-1_processed_v3.png')

markdown_content = '# Tileset Bottom Row (y=304)\n\n'

for i in range(13):
    x = i * 64
    y = 304
    crop = img.crop((x, y, x + 64, y + 64))
    filename = f'block_{i}.png'
    filepath = os.path.join(output_dir, filename)
    crop.save(filepath)
    markdown_content += f'## Block {i} (x={x})\n![block {i}](file://{filepath})\n\n'

markdown_content += '# Tileset Row 2 (y=240)\n\n'
for i in range(13):
    x = i * 64
    y = 240
    crop = img.crop((x, y, x + 64, y + 64))
    filename = f'block_row2_{i}.png'
    filepath = os.path.join(output_dir, filename)
    crop.save(filepath)
    markdown_content += f'## Row2 Block {i} (x={x})\n![row2 block {i}](file://{filepath})\n\n'

viewer_path = os.path.join(output_dir, 'tileset_viewer.md')
with open(viewer_path, 'w') as f:
    f.write(markdown_content)

print('Generated tileset_viewer.md with image slices')
