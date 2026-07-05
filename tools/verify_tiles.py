import os
from PIL import Image

input_path = '/Users/MacbookAir/Documents/GitHubRepository/no-life-king/public/assets/Denzi111023-1_processed_v3.png'
output_dir = '/Users/MacbookAir/.gemini/antigravity/brain/3efdb631-e2c9-4e3c-8ace-a656991fc1a0/'

img = Image.open(input_path).convert("RGBA")

offset_x, offset_y = 16, 16

coords = {
    "water": (0, 4, 32, 16),
    "mountain": (0, 15, 32, 32), # tall
    "wood": (0, 17, 32, 32),     # tall
    "bridge": (3, 20, 32, 16)
}

result_img = Image.new("RGBA", (200, 100), (0,0,0,0))
x_cursor = 0

for name, (tx, ty, w, h) in coords.items():
    # Since y is the base tile index, if the item is tall (h=32), we need to start from y-1
    y_start = ty - 1 if h == 32 else ty
    
    box = (offset_x + tx * 32, offset_y + y_start * 16, offset_x + tx * 32 + w, offset_y + y_start * 16 + h)
    crop = img.crop(box)
    
    result_img.paste(crop, (x_cursor, 0))
    x_cursor += 40

out_path = os.path.join(output_dir, 'verification.png')
result_img.save(out_path)
print("Saved verification image.")
