<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useGameStore } from '~/stores/game'
import { useGameInput } from '~/composables/useGameInput'
import TimePlate from './TimePlate.vue'
import type { GameScene } from '~/render/gameScene'

const gameStore = useGameStore()
const canvasRef = ref<HTMLElement | null>(null)

const input = useGameInput(gameStore)
const {
  contextMenuRef,
  contextMenu,
  upgradeCost,
  canUpgradeTargetBase,
  handleContextMenuAction,
} = input

let scene: GameScene | null = null
let disposed = false
const ready = ref(false)
const loadError = ref('')
const customSeed = ref('')
const seedEntry = ref(false)
const ownedBases = computed(() => gameStore.bases.filter(base => base.owner === 'player').length)
const start = (seed?: string) => { input.reset(); gameStore.startGame(seed) }
const resetView = () => scene?.resetCamera()
const title = () => { input.reset(); gameStore.backToTitle() }


onMounted(async () => {
  if (!canvasRef.value) return
  try {
    const { createGameScene } = await import('~/render/gameScene')
    if (disposed || !canvasRef.value) return
    const created = await createGameScene({ canvasEl: canvasRef.value, gameStore, input })
    if (disposed) { created.destroy(); return }
    scene = created
    ready.value = true
  } catch (error) {
    console.error('3D scene initialization failed', error)
    loadError.value = '3D画面を初期化できませんでした。WebGL 2対応のブラウザーで再読み込みしてください。'
  }
})

onUnmounted(() => {
  disposed = true
  scene?.destroy()
  scene = null
})
</script>

<template>
  <div class="game-container" @contextmenu.prevent>
    <div ref="canvasRef" class="canvas-wrapper"></div>
    <div v-if="loadError" class="loading-panel" role="alert">{{ loadError }}</div>
    <div v-else-if="!ready" class="loading-panel" role="status">戦場を準備しています…</div>
    <div v-else-if="gameStore.status === 'title'" class="title-screen">
      <div class="title-content">
        <p class="eyebrow">THE ETERNAL WAR</p>
        <h1>NO LIFE KING</h1>
        <p class="title-subtitle">不死の軍勢を率い、失われた王国を奪還せよ。</p>
        <button class="start-button" @click="start()">征服を始める <span>→</span></button>
        <button class="seed-button" @click="seedEntry = !seedEntry">特定の運命（SEED）で開始</button>
        <form v-if="seedEntry" class="seed-form" @submit.prevent="start(customSeed)">
          <input v-model="customSeed" aria-label="SEED" placeholder="SEEDを入力" maxlength="32" autofocus>
          <button type="submit">開始</button>
        </form>
        <p class="title-help">拠点をドラッグして出兵 · ダブルクリックで一斉出兵 · 長押しで強化</p>
      </div>
    </div>
    <template v-if="ready && gameStore.status !== 'title'">
      <header class="battle-header">
        <div class="battle-brand"><span class="eyebrow">NO LIFE KING</span><span class="seed-readout">SEED {{ gameStore.seed }}</span></div>
        <div class="clock"><TimePlate :day-time="gameStore.dayTime" /><span v-if="gameStore.status === 'paused'" class="paused-label">一時停止</span></div>
        <div class="battle-actions"><span>自軍拠点 <b>{{ ownedBases }}</b> / {{ gameStore.bases.length }}</span><button @click="resetView" aria-label="視点をリセット">視点リセット</button></div>
      </header>
      <footer class="battle-footer">
        <div class="instructions"><span>ドラッグ <b>出兵</b> · ダブルクリック <b>一斉出兵</b> · 長押し <b>強化 / 待機</b></span><span>何もない場所をドラッグでパン · Shift＋右ドラッグで回転 · ホイールでズーム · 2本指の横ドラッグで回転（トラックパッド対応）・ピンチでズーム</span></div>
        <label class="send-control"><span>出兵割合 <strong>{{ Math.round(gameStore.sendRatio * 100) }}%</strong></span><input v-model.number="gameStore.sendRatio" type="range" min="0.1" max="0.9" step="0.1" aria-label="出兵割合"></label>
        <div class="factions"><span class="player-dot">自軍</span><span class="cpu-dot">敵軍</span><span class="neutral-dot">中立</span></div>
      </footer>
    </template>
    <div v-if="gameStore.isGameOver && gameStore.status !== 'title'" class="overlay">
      <div class="modal">
        <h1>{{ gameStore.winner === 'player' ? 'Victory!' : 'Defeat...' }}</h1>
        <div class="modal-actions">
          <button @click="start()">Restart</button>
          <button @click="title" class="secondary">Back to Title</button>
        </div>
      </div>
    </div>

    <!-- Context Menu Overlay -->
    <div
      v-if="contextMenu.visible"
      ref="contextMenuRef"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    >
      <div class="context-menu-content">
        <template v-if="contextMenu.type === 'base'">
          <button
            class="context-menu-item"
            :class="{ disabled: !canUpgradeTargetBase }"
            :disabled="!canUpgradeTargetBase"
            @click="handleContextMenuAction('upgrade')"
          >
            <span>アップグレード ({{ upgradeCost }})</span>
          </button>
        </template>

        <template v-if="contextMenu.type === 'unit'">
          <button class="context-menu-item" @click="handleContextMenuAction('stop')">
            <span>待機</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
  overflow: hidden;
}

