<template>
  <div class="title-screen">
    <div class="background-image-container">
      <img src="/images/title_bg.png" class="bg-image" alt="Cursed Kingdom Background" />
      <div class="vignette"></div>
      <div class="blood-overlay"></div>
    </div>

    <div class="content">
      <div class="logo-container">
        <h1 class="title">NO LIFE KING</h1>
        <div class="subtitle">Awaken the Undead. Claim the Realm.</div>
      </div>
      
      <div class="actions">
        <button class="start-btn" @click="handleStart">
          <span class="btn-text">覚醒する</span>
          <div class="btn-glow"></div>
        </button>
        
        <button class="seed-open-btn" @click="openModal">
          特定の運命（SEED）で開始
        </button>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <div class="icon">💀</div>
          <div class="text">不死の軍勢を率いよ</div>
        </div>
        <div class="info-item">
          <div class="icon">🏰</div>
          <div class="text">かつての領土を奪還せよ</div>
        </div>
        <div class="info-item">
          <div class="icon">🩸</div>
          <div class="text">永遠の王として君臨せよ</div>
        </div>
      </div>
    </div>

    <!-- Seed Input Modal -->
    <Transition name="fade">
      <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
        <div class="modal-content">
          <button class="close-btn" @click="closeModal">&times;</button>
          
          <h2 class="modal-title">運命の構成</h2>
          
          <div class="seed-input-container">
            <label class="seed-label">ワールドシード</label>
            <input 
              v-model="seed" 
              type="text" 
              maxlength="6"
              placeholder="6桁の数字" 
              class="seed-input"
              oninput="value = value.replace(/[^0-9]/g, '')"
              @keyup.enter="handleSeedStart"
            />
            <div class="seed-hint">空欄でランダムな世界を生成</div>
          </div>

          <button class="modal-start-btn" @click="handleSeedStart">
            遠征を開始する
          </button>
        </div>
      </div>
    </Transition>
    
    <div class="background-decor">
      <div class="embers-container">
        <div v-for="n in 20" :key="n" class="ember" :style="getEmberStyle()"></div>
      </div>
    </div>
  </div>
</template>

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

const getEmberStyle = () => {
  const size = Math.random() * 4 + 2
  const left = Math.random() * 100
  const duration = Math.random() * 5 + 5
  const delay = Math.random() * 5
  return {
    width: `${size}px`,
    height: `${size}px`,
    left: `${left}%`,
    animationDuration: `${duration}s`,
    animationDelay: `${delay}s`
  }
}
</script>

<style scoped>
.title-screen {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #050505;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 200;
  overflow: hidden;
  font-family: 'Outfit', sans-serif;
}

.background-image-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.bg-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.6) contrast(1.2);
  transform: scale(1.05);
  animation: bgPulse 20s ease-in-out infinite alternate;
}

.vignette {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle, transparent 20%, rgba(0, 0, 0, 0.8) 100%);
}

.blood-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(139, 0, 0, 0.1);
  mix-blend-mode: multiply;
  pointer-events: none;
}

.content {
  position: relative;
  z-index: 10;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 5rem;
  align-items: center;
}

.logo-container {
  animation: fadeInDown 1.5s ease-out;
}

