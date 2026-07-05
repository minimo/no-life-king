import os
from PIL import Image

input_path = '/Users/MacbookAir/Documents/GitHubRepository/no-life-king/public/assets/Denzi111023-1_processed_v3.png'
img = Image.open(input_path).convert("RGBA")

tile_w = 32
tile_h = 16
offset_x = 16
offset_y = 16

cols = (img.width - offset_x) // tile_w
rows = (img.height - offset_y) // tile_h

def analyze_tile(x, y, h_blocks=1):
    box = (offset_x + x * tile_w, offset_y + y * tile_h, offset_x + (x+1) * tile_w, offset_y + (y+h_blocks) * tile_h)
    crop = img.crop(box)
    if not crop.getbbox():
        return None
    r, g, b, count = 0, 0, 0, 0
    non_transparent = 0
    pixels = crop.load()
    for cy in range(h_blocks * tile_h):
        for cx in range(tile_w):
            px = pixels[cx, cy]
            if px[3] > 0:
                non_transparent += 1
                r += px[0]
                g += px[1]
                b += px[2]
                count += 1
    if count == 0: return None
    return {"x": x, "y": y, "r": r//count, "g": g//count, "b": b//count, "pixels": non_transparent}

candidates = {"water": [], "mountain": [], "wood": [], "bridge": []}

for y in range(rows):
    for x in range(cols):
        t1 = analyze_tile(x, y, h_blocks=1)
        if t1:
            r, g, b = t1['r'], t1['g'], t1['b']
            # Water: dominant blue/cyan, usually bright. Cyan has high G and B.
            if b > r + 20 and g > r + 20 and b > 80:
                # specifically look at row 3 (which translates to Y=2 or Y=3)
                candidates["water"].append(t1)
            # Bridge
            if 80 < r < 140 and 40 < g < 100 and 10 < b < 60:
                candidates["bridge"].append(t1)
                
        if y > 0:
            t2 = analyze_tile(x, y-1, h_blocks=2)
            if t2 and t2['pixels'] > 150:
                r, g, b = t2['r'], t2['g'], t2['b']
                if 100 < r < 180 and 100 < g < 180 and 100 < b < 180 and abs(r-g) < 20 and abs(g-b) < 20: # grey
                    candidates["mountain"].append(t2)
                if g > r + 15 and g > b + 15 and g < 180: # green
                    candidates["wood"].append(t2)

print("\n--- REFINED RESULTS ---")
for key, lst in candidates.items():
    if lst:
        best = lst[0]
        print(f"{key.capitalize()}: X={best['x']}, Y={best['y']} (RGB: {best['r']},{best['g']},{best['b']})")
    else:
        print(f"{key.capitalize()}: NOT FOUND")
        
# If water not found print all row 3 / 4 colors
print("\nDebug Row 3 Colors:")
for x in range(min(5, cols)):
    t = analyze_tile(x, 3)
    if t: print(f"  X={x}, Y={3} RGB: {t['r']},{t['g']},{t['b']}")

