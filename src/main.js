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
  // If the Start button was repurposed as 'Play Again', reset first
  if(startBtn.textContent === 'Play Again'){
    // Hide any overlay and reset the game state before starting
    const gameover = document.getElementById('gameover')
    if(gameover) gameover.classList.add('hidden')
    console.log('Start button pressed: Play Again -> resetting')
    Game.reset()
  }
  startBtn.classList.add('hidden')
  console.log('Start button pressed: starting')
  // Ensure audio context is resumed (user gesture) and play click
  Audio.resume().then(()=>{
    Audio.play('uiClick', { volume: 0.9 })
  })
  Game.start()
})

restartBtn.addEventListener('click', ()=>{
  console.log('Restart button clicked')
  gameoverEl.classList.add('hidden')
  // Also hide the top start button and set it back to 'Start'
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
  // Also update the Start button to act as a fallback Restart
  startBtn.textContent = 'Play Again'
  startBtn.classList.remove('hidden')
  Audio.play('life_lost', { volume: 0.8 })
})
Game.on('pause', () => {
  startBtn.textContent = 'Continue'
  startBtn.classList.remove('hidden')
  Audio.play('uiSwitch', { volume: 0.6 })
})

window.addEventListener('resize', ()=>Game.resize())

Game.init({canvas:document.getElementById('c')})
// Start loading audio assets in background (non-blocking)
Audio.init()
Audio.loadAll().catch(()=>{})

// Expose for debugging
window.__Game = Game
