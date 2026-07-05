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
    
    # Diamond shape mask logic for basic 32x16
    for cy in range(h_blocks * tile_h):
        for cx in range(tile_w):
            px = pixels[cx, cy]
            if px[3] > 0:
                non_transparent += 1
                r += px[0]
                g += px[1]
                b += px[2]
                count += 1
                
    if count == 0:
        return None
        
    avg_r = r // count
    avg_g = g // count
    avg_b = b // count
    
    return {
        "x": x, "y": y, 
        "r": avg_r, "g": avg_g, "b": avg_b, 
        "pixels": non_transparent
    }

print("Running heuristic analysis to find tiles...")

candidates = {
    "water": [],
    "mountain": [],
    "wood": [],
    "bridge": []
}

for y in range(rows):
    for x in range(cols):
        # 1. Look for flat tiles (Water, Bridge)
        t1 = analyze_tile(x, y, h_blocks=1)
        if t1:
            r, g, b = t1['r'], t1['g'], t1['b']
            # Water: dominant blue/cyan
            if b > r + 40 and b > g + 10 and b > 100:
                candidates["water"].append(t1)
            # Bridge: brown wooden color with specific pixel density
            if 80 < r < 140 and 40 < g < 100 and 10 < b < 60:
                candidates["bridge"].append(t1)
                
        # 2. Look for tall structures (Mountain, Wood) -> spans 2 blocks high (32x32)
        # Note: the "base" of the structure is at (x, y), so we look at (x, y-1) to (x, y)
        if y > 0:
            t2 = analyze_tile(x, y-1, h_blocks=2)
            if t2 and t2['pixels'] > 150: # Must have significant pixels in the top half
                r, g, b = t2['r'], t2['g'], t2['b']
                # Mountain: Grey / Brown / Whitish peak
                if 100 < r < 180 and 100 < g < 180 and 100 < b < 180 and abs(r-g) < 20 and abs(g-b) < 20:
                    candidates["mountain"].append({"x": x, "y": y, "r": r, "g": g, "b": b})
                # Wood: Deep Green
                if g > r + 30 and g > b + 30 and g < 150:
                    candidates["wood"].append({"x": x, "y": y, "r": r, "g": g, "b": b})

print("\n--- RESULTS ---")
for key, lst in candidates.items():
    if lst:
        # Take the best matches or earliest occurring
        best = lst[0]
        print(f"{key.capitalize()}: X={best['x']}, Y={best['y']} (RGB: {best['r']},{best['g']},{best['b']})")
    else:
        print(f"{key.capitalize()}: NOT FOUND")
