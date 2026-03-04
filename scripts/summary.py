import os
from PIL import Image, ImageDraw, ImageFont

output_dir = '/Users/MacbookAir/.gemini/antigravity/brain/17de2c0c-d3c7-4ff6-8576-3e22c1b5dfca/'
img = Image.open('public/assets/Denzi111023-1_processed_v3.png')

markdown_content = '# Tileset Bottom Row (y=304)\n\n'

# Create a summary image
summary_width = 13 * 64
summary_height = 128 + 40 # two rows + text
summary_img = Image.new('RGBA', (summary_width, summary_height), (50, 50, 50, 255))
draw = ImageDraw.Draw(summary_img)

for i in range(13):
    x = i * 64
    y = 304
    crop = img.crop((x, y, x + 64, y + 64))
    filepath = os.path.join(output_dir, f'block_{i}.png')
    
    # Add to summary
    summary_img.paste(crop, (x, 0))
    draw.text((x + 5, 65), f'Block {i}', fill=(255, 255, 255, 255))
    
    markdown_content += f'## Block {i} (x={x})\n![block {i}]({filepath})\n\n'

markdown_content += '# Tileset Row 2 (y=240)\n\n'
for i in range(13):
    x = i * 64
    y = 240
    crop = img.crop((x, y, x + 64, y + 64))
    filepath = os.path.join(output_dir, f'block_row2_{i}.png')
    
    # Add to summary
    summary_img.paste(crop, (x, 100))
    draw.text((x + 5, 100 + 65), f'R2 B{i}', fill=(255, 255, 255, 255))
    
    markdown_content += f'## Row2 Block {i} (x={x})\n![row2 block {i}]({filepath})\n\n'

summary_img.save(os.path.join(output_dir, 'buildings_summary.png'))

viewer_path = os.path.join(output_dir, 'tileset_viewer.md')
with open(viewer_path, 'w') as f:
    f.write(markdown_content)

print('Updated tileset_viewer.md and created buildings_summary.png')
