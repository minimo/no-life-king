<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '~/stores/game'

const gameStore = useGameStore()

// 0〜1439分を hh:mm 形式に変換
const timeStr = computed(() => {
  const h = Math.floor(gameStore.dayTime / 60) % 24
  const m = Math.floor(gameStore.dayTime % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
})

// 指定した時刻（時）の背景スタイルを返すヘルパー
const getSkyStyle = (hour: number, opacity: number, zIndex: number) => {
  // am 6:00 からの経過時間インデックス
  const elapsed = (hour - 6 + 24) % 24
  const row = elapsed % 6
  const col = Math.floor(elapsed / 6)
  
  const scaleX = 2.0 // 横方向を2倍に
  const targetX = (192 + (col * 96)) * scaleX
  const targetY = (row * 80) + 23
  
  // 高さが 60px に拡大されたため、スケール比率を 60/41 に更新
  const scaleY = 60 / 41
  
  return {
    backgroundPosition: `-${targetX}px -${targetY * scaleY}px`,
    backgroundSize: `${976 * scaleX}px ${800 * scaleY}px`,
    opacity: opacity,
    zIndex: zIndex
  }
}

// 遷移情報（現在の時間、前の時間、それぞれの不透明度）
const layerInfo = computed(() => {
  const dt = gameStore.dayTime
  // 45分前倒し: 6:15 から 7:00 の背景への遷移が始まる
  const shifted = (dt + 45) % 1440
  const hour = Math.floor(shifted / 60) % 24
  const minutes = shifted % 60
  
  // 00分 〜 45分 は前後のクロスフェード期間
  const FADE_DURATION = 45
  
  if (minutes < FADE_DURATION) {
    const progress = minutes / FADE_DURATION
    return [
      { hour: hour, opacity: 1, zIndex: 1 }, // 新背景（下）
      { hour: (hour - 1 + 24) % 24, opacity: 1 - progress, zIndex: 2 } // 旧背景（上：消えていく）
    ]
  } else {
    return [
      { hour: hour, opacity: 1, zIndex: 1 }
    ]
  }
})

// 天体の周回スタイル計算ヘルパー（24時間で連続周回）
const getCelestialStyle = (type: 'sun' | 'moon') => {
  const dt = gameStore.dayTime
  const isSun = type === 'sun'

  // 24時間で1周する角度（太陽は6:00起点、月は18:00起点）
  const startTime = isSun ? 360 : 1080
  const angle = ((dt - startTime + 1440) % 1440) / 1440 * Math.PI * 2
  
  // 楕円軌道: cos で水平移動、sin で垂直移動
  const x = 55 - Math.cos(angle) * 40   // 15% 〜 95% の範囲
  const y = 70 - Math.sin(angle) * 42   // 上に弧を描き、下に沈む
  
  return {
    left: `${x}%`,
    top: `${y}px`,
    backgroundPosition: isSun ? '0 -16px' : '-32px -16px',
    opacity: 1,
    zIndex: 5
  }
}

const sunStyle = computed(() => getCelestialStyle('sun'))
const moonStyle = computed(() => getCelestialStyle('moon'))
</script>

<template>
  <div class="time-container">
    <div class="time-view">
      <!-- 空背景 (旧背景のみフェードアウト) -->
      <div 
        v-for="layer in layerInfo" 
        :key="layer.hour"
        class="sky-layer" 
        :style="getSkyStyle(layer.hour, layer.opacity, layer.zIndex)"
      ></div>
      
      <!-- 天体 (太陽と月を別々に定義) -->
      <div class="celestial-layer sun-layer" :style="sunStyle"></div>
      <div class="celestial-layer moon-layer" :style="moonStyle"></div>
      
      <!-- 風景 -->
      <div class="land-layer"></div>
    </div>
  </div>
</template>

<style scoped>
.time-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 60px; /* 24px から 60px に拡大 */
}

.time-view {
  position: relative;
  width: 192px; /* 96px から倍に拡大 */
  height: 60px; /* 24px から 60px に拡大 */
  overflow: hidden;
  background: #000;
  image-rendering: pixelated;
  border-radius: 4px;
}

.sky-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: url('/assets/Denzi100225-4.png');
  background-repeat: no-repeat;
  transition: opacity 0.05s linear;
}

.celestial-layer {
  position: absolute;
  width: 32px;
  height: 32px;
  background-image: url('/assets/Denzi100225-4.png');
  background-repeat: no-repeat;
  scale: 1.4; /* 0.7 から倍の大きさに変更 */
  pointer-events: none;
  z-index: 5;
  transform: translate(-50%, -50%); /* 中心基準で配置 */
}

.land-layer {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 6px; /* 3px から 6px に微調整 */
  background-image: url('/assets/Denzi100225-4.png');
  background-position: -384px -692px;
  background-repeat: no-repeat;
  z-index: 6;
  opacity: 0.3; /* 少し濃く修正 */
}

.time-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: 'Outfit', sans-serif;
  font-size: 1.1rem;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  white-space: nowrap;
  z-index: 7;
  letter-spacing: 0.02em;
}
</style>
