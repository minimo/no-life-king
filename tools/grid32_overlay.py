import os
from PIL import Image, ImageDraw, ImageFont

input_path = '/Users/MacbookAir/Documents/GitHubRepository/no-life-king/public/assets/Denzi111023-1_processed_v3.png'
output_dir = '/Users/MacbookAir/.gemini/antigravity/brain/3efdb631-e2c9-4e3c-8ace-a656991fc1a0/'
output_path = os.path.join(output_dir, 'grid32_overlay.png')

img = Image.open(input_path).convert("RGBA")
draw = ImageDraw.Draw(img)

grid_size = 32
cols = img.width // grid_size
rows = img.height // grid_size

try:
    font = ImageFont.truetype("Arial.ttf", 10)
except:
    font = ImageFont.load_default()

for y in range(rows + 1):
    draw.line((0, y * grid_size, img.width, y * grid_size), fill=(0, 255, 0, 128), width=1)
for x in range(cols + 1):
    draw.line((x * grid_size, 0, x * grid_size, img.height), fill=(0, 255, 0, 128), width=1)

for y in range(rows):
    for x in range(cols):
        # Check if empty before drawing label to reduce clutter
        box = (x*grid_size, y*grid_size, (x+1)*grid_size, (y+1)*grid_size)
        crop = img.crop(box)
        if crop.getbbox():
            px, py = x * grid_size + 2, y * grid_size + 2
            text = f"{x},{y}"
            draw.text((px, py), text, font=font, fill="magenta")

img.save(output_path)
print(f"Generated {output_path}")
