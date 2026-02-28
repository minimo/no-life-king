<script setup lang="ts">
import { useGameStore } from '~/stores/game'

const gameStore = useGameStore()

const handleStart = () => {
    gameStore.startGame()
}
</script>

<template>
  <div class="title-screen">
    <div class="content">
      <div class="logo-container">
        <h1 class="title">NO LIFE KING</h1>
        <div class="subtitle">Conquer the Grid. Rule the Void.</div>
      </div>
      
      <div class="actions">
        <button class="start-btn" @click="handleStart">
          <span class="btn-text">INITIALIZE SYSTEM</span>
          <div class="btn-glow"></div>
        </button>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <div class="icon">🖱️</div>
          <div class="text">DRAG TO DEPLOY</div>
        </div>
        <div class="info-item">
          <div class="icon">⚡</div>
          <div class="text">CAPTURE CORES</div>
        </div>
        <div class="info-item">
          <div class="icon">🏆</div>
          <div class="text">DOMINATE ALL</div>
        </div>
      </div>
    </div>
    
    <div class="background-decor">
      <div class="grid-lines"></div>
      <div class="glow-orb p-orb"></div>
      <div class="glow-orb c-orb"></div>
    </div>
  </div>
</template>

<style scoped>
.title-screen {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #0a0a0c;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 200;
  overflow: hidden;
  font-family: 'Outfit', sans-serif;
}

.content {
  position: relative;
  z-index: 10;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4rem;
  align-items: center;
}

.logo-container {
  animation: fadeInDown 1s ease-out;
}

.title {
  font-size: 6rem;
  font-weight: 900;
  margin: 0;
  letter-spacing: 0.2em;
  background: linear-gradient(135deg, #3498db 0%, #2ecc71 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 20px rgba(52, 152, 219, 0.4));
  text-transform: uppercase;
}

.subtitle {
  font-size: 1.2rem;
  color: #888;
  letter-spacing: 0.5em;
  margin-top: 1rem;
  text-transform: uppercase;
}

.actions {
  animation: fadeInUp 1s ease-out 0.3s both;
}

.start-btn {
  position: relative;
  padding: 1.5rem 4rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
  background: transparent;
  border: 1px solid rgba(52, 152, 219, 0.5);
  cursor: pointer;
  overflow: hidden;
  transition: all 0.3s ease;
  letter-spacing: 0.2em;
}

.start-btn:hover {
  background: rgba(52, 152, 219, 0.1);
  border-color: #3498db;
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(52, 152, 219, 0.2);
}

.btn-glow {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  transition: 0.5s;
}

.start-btn:hover .btn-glow {
  left: 100%;
}

.info-grid {
  display: flex;
  gap: 3rem;
  animation: fadeIn 1s ease-out 0.6s both;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
  color: #555;
  transition: color 0.3s;
}

.info-item:hover {
  color: #ccc;
}

.icon {
  font-size: 1.5rem;
}

.text {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.1em;
}

/* Background Decorations */
.background-decor {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.grid-lines {
  position: absolute;
  width: 200%;
  height: 200%;
  top: -50%;
  left: -50%;
  background-image: 
    linear-gradient(rgba(52, 152, 219, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(52, 152, 219, 0.05) 1px, transparent 1px);
  background-size: 50px 50px;
  transform: perspective(500px) rotateX(60deg);
  animation: gridMove 20s linear infinite;
}

.glow-orb {
  position: absolute;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.2;
}

.p-orb {
  background: #3498db;
  top: 10%;
  left: 10%;
  animation: float 10s ease-in-out infinite alternate;
}

.c-orb {
  background: #e74c3c;
  bottom: 10%;
  right: 10%;
  animation: float 12s ease-in-out infinite alternate-reverse;
}

@keyframes gridMove {
  from { background-position: 0 0; }
  to { background-position: 0 50px; }
}

@keyframes float {
  from { transform: translate(0, 0); }
  to { transform: translate(50px, 30px); }
}

@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-30px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (max-width: 768px) {
  .title { font-size: 3rem; }
  .info-grid { flex-direction: column; gap: 1.5rem; }
}
</style>
