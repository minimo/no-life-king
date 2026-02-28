<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import GameCanvas from '~/components/GameCanvas.vue'
import TitleScreen from '~/components/TitleScreen.vue'

const gameStore = useGameStore()
</script>

<template>
  <div class="app-container">
    <TitleScreen v-if="gameStore.status === 'title'" />
    
    <template v-else>
      <header class="game-header">
        <h1>No-Life-King</h1>
      </header>

      <main class="game-view">
        <GameCanvas />
      </main>

      <footer class="game-footer">
        <div class="controls">
          <div class="control-group">
            <label>Send Ratio: {{ Math.round(gameStore.sendRatio * 100) }}%</label>
            <input 
              type="range" 
              min="0.1" 
              max="0.9" 
              step="0.1" 
              v-model.number="gameStore.sendRatio"
            />
          </div>
          <div class="info">
            <span>Click & Drag to send units</span>
            <span class="divider">|</span>
            <span>Core bases define victory</span>
          </div>
        </div>
      </footer>
    </template>
  </div>
</template>

<style>
/* Global reset/base styles */
body {
  margin: 0;
  padding: 0;
  background: #121212;
  color: #e0e0e0;
  font-family: 'Outfit', 'Inter', system-ui, sans-serif;
  overflow: hidden;
}

.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}

.game-header {
  padding: 1rem;
  text-align: center;
  background: linear-gradient(180deg, #1a1a1a 0%, #121212 100%);
  border-bottom: 1px solid #333;
}

.game-header h1 {
  margin: 0;
  font-size: 1.5rem;
  letter-spacing: 0.1em;
  color: #3498db;
  text-transform: uppercase;
}

.game-view {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.game-footer {
  padding: 1rem;
  background: #1a1a1a;
  border-top: 1px solid #333;
}

.controls {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
}

.control-group label {
  min-width: 150px;
  font-weight: bold;
}

input[type="range"] {
  flex: 1;
  cursor: pointer;
}

.info {
  font-size: 0.9rem;
  color: #888;
  display: flex;
  gap: 1rem;
}

.divider {
  color: #444;
}
</style>
