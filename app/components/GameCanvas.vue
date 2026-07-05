<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useGameStore } from '~/stores/game'
import { useGameInput } from '~/composables/useGameInput'
import { createGameScene, type GameScene } from '~/render/gameScene'

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

onMounted(async () => {
  if (!canvasRef.value) return
  scene = await createGameScene({
    canvasEl: canvasRef.value,
    gameStore,
    input,
  })
})

onUnmounted(() => {
  scene?.destroy()
  scene = null
})
</script>

<template>
  <div class="game-container" @contextmenu.prevent>
    <div ref="canvasRef" class="canvas-wrapper"></div>
    <div v-if="gameStore.isGameOver" class="overlay">
      <div class="modal">
        <h1>{{ gameStore.winner === 'player' ? 'Victory!' : 'Defeat...' }}</h1>
        <div class="modal-actions">
          <button @click="gameStore.startGame()">Restart</button>
          <button @click="gameStore.backToTitle" class="secondary">Back to Title</button>
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
  width: min(100vw, calc(100vh * 16 / 9));
  height: min(100vh, calc(100vw * 9 / 16));
  background: #000;
  display: flex;
  justify-content: center;
  align-items: center;
}

.canvas-wrapper canvas {
  width: 100% !important;
  height: 100% !important;
  display: block;
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