.canvas-wrapper {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #000;
  display: flex;
  justify-content: center;
  align-items: center;
}

.canvas-wrapper :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
  display: block;
  touch-action: none;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.modal {
  background: #2c3e50;
  padding: 2rem;
  border-radius: 1rem;
  text-align: center;
  color: white;
  border: 2px solid #3498db;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

button {
  margin-top: 1rem;
  padding: 0.5rem 2rem;
  font-size: 1.2rem;
  background: #3498db;
  border: none;
  color: white;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: transform 0.1s;
}

button.secondary {
  background: #7f8c8d;
}

button:hover {
  transform: scale(1.05);
  background: #2980b9;
}

button.secondary:hover {
  background: #95a5a6;
}

/* Context Menu Styles */
.context-menu {
  position: fixed;
  z-index: 1000;
  background-color: #1a1b1e;
  border: 1px solid #3a3b3e;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  min-width: 200px;
  padding: 6px 0;
  color: #e4e5e7;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  user-select: none;
}

.context-menu-content {
  display: flex;
  flex-direction: column;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 16px;
  background: none;
  border: none;
  color: #e4e5e7;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  margin: 0;
  transition: background-color 0.1s ease;
  border-radius: 0;
}

.context-menu-item:not(.disabled):hover {
  background-color: #313236;
  color: #ffffff;
}

.context-menu-item.disabled {
  color: #555;
  cursor: not-allowed;
}
</style>

<style scoped>
.loading-panel { z-index: 10; max-width: 480px; padding: 32px; text-align: center; color: #ded5c0; }
.title-screen { position: absolute; inset: 0; display: grid; place-items: center; background: linear-gradient(0deg, #070c13ee, #0b111b44 70%), url('/images/title_bg.png') center / cover; z-index: 20; }
.title-content { text-align: center; padding: 28px; }
.eyebrow { font-size: 11px; letter-spacing: .28em; color: #c5af83; }
.title-content h1 { font-family: Georgia, serif; font-weight: 400; letter-spacing: .09em; font-size: clamp(40px, 7vw, 100px); margin: 18px 0; color: #f2e8cf; text-shadow: 0 3px 30px #000; }
.title-subtitle { color: #c6c7c4; font-size: 14px; letter-spacing: .12em; }
.start-button { margin: 38px auto 12px; display: block; border: 1px solid #c2a875; border-radius: 3px; background: #1d242bdd; color: #e9dab9; padding: 18px 55px; font-size: 16px; letter-spacing: .16em; }
.start-button span { margin-left: 25px; }
.seed-button { background: transparent; color: #aeb4b8; font-size: 12px; }
.seed-form { display: flex; justify-content: center; gap: 8px; margin-top: 12px; }
.seed-form input { background: #101923; color: white; border: 1px solid #777; padding: 10px; border-radius: 3px; }
.seed-form button { margin: 0; font-size: 13px; padding: 8px 14px; }
.title-help { margin-top: 60px; color: #b2b8b7; font-size: 12px; }
.battle-header, .battle-footer { position: absolute; left: 0; right: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center; padding: 20px 28px; pointer-events: none; gap: 20px; }
.battle-header { top: 0; background: linear-gradient(#0b151deb, #0b151d00); }
.battle-brand { display: flex; flex-direction: column; gap: 8px; }
.seed-readout { font: 10px monospace; letter-spacing: .12em; color: #96a5a7; }
.clock { position: absolute; left: 50%; top: 4px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; color: #c6cfcd; font-size: 11px; }
.paused-label { margin-top: 2px; }
.battle-actions { display: flex; align-items: center; gap: 18px; font-size: 11px; color: #aebbb9; }
.battle-actions b { color: #d0b5f4; }
.battle-actions button { pointer-events: auto; margin: 0; padding: 9px 12px; font-size: 11px; background: #14262ccf; border: 1px solid #526469; border-radius: 3px; }
.battle-footer { bottom: 0; background: linear-gradient(#0b151d00, #0b151de8); align-items: flex-end; padding-top: 40px; }
.instructions { display: flex; flex-direction: column; gap: 8px; font-size: 10px; color: #98abae; }
.instructions b { color: #d0d8d3; font-weight: 400; }
.send-control { pointer-events: auto; width: 220px; padding: 12px 18px; background: #0e1d25dc; border: 1px solid #58636a; border-radius: 4px; display: flex; flex-direction: column; gap: 12px; font-size: 11px; flex-shrink: 0; }
.send-control span { display: flex; justify-content: space-between; color: #b8c4c5; }
.send-control strong { color: #d4b1ff; }
.send-control input { width: 100%; margin: 0; accent-color: #b38cde; cursor: pointer; }
.factions { display: flex; gap: 16px; font-size: 10px; color: #b6c3c2; }
.factions span::before { content: ''; display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: #d5c9a0; }
.factions .player-dot::before { background: #a879ef; }
.factions .cpu-dot::before { background: #ed6556; }
.canvas-wrapper :deep(.world-labels) { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.canvas-wrapper :deep(.world-labels[hidden]) { display: none; }
/* Transparent hit targets retain the original pointer interactions. */
.canvas-wrapper :deep(.world-label) { position: absolute; left: 0; top: 0; margin: 0; padding: 5px 7px; background: none; border: 0; border-radius: 0; box-shadow: none; color: var(--faction); font: 600 14px system-ui, sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; cursor: pointer; pointer-events: auto; touch-action: none; user-select: none; text-shadow: 0 1px 3px #000, 0 0 5px #000, 1px 0 2px #000, -1px 0 2px #000; }
.canvas-wrapper :deep(.world-label[hidden]) { display: none; }
.canvas-wrapper :deep(.unit-label) { font-size: 12px; }
.canvas-wrapper :deep(.world-label:hover), .canvas-wrapper :deep(.world-label.is-target) { color: #fff4ca; text-shadow: 0 0 5px #eecf7d, 0 1px 3px #000; }
.canvas-wrapper :deep(.world-label.is-source) { color: #e3caff; }
.canvas-wrapper :deep(.world-floating-text) { position: absolute; font: bold 15px system-ui; animation: float-away 1.4s forwards; text-shadow: 0 2px 5px #000; }
@keyframes float-away { to { opacity: 0; translate: 0 -45px; } }
@media (max-width: 900px) { .instructions { max-width: 240px; font-size: 9px; } .factions { display: none; } .battle-header, .battle-footer { padding: 14px; } .battle-actions > span { display: none; } .send-control { width: 170px; } }
@media (max-width: 550px) { .battle-brand .eyebrow { letter-spacing: .08em; } .clock { top: 8px; } .battle-actions button { padding: 7px; font-size: 9px; } .battle-brand .eyebrow { font-size: 8px; } .instructions { max-width: 145px; line-height: 1.6; } .send-control { width: 130px; } .title-help { line-height: 2; } }
</style>
