import os
from PIL import Image, ImageDraw, ImageFont

input_path = '/Users/MacbookAir/Documents/GitHubRepository/no-life-king/public/assets/Denzi111023-1_processed_v3.png'
output_dir = '/Users/MacbookAir/.gemini/antigravity/brain/3efdb631-e2c9-4e3c-8ace-a656991fc1a0/'
output_path = os.path.join(output_dir, 'grid32_magnified.png')

img = Image.open(input_path).convert("RGBA")

# Scale image first so text and grid lines can be drawn crisp and large
scale = 4
img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)

draw = ImageDraw.Draw(img)

grid_w = 32 * scale
grid_h = 32 * scale
offset_x = 16 * scale
offset_y = 0

cols = (img.width - offset_x) // grid_w
rows = (img.height - offset_y) // grid_h

try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 32)
except:
    font = None

for y in range(rows + 1):
    draw.line((offset_x, offset_y + y * grid_h, img.width, offset_y + y * grid_h), fill=(0, 255, 0, 200), width=3)
for x in range(cols + 1):
    draw.line((offset_x + x * grid_w, offset_y, offset_x + x * grid_w, img.height), fill=(0, 255, 0, 200), width=3)

for y in range(rows):
    for x in range(cols):
        box = (offset_x + x*grid_w, offset_y + y*grid_h, offset_x + (x+1)*grid_w, offset_y + (y+1)*grid_h)
        crop = img.crop(box)
        if crop.getbbox():
            px, py = offset_x + x * grid_w + 8, offset_y + y * grid_h + 8
            text = f"{x},{y}"
            if font:
                # Text outline for visibility
                draw.text((px-2, py), text, font=font, fill="black")
                draw.text((px+2, py), text, font=font, fill="black")
                draw.text((px, py-2), text, font=font, fill="black")
                draw.text((px, py+2), text, font=font, fill="black")
                draw.text((px, py), text, font=font, fill="yellow")
            else:
                draw.text((px, py), text, fill="yellow")

img.save(output_path)
print(f"Generated {output_path}")
