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
  const hour = Math.floor(dt / 60) % 24
  const minutes = dt % 60
  
  // 00分 〜 60分 は前後のクロスフェード期間
  const FADE_DURATION = 60
  
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

// 天体の周回スタイル計算ヘルパー
const getCelestialStyle = (type: 'sun' | 'moon') => {
  const dt = gameStore.dayTime
  const isSun = type === 'sun'
  
  // 出没時間の判定
  const isActive = isSun 
    ? (dt >= 360 && dt < 1080)    // 太陽: 6:00 〜 18:00
    : (dt >= 1080 || dt < 360)   // 月: 18:00 〜 翌6:00
    
  if (!isActive) return { opacity: 0, display: 'none' }

  // 進行度 (0.0 〜 1.0)
  let progress = 0
  if (isSun) {
    progress = (dt - 360) / 720
  } else {
    progress = dt >= 1080 ? (dt - 1080) / 720 : (dt + 360) / 720
  }
  
  // 10% 〜 90% の範囲で移動（南中が中央50%に来るように調整）
  const x = 10 + progress * 80
  const y = 61 - Math.sin(progress * Math.PI) * 42 
  
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
  scale: 0.7; /* 0.35 から倍の大きさに変更 */
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