.title {
  font-size: 7rem;
  font-weight: 900;
  margin: 0;
  letter-spacing: 0.15em;
  background: linear-gradient(180deg, #f8f8f8 0%, #a0a0a0 50%, #404040 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 15px rgba(139, 0, 0, 0.6)) drop-shadow(0 0 30px rgba(0, 0, 0, 0.8));
  text-transform: uppercase;
  position: relative;
}

.title::after {
  content: "NO LIFE KING";
  position: absolute;
  left: 0;
  top: 0;
  z-index: -1;
  -webkit-text-fill-color: initial;
  color: transparent;
  text-shadow: 0 0 10px #eb3b5a;
  opacity: 0.4;
  animation: titleGlow 4s infinite alternate;
}

.subtitle {
  font-size: 1.5rem;
  color: #c0c0c0;
  letter-spacing: 0.8em;
  margin-top: 1.5rem;
  text-transform: uppercase;
  font-weight: 300;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  align-items: center;
  animation: fadeInUp 1.2s ease-out 0.5s both;
}

.start-btn {
  position: relative;
  padding: 1.2rem 5rem;
  font-size: 1.8rem;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(90deg, #4b0000 0%, #8b0000 50%, #4b0000 100%);
  background-size: 200% auto;
  border: 1px solid #eb3b5a;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.4s ease;
  letter-spacing: 0.3em;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.4), inset 0 0 10px rgba(235, 59, 90, 0.3);
  text-transform: uppercase;
}

.start-btn:hover {
  background-position: right center;
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 10px 25px rgba(235, 59, 90, 0.4);
  border-color: #ff4d6d;
}

.btn-text {
  position: relative;
  z-index: 2;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

.seed-open-btn {
  background: transparent;
  border: none;
  color: #999;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  cursor: pointer;
  transition: all 0.3s;
  text-transform: uppercase;
  border-bottom: 1px solid transparent;
}

.seed-open-btn:hover {
  color: #eb3b5a;
  border-bottom: 1px solid #eb3b5a;
}

.btn-glow {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(235, 59, 90, 0.3), transparent);
  transition: 0.6s;
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
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  position: relative;
  background: #0f0f0f;
  border: 1px solid rgba(235, 59, 90, 0.4);
  padding: 4rem;
  width: 480px;
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  align-items: center;
  box-shadow: 0 0 50px rgba(0, 0, 0, 1), 0 0 30px rgba(139, 0, 0, 0.2);
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1.5rem;
  background: transparent;
  border: none;
  font-size: 2.5rem;
  color: #444;
  cursor: pointer;
  transition: color 0.3s;
}

.close-btn:hover {
  color: #eb3b5a;
}

.modal-title {
  font-size: 1.8rem;
  font-weight: 800;
  letter-spacing: 0.3em;
  color: #eb3b5a;
  margin: 0;
  text-transform: uppercase;
}

.seed-input-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.seed-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #777;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.seed-input {
  background: rgba(20, 20, 20, 0.8);
  border: 1px solid #333;
  padding: 1.2rem;
  color: #fff;
  font-family: 'Courier New', Courier, monospace;
  font-size: 1.8rem;
  letter-spacing: 0.5em;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
  transition: all 0.3s;
}

.seed-input:focus {
  outline: none;
  border-color: #eb3b5a;
  box-shadow: 0 0 15px rgba(235, 59, 90, 0.3);
}

.seed-hint {
  font-size: 0.8rem;
  color: #555;
  text-align: center;
}

.modal-start-btn {
  width: 100%;
  padding: 1.2rem;
  background: #8b0000;
  border: 1px solid #eb3b5a;
  color: white;
  font-weight: 800;
  font-size: 1.1rem;
  letter-spacing: 0.2em;
  cursor: pointer;
  transition: all 0.3s;
  text-transform: uppercase;
}

.modal-start-btn:hover {
  background: #eb3b5a;
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(235, 59, 90, 0.4);
}

/* Info Grid */
.info-grid {
  display: flex;
  gap: 4rem;
  animation: fadeIn 2s ease-out 1s both;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  align-items: center;
  color: #666;
  transition: all 0.4s;
}

.info-item:hover {
  color: #eb3b5a;
  transform: translateY(-5px);
}

.icon {
  font-size: 2rem;
  filter: grayscale(1);
  transition: filter 0.4s;
}

.info-item:hover .icon {
  filter: grayscale(0) drop-shadow(0 0 8px rgba(235, 59, 90, 0.6));
}

.text {
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  white-space: nowrap;
}

/* Embers */
.embers-container {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.ember {
  position: absolute;
  bottom: -20px;
  background: #eb3b5a;
  border-radius: 50%;
  opacity: 0.6;
  filter: blur(1px);
  animation: risingEmber linear infinite;
  box-shadow: 0 0 5px #eb3b5a;
}

@keyframes risingEmber {
  0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
  10% { opacity: 0.8; }
  100% { transform: translateY(-100vh) translateX(50px) scale(0.5); opacity: 0; }
}

@keyframes bgPulse {
  0% { transform: scale(1.0); }
  100% { transform: scale(1.1); }
}

@keyframes titleGlow {
  from { opacity: 0.2; transform: scale(1); }
  to { opacity: 0.5; transform: scale(1.02); }
}

@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-50px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(50px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (max-width: 768px) {
  .title { font-size: 3.5rem; }
  .subtitle { font-size: 1rem; letter-spacing: 0.4em; }
  .info-grid { flex-direction: column; gap: 2rem; }
  .modal-content { width: 90%; padding: 2rem; }
}
</style>
