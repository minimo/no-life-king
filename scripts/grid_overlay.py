import os
from PIL import Image, ImageDraw, ImageFont

input_path = '/Users/MacbookAir/Documents/GitHubRepository/no-life-king/public/assets/Denzi111023-1_processed_v3.png'
output_dir = '/Users/MacbookAir/.gemini/antigravity/brain/3efdb631-e2c9-4e3c-8ace-a656991fc1a0/'
output_path = os.path.join(output_dir, 'grid_overlay.png')

img = Image.open(input_path).convert("RGBA")
draw = ImageDraw.Draw(img)

cols = img.width // 64
rows = img.height // 64

# Attempt to load a default font, or rely on default
try:
    font = ImageFont.truetype("Arial.ttf", 20)
except:
    font = ImageFont.load_default()

for y in range(rows + 1):
    draw.line((0, y * 64, img.width, y * 64), fill=(255, 0, 0, 128), width=2)
for x in range(cols + 1):
    draw.line((x * 64, 0, x * 64, img.height), fill=(255, 0, 0, 128), width=2)

for y in range(rows):
    for x in range(cols):
        # Only draw text if cell is not empty
        box = (x*64, y*64, (x+1)*64, (y+1)*64)
        crop = img.crop(box)
        if crop.getbbox():
            text = f"{x},{y}"
            
            # draw text with black outline for visibility
            px, py = x * 64 + 10, y * 64 + 10
            draw.text((px-1, py), text, font=font, fill="black")
            draw.text((px+1, py), text, font=font, fill="black")
            draw.text((px, py-1), text, font=font, fill="black")
            draw.text((px, py+1), text, font=font, fill="black")
            
            draw.text((px, py), text, font=font, fill="white")

img.save(output_path)
print(f"Generated {output_path}")
