<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { ref } from 'vue'

const gameStore = useGameStore()
const seed = ref('')
const isModalOpen = ref(false)

const handleStart = () => {
    gameStore.startGame('') // Empty seed for random
}

const handleSeedStart = () => {
    gameStore.startGame(seed.value)
    isModalOpen.value = false
}

const openModal = () => {
    isModalOpen.value = true
}

const closeModal = () => {
    isModalOpen.value = false
}
</script>

<template>
  <div class="title-screen">
    <div class="content">
      <div class="logo-container">
        <h1 class="title">NO LIFE KING</h1>
        <div class="subtitle">Awaken the Undead. Claim the Realm.</div>
      </div>
      
      <div class="actions">
        <button class="start-btn" @click="handleStart">
          <span class="btn-text">AWAKEN</span>
          <div class="btn-glow"></div>
        </button>
        
        <button class="seed-open-btn" @click="openModal">
          START WITH SEED
        </button>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <div class="icon">☠️</div>
          <div class="text">COMMAND THE HORDE</div>
        </div>
        <div class="info-item">
          <div class="icon">🏰</div>
          <div class="text">CONQUER TERRITORIES</div>
        </div>
        <div class="info-item">
          <div class="icon">👑</div>
          <div class="text">RULE AS THE LICH KING</div>
        </div>
      </div>
    </div>

    <!-- Seed Input Modal -->
    <Transition name="fade">
      <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
        <div class="modal-content">
          <button class="close-btn" @click="closeModal">&times;</button>
          
          <h2 class="modal-title">CONFIGURE WORLD</h2>
          
          <div class="seed-input-container">
            <label class="seed-label">WORLD SEED</label>
            <input 
              v-model="seed" 
              type="text" 
              maxlength="6"
              placeholder="6-DIGIT NUMBER" 
              class="seed-input"
              oninput="value = value.replace(/[^0-9]/g, '')"
              @keyup.enter="handleSeedStart"
            />
            <div class="seed-hint">Leave empty for a random world</div>
          </div>

          <button class="modal-start-btn" @click="handleSeedStart">
            START CAMPAIGN
          </button>
        </div>
      </div>
    </Transition>
    
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
  background: linear-gradient(135deg, #a55eea 0%, #eb3b5a 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 20px rgba(165, 94, 234, 0.4));
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
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  align-items: center;
  animation: fadeInUp 1s ease-out 0.3s both;
}

.start-btn {
  position: relative;
  padding: 1.5rem 4rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
  background: transparent;
  border: 1px solid rgba(165, 94, 234, 0.5);
  cursor: pointer;
  overflow: hidden;
  transition: all 0.3s ease;
  letter-spacing: 0.2em;
}

.start-btn:hover {
  background: rgba(165, 94, 234, 0.1);
  border-color: #a55eea;
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(165, 94, 234, 0.2);
}

.seed-open-btn {
  background: transparent;
  border: none;
  color: #555;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  cursor: pointer;
  transition: color 0.3s;
  text-transform: uppercase;
}

.seed-open-btn:hover {
  color: #a55eea;
  text-decoration: underline;
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

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  position: relative;
  background: #141418;
  border: 1px solid rgba(165, 94, 234, 0.3);
  padding: 3rem;
  width: 450px;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  align-items: center;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(165, 94, 234, 0.1);
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1.5rem;
  background: transparent;
  border: none;
  font-size: 2rem;
  color: #555;
  cursor: pointer;
  transition: color 0.3s;
}

.close-btn:hover {
  color: #eb3b5a;
}

.modal-title {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  color: #a55eea;
  margin: 0;
}

.seed-input-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.seed-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: #888;
  letter-spacing: 0.1em;
}

.seed-input {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 1rem;
  color: white;
  font-family: monospace;
  font-size: 1.5rem;
  letter-spacing: 0.3em;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.3s;
}

.seed-input:focus {
  outline: none;
  border-color: #a55eea;
}

.seed-hint {
  font-size: 0.7rem;
  color: #444;
  text-align: center;
}

.modal-start-btn {
  width: 100%;
  padding: 1rem;
  background: #a55eea;
  border: none;
  color: white;
  font-weight: 700;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: transform 0.2s, background 0.3s;
}

.modal-start-btn:hover {
  background: #9b51e0;
  transform: translateY(-2px);
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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
    linear-gradient(rgba(165, 94, 234, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(165, 94, 234, 0.05) 1px, transparent 1px);
  background-size: 80px 80px;
  transform: perspective(800px) rotateX(60deg);
  animation: gridMove 30s linear infinite;
}

.glow-orb {
  position: absolute;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.15;
}

.p-orb {
  background: #a55eea;
  top: 10%;
  left: 10%;
  animation: float 10s ease-in-out infinite alternate;
}

.c-orb {
  background: #eb3b5a;
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
