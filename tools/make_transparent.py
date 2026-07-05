from PIL import Image
import os

def make_transparent(image_path, target_colors):
    """
    指定された色を透明にする関数
    """
    img = Image.open(image_path).convert("RGBA")
    datas = img.getdata()

    new_data = []
    for item in datas:
        # item: (R, G, B, A)
        found = False
        for target in target_colors:
            if item[0] == target[0] and item[1] == target[1] and item[2] == target[2]:
                new_data.append((0, 0, 0, 0))
                found = True
                break
        if not found:
            new_data.append(item)

    img.putdata(new_data)
    
    # 元のファイルをバックアップして上書き
    bak_path = image_path + ".bak"
    if not os.path.exists(bak_path):
        os.rename(image_path, bak_path)
    
    img.save(image_path, "PNG")
    print(f"Processed: {image_path}")

if __name__ == "__main__":
    assets_dir = "public/assets"
    target_file = os.path.join(assets_dir, "Denzi111023-1.png")
    
    # 背景色: (71, 108, 108) のみを透過対象とする
    targets = [
        (71, 108, 108), # メイン背景
    ]
    
    make_transparent(target_file, targets)
