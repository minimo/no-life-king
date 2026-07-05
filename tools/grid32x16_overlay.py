import os
from PIL import Image, ImageDraw, ImageFont

input_path = '/Users/MacbookAir/Documents/GitHubRepository/no-life-king/public/assets/Denzi111023-1_processed_v3.png'
output_dir = '/Users/MacbookAir/.gemini/antigravity/brain/3efdb631-e2c9-4e3c-8ace-a656991fc1a0/'
output_path = os.path.join(output_dir, 'grid32x16_overlay.png')

img = Image.open(input_path).convert("RGBA")
draw = ImageDraw.Draw(img)

grid_w = 32
grid_h = 16
offset_x = 16
offset_y = 16 # Adjusting Y offset to 16 as well, since the grass tile starts at y=16

cols = (img.width - offset_x) // grid_w
rows = (img.height - offset_y) // grid_h

try:
    font = ImageFont.truetype("Arial.ttf", 9)
except:
    font = ImageFont.load_default()

for y in range(rows + 1):
    draw.line((offset_x, offset_y + y * grid_h, img.width, offset_y + y * grid_h), fill=(0, 255, 0, 128), width=1)
for x in range(cols + 1):
    draw.line((offset_x + x * grid_w, offset_y, offset_x + x * grid_w, img.height), fill=(0, 255, 0, 128), width=1)

for y in range(rows):
    for x in range(cols):
        box = (offset_x + x*grid_w, offset_y + y*grid_h, offset_x + (x+1)*grid_w, offset_y + (y+1)*grid_h)
        crop = img.crop(box)
        if crop.getbbox():
            px, py = offset_x + x * grid_w + 1, offset_y + y * grid_h + 1
            text = f"{x},{y}"
            draw.text((px, py), text, font=font, fill="magenta")

img.save(output_path)
print(f"Generated {output_path}")
