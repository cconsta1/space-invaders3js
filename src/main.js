import Game from './game.js'
import Audio from './audio.js'

const startBtn = document.getElementById('start')
const scoreEl = document.getElementById('score')
const livesEl = document.getElementById('lives')
const gameoverEl = document.getElementById('gameover')
const finalScoreEl = document.getElementById('final-score')
const restartBtn = document.getElementById('restart')

let currentScore = 0

startBtn.addEventListener('click', ()=>{
  console.log('Start button pressed')
  startBtn.classList.add('hidden')
  // Ensure audio context is resumed (user gesture) and play click
  Audio.resume().then(()=>{
    Audio.play('uiClick', { volume: 0.9 })
  })
  Game.start()
})

restartBtn.addEventListener('click', ()=>{
  console.log('Restart button clicked')
  gameoverEl.classList.add('hidden')
  startBtn.textContent = 'Start'
  startBtn.classList.add('hidden')
  Audio.resume().then(()=>Audio.play('uiClick', { volume: 0.9 }))
  Game.reset()
  Game.start()
})

Game.on('score', s => {
  scoreEl.textContent = s
  currentScore = s
})
Game.on('lives', l => livesEl.textContent = l)
Game.on('gameover', () => {
  finalScoreEl.textContent = currentScore
  gameoverEl.classList.remove('hidden')
  Audio.play('life_lost', { volume: 0.8 })
})
Game.on('levelCleared', (lvl) => {
  startBtn.textContent = `Start Level ${lvl + 1}`
  startBtn.classList.remove('hidden')
  Audio.play('uiSwitch', { volume: 0.9 })
})
Game.on('state', (state) => {
  console.log('Game state:', state)
  if(state === 'paused') {
    startBtn.textContent = 'Continue'
    startBtn.classList.remove('hidden')
  } else if(state === 'playing') {
    startBtn.classList.add('hidden')
  }
})

// Settings UI
const settingsBtn = document.getElementById('settings-btn')
const settingsPanel = document.getElementById('settings-panel')
const themeToggleBtn = document.getElementById('theme-toggle-btn')
const bloomToggleBtn = document.getElementById('bloom-toggle-btn')

let themeMode = 'night' // auto, day, night

if(settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden')
    Audio.play('uiClick', { volume: 0.5 })
  })

  // Hide bloom toggle (bloom removed)
  if(bloomToggleBtn) bloomToggleBtn.style.display = 'none'

  themeToggleBtn.addEventListener('click', () => {
    if(themeMode === 'night') {
        themeMode = 'day'
        Game.setTheme('day')
    } else {
        themeMode = 'night'
        Game.setTheme('night')
    }
    themeToggleBtn.textContent = `THEME: ${themeMode.toUpperCase()}`
    Audio.play('uiSwitch', { volume: 0.5 })
  })
}

window.addEventListener('resize', ()=>Game.resize())

Game.init({canvas:document.getElementById('c')})
// Start loading audio assets in background (non-blocking)
Audio.init()
Audio.loadAll().catch(()=>{})

// Expose for debugging
window.__Game = Game
