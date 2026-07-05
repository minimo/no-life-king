from PIL import Image

def analyze_grid(img_path):
    img = Image.open(img_path).convert('RGBA')
    pixels = img.load()
    width, height = img.size
    
    # グリッド線（明るい黄緑色）をスキャン
    # 典型的な位置 (191, y) や (x, 127) をチェック
    print("--- Grid Line Analysis ---")
    
    # x=191 の縦線をチェック
    target_x = 191
    colors = []
    for y in range(0, 10):
        colors.append(pixels[target_x, y])
    print(f"Colors at x={target_x}: {colors}")

    # y=127 の横線をチェック
    target_y = 127
    colors = []
    for x in range(191, 201):
        colors.append(pixels[x, target_y])
    print(f"Colors at y={target_y}: {colors}")

    # 最初の半円 (am 6:00) の内容物の境界を特定
    # グリッド線の内側を探索
    content_min_x, content_min_y = 999, 999
    content_max_x, content_max_y = 0, 0
    
    # 192,0 から 192+255, 127 の範囲
    for y in range(0, 128):
        for x in range(192, 192 + 256):
            if x >= width or y >= height: continue
            r, g, b, a = pixels[x, y]
            # 緑色のガイド線 (例: 153, 255, 153) を避ける
            if a > 0 and not (r < 170 and g > 200 and b < 170):
                if x < content_min_x: content_min_x = x
                if y < content_min_y: content_min_y = y
                if x > content_max_x: content_max_x = x
                if y > content_max_y: content_max_y = y
                
    print(f"--- Content Analysis (am 6:00) ---")
    print(f"Content Area: ({content_min_x}, {content_min_y}) to ({content_max_x}, {content_max_y})")
    print(f"Content Size: {content_max_x - content_min_x + 1}x{content_max_y - content_min_y + 1}")

analyze_grid('/Users/MacbookAir/Documents/GitHubRepository/no-life-king/public/assets/Denzi100225-4.png')
