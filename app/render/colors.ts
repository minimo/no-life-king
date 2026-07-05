import type { Owner } from '~/types/game'

export const OWNER_COLORS: Record<Owner, number> = {
    player: 0x3498db,
    cpu: 0xe74c3c,
    neutral: 0x95a5a6,
}

export const DARK_OWNER_COLORS: Record<Owner, number> = {
    player: 0x1f5a82, // Darker blue
    cpu: 0x8a2d24,    // Darker red
    neutral: 0x596363, // Darker gray
}

// 村の屋根の色彩変更：描画の不具合（シェーダー/フィルタの干渉）を避けるため、
// 実行時に個別のテクスチャを事前生成する方式を採用しています。
export const ZONE_COLORS: Record<Owner, number> = {
    player: 0x3498db, // Bright blue
    cpu: 0xff1111,    // Vivid red (to avoid looking yellow)
    neutral: 0x95a5a6,
}
