import os
from PIL import Image, ImageDraw, ImageFont

input_path = '/Users/MacbookAir/Documents/GitHubRepository/no-life-king/public/assets/Denzi111023-1_processed_v3.png'
output_dir = '/Users/MacbookAir/.gemini/antigravity/brain/3efdb631-e2c9-4e3c-8ace-a656991fc1a0/'
output_path = os.path.join(output_dir, 'grid32_offset_overlay.png')

img = Image.open(input_path).convert("RGBA")
draw = ImageDraw.Draw(img)

grid_size = 32
offset_x = 16
offset_y = 0

cols = (img.width - offset_x) // grid_size
rows = (img.height - offset_y) // grid_size

try:
    font = ImageFont.truetype("Arial.ttf", 10)
except:
    font = ImageFont.load_default()

for y in range(rows + 1):
    draw.line((offset_x, offset_y + y * grid_size, img.width, offset_y + y * grid_size), fill=(0, 255, 0, 128), width=1)
for x in range(cols + 1):
    draw.line((offset_x + x * grid_size, offset_y, offset_x + x * grid_size, img.height), fill=(0, 255, 0, 128), width=1)

for y in range(rows):
    for x in range(cols):
        box = (offset_x + x*grid_size, offset_y + y*grid_size, offset_x + (x+1)*grid_size, offset_y + (y+1)*grid_size)
        crop = img.crop(box)
        if crop.getbbox():
            px, py = offset_x + x * grid_size + 2, offset_y + y * grid_size + 2
            text = f"{x},{y}"
            draw.text((px, py), text, font=font, fill="magenta")

img.save(output_path)
print(f"Generated {output_path}")
