from PIL import Image

def analyze_sprite(img_path):
    img = Image.open(img_path).convert('RGBA')
    width, height = img.size
    print(f"Image Size: {width}x{height}")

    # 中央付近の半円パーツ（am 6:00 あたり）を探索
    # スプライトシートの(192, 0)付近から開始
    roi_start_x = 192
    roi_start_y = 0
    roi_width = 256 # 十分に広い範囲
    roi_height = 128

    # 特定の色（半円の境界や中身）を探して、不透明な領域の範囲を特定する
    pixels = img.load()
    
    min_x, min_y = width, height
    max_x, max_y = 0, 0
    found = False

    # (192, 0) から (192+256, 128) の範囲で不透明なピクセルの範囲を計算
    for y in range(roi_start_y, roi_start_y + roi_height):
        for x in range(roi_start_x, roi_start_x + roi_width):
            if x >= width or y >= height: continue
            r, g, b, a = pixels[x, y]
            # 背景色 (71, 108, 108) ではない、かつ不透明なピクセルを探す
            if a > 0 and not (r == 71 and g == 108 and b == 108):
                found = True
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y

    if found:
        sprite_w = max_x - min_x + 1
        sprite_h = max_y - min_y + 1
        print(f"Found sprite at: ({min_x}, {min_y})")
        print(f"Sprite Size: {sprite_w}x{sprite_h}")
    else:
        print("No sprite found in the specified ROI.")

analyze_sprite('/Users/MacbookAir/Documents/GitHubRepository/no-life-king/public/assets/Denzi100225-4.png')
