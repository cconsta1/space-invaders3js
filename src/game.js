import * as THREE from 'three'
import Audio from './audio.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

const Game = (()=>{
  let canvas, renderer, scene, camera, clock
  let composer, bloomPass
  let playerShip, playerBullets = [], enemyBullets = [], invaders = []
  let particles = []
  let invaderDirection = 1 // 1 = right, -1 = left
  let invaderSpeed = 0.5
  let invaderDescendTimer = 0
  let lastPlayerShot = 0
  let lastEnemyShot = 0
  let score = 0, lives = 3, level = 1
  let rafId
  let gameState = 'idle' // idle, playing, paused, levelCleared, gameOver
  let bloomEnabled = true
  let currentTheme = 'night'
  const events = new Map()
  const keys = { ArrowLeft: false, ArrowRight: false, Space: false }

  // Config
  const sizes = { width: window.innerWidth, height: window.innerHeight }
  const play = { x: 12, y: 8, zNear: 4, zFar: -16 }
  
  // Refined Pop-Art Palette - Flat Colors
  const colors = {
    player: '#4FC3F7',      // Teal/Cyan
    playerBullet: '#FFD54F', // Butter Yellow
    invader: '#FF8A65',     // Warm Coral
    enemyBullet: '#E57373', // Salmon Red
    wall: '#37474F',        // Deep Blue-Grey
    bg: '#263238',          // Dark Charcoal
    grid: '#455A64',        // Slate
    accent: '#4FC3F7',      // Teal accent
    mint: '#AED581',        // Muted Mint
    cream: '#FFF9C4'        // Soft Cream
  }

  const palettes = {
    night: { 
      ...colors, 
      amb: '#455A64', 
      dir: '#B0BEC5', 
      floor: '#263238', 
      grid1: '#455A64', 
      grid2: '#37474F',
      bg: '#263238',
      player: '#4FC3F7', 
      invader: '#FF8A65'
    },
    day: {
      player: '#0097A7',    // Deep Teal
      invader: '#FF7043',   // Vivid Coral
      playerBullet: '#FBC02D', // Golden Yellow
      enemyBullet: '#E53935', // Red
      wall: '#78909C',
      bg: '#FAFAF8',        // Warm Paper White
      grid1: '#CFD8DC',
      grid2: '#ECEFF1',
      accent: '#00ACC1',
      amb: '#FFFFFF',
      dir: '#FFFFFF',
      floor: '#FAFAF8',
      mint: '#66BB6A',
      cream: '#FFF59D'
    }
  }

  // Particle Shader - Shockwave Ring
  const particleVertex = `
    attribute float size;
    attribute float life;
    varying float vLife;
    void main() {
      vLife = life;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (500.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `
  const particleFragment = `
    uniform vec3 color;
    varying float vLife;
    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = length(coord);
      
      if(dist > 0.5) discard;
      
      // Ring effect
      float ring = smoothstep(0.5, 0.4, dist) - smoothstep(0.3, 0.2, dist);
      
      // Core glow
      float core = 1.0 - smoothstep(0.0, 0.2, dist);
      
      float alpha = (ring + core * 0.5) * vLife;
      
      gl_FragColor = vec4(color, alpha);
    }
  `

  const emit = (k,v)=> (events.get(k)||[]).forEach(fn=>fn(v))
  const on = (k,fn)=> { events.set(k, [...(events.get(k)||[]), fn]) }

  const init = ({canvas:cnv})=>{
    canvas = cnv
    // Initialize audio context and (optionally) begin background loading
    Audio.init()
    // Pointer/touch controls: map pointer X to player ship target
    const onPointer = (e) => {
      // support touch/pointer
      const x = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX) || 0
      const pct = x / window.innerWidth
      // Map 0..1 to -play.x .. play.x
      const target = (pct * (play.x * 2)) - play.x
      if(playerShip) playerShip.userData.targetX = THREE.MathUtils.clamp(target, -play.x+1.5, play.x-1.5)
    }
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('touchmove', onPointer, { passive: true })
    
    // Renderer
    renderer = new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance'})
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ReinhardToneMapping

    scene = new THREE.Scene()
    // No fog for clean, flat look
    scene.fog = null
    
    // Lighting - Simple and flat
    const amb = new THREE.AmbientLight('#FFFFFF', 1.8)
    scene.add(amb)
    
    // Single soft key light for subtle depth
    const dir = new THREE.DirectionalLight('#FFFFFF', 0.4)
    dir.position.set(3, 8, 4)
    scene.add(dir)

    setTheme(currentTheme) // Apply initial theme

    camera = new THREE.PerspectiveCamera(50, sizes.width/sizes.height, 0.1, 100)
    camera.position.set(0, 8, 22)
    camera.lookAt(0, 0, -4)
    camera.userData = { shake: 0 }

    clock = new THREE.Clock()

    // Post Processing - Clean and Flat
    const renderScene = new RenderPass(scene, camera)
    
    // Bloom removed for flat, clean look
    bloomPass = null
    bloomEnabled = false

    const filmPass = new FilmPass(0.08, false) // Very subtle grain

    const outputPass = new OutputPass()

    composer = new EffectComposer(renderer)
    composer.addPass(renderScene)
    composer.addPass(filmPass)
    composer.addPass(outputPass)
    
    // Grid floor - Subtle retro grid
    const grid = new THREE.GridHelper(80, 40, colors.grid, colors.bg)
    grid.position.y = -8
    grid.position.z = -10
    grid.material.opacity = 0.15
    grid.material.transparent = true
    scene.add(grid)

    makePlayerShip()
    makeInvaders()

    // Input - Keyboard only
    window.addEventListener('keydown', e => {
      if(e.code === 'ArrowLeft') keys.ArrowLeft = true
      if(e.code === 'ArrowRight') keys.ArrowRight = true
      if(e.code === 'Space') {
        keys.Space = true
        // Allow spacebar to start/continue game when not playing
        if(gameState !== 'playing' && gameState !== 'gameOver') {
          start()
        }
      }
    })
    window.addEventListener('keyup', e => {
      if(e.code === 'ArrowLeft') keys.ArrowLeft = false
      if(e.code === 'ArrowRight') keys.ArrowRight = false
      if(e.code === 'Space') keys.Space = false
    })

    tick()
  }

  const makePlayerShip = ()=>{    // Multi-geometry retro ship design
    playerShip = new THREE.Group()
    
    // Main body - sleek triangle
    const bodyGeo = new THREE.ConeGeometry(0.7, 1.2, 3)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: colors.player,
      roughness: 0.9,
      metalness: 0.0
    })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.rotation.z = Math.PI
    playerShip.add(body)
    
    // Cockpit - small sphere
    const cockpitGeo = new THREE.SphereGeometry(0.2, 8, 8)
    const cockpitMat = new THREE.MeshStandardMaterial({
      color: colors.cream,
      roughness: 0.8,
      metalness: 0.0
    })
    const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat)
    cockpit.position.y = 0.3
    playerShip.add(cockpit)
    
    // Left wing
    const wingGeo = new THREE.BoxGeometry(0.4, 0.1, 0.6)
    const wingMat = new THREE.MeshStandardMaterial({
      color: colors.player,
      roughness: 0.9,
      metalness: 0.0
    })
    const leftWing = new THREE.Mesh(wingGeo, wingMat)
    leftWing.position.set(-0.6, -0.2, 0)
    playerShip.add(leftWing)
    
    // Right wing
    const rightWing = new THREE.Mesh(wingGeo, wingMat)
    rightWing.position.set(0.6, -0.2, 0)
    playerShip.add(rightWing)
    
    // Exhaust (minimal)
    const exhaustGeo = new THREE.SphereGeometry(0.15, 8, 8)
    const exhaustMat = new THREE.MeshStandardMaterial({
      color: colors.playerBullet,
      roughness: 0.7,
      metalness: 0.0,
      transparent: true,
      opacity: 0.4
    })
    const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat)
    exhaust.position.y = -0.6
    exhaust.scale.set(1, 0.5, 1)
    playerShip.add(exhaust)
    
    playerShip.position.set(0, -6, 0)
    playerShip.userData = { targetX: 0 }
    scene.add(playerShip)
  }

  const createPlayerBullet = () => {
    const geo = new THREE.BoxGeometry(0.2, 0.6, 0.2)
    const mat = new THREE.MeshStandardMaterial({
      color: colors.playerBullet,
      roughness: 0.8,
      metalness: 0.0
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(playerShip.position)
    mesh.position.y += 1
    scene.add(mesh)
    playerBullets.push({ mesh, vel: new THREE.Vector3(0, 20, 0) })
  }

  const createEnemyBullet = (pos) => {
    const geo = new THREE.SphereGeometry(0.2, 8, 8)
    const mat = new THREE.MeshStandardMaterial({
      color: colors.enemyBullet,
      roughness: 0.8,
      metalness: 0.0
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(pos)
    scene.add(mesh)
    enemyBullets.push({ mesh, vel: new THREE.Vector3(0, -15, 0) })
  }

  const makeInvaders = (currentLevel = 1)=>{
    invaders.forEach(inv => scene.remove(inv.mesh))
    invaders = []

    const rows = 4
    const cols = 10
    const gap = 0.4
    const startX = -((cols * 1.6) / 2) + 0.8
    const baseY = 4

    const isDay = currentTheme === 'day'
    
    // Define invader species colors (soft retro palette)
    const speciesColors = [
      { body: colors.invader, accent: colors.mint },      // Row 0: Coral with Mint
      { body: colors.accent, accent: colors.playerBullet }, // Row 1: Soft Cyan with Yellow
      { body: colors.mint, accent: colors.invader },       // Row 2: Mint with Coral
      { body: '#D7BDE2', accent: colors.accent }           // Row 3: Soft Purple with Cyan
    ]
    
    for(let r=0; r<rows; r++){
      const speciesColor = speciesColors[r]
      
      for(let c=0; c<cols; c++){
        const invader = new THREE.Group()
        
        // Different species design per row
        if(r === 0 || r === 2) {
          // Chunky box invader with eyes
          const bodyGeo = new THREE.BoxGeometry(1.0, 0.7, 0.6)
          const bodyMat = new THREE.MeshStandardMaterial({
            color: speciesColor.body,
            roughness: 0.85,
            metalness: 0.0
          })
          const body = new THREE.Mesh(bodyGeo, bodyMat)
          invader.add(body)
          
          // Eyes (two small spheres)
          const eyeGeo = new THREE.SphereGeometry(0.12, 8, 8)
          const eyeMat = new THREE.MeshStandardMaterial({
            color: speciesColor.accent,
            roughness: 0.7,
            metalness: 0.0
          })
          const leftEye = new THREE.Mesh(eyeGeo, eyeMat)
          leftEye.position.set(-0.25, 0.15, 0.35)
          invader.add(leftEye)
          
          const rightEye = new THREE.Mesh(eyeGeo, eyeMat)
          rightEye.position.set(0.25, 0.15, 0.35)
          invader.add(rightEye)
          
        } else {
          // Stepped/rounded invader
          const bodyGeo = new THREE.CylinderGeometry(0.5, 0.4, 0.7, 6)
          const bodyMat = new THREE.MeshStandardMaterial({
            color: speciesColor.body,
            roughness: 0.85,
            metalness: 0.0
          })
          const body = new THREE.Mesh(bodyGeo, bodyMat)
          invader.add(body)
          
          // Antenna (small cone on top)
          const antennaGeo = new THREE.ConeGeometry(0.1, 0.3, 4)
          const antennaMat = new THREE.MeshStandardMaterial({
            color: speciesColor.accent,
            roughness: 0.7,
            metalness: 0.0
          })
          const antenna = new THREE.Mesh(antennaGeo, antennaMat)
          antenna.position.y = 0.5
          invader.add(antenna)
        }

        invader.position.set(
          startX + c * 1.6,
          baseY + r * 1.2,
          0
        )
        
        scene.add(invader)
        invaders.push({ mesh: invader, w: 1.2, h: 0.8, active: true })
      }
    }
    
    // Reset invader movement
    invaderDirection = 1
    invaderSpeed = 0.5 + (currentLevel - 1) * 0.1
  }

  const spawnParticles = (pos, color) => {
    const count = 30
    const geo = new THREE.BufferGeometry()
    const positions = []
    const sizes = []
    const lifes = []
    
    for(let i=0; i<count; i++){
      positions.push(pos.x, pos.y, pos.z)
      sizes.push(Math.random() * 1.5 + 0.5) // Large rings
      lifes.push(1.0)
    }
    
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1))
    geo.setAttribute('life', new THREE.Float32BufferAttribute(lifes, 1))
    
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(color) }
      },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    
    if(currentTheme === 'day') {
       mat.uniforms.color.value = new THREE.Color(color).multiplyScalar(1.2)
       mat.blending = THREE.NormalBlending
    }
    
    const mesh = new THREE.Points(geo, mat)
    scene.add(mesh)
    
    // Store velocities separately
    const velocities = []
    for(let i=0; i<count; i++){
      velocities.push({
        x: (Math.random()-0.5) * 0.5, // Slow expansion
        y: (Math.random()-0.5) * 0.5,
        z: (Math.random()-0.5) * 0.5
      })
    }
    
    particles.push({ mesh, velocities, life: 1.0 })
  }

  const start = ()=>{
    if(gameState === 'playing') return
    
    // Handle different states
    if(gameState === 'levelCleared') {
      // Start next level
      level++
      makeInvaders(level)
      
      // Clear any remaining bullets
      playerBullets.forEach(b => scene.remove(b.mesh))
      playerBullets = []
      enemyBullets.forEach(b => scene.remove(b.mesh))
      enemyBullets = []
    }
    
    gameState = 'playing'
    emit('score', score)
    emit('lives', lives)
    emit('state', gameState)
  }

  const reset = ()=>{
    gameState = 'idle'
    level = 1
    
    // Clear bullets
    playerBullets.forEach(b => scene.remove(b.mesh))
    playerBullets = []
    enemyBullets.forEach(b => scene.remove(b.mesh))
    enemyBullets = []
    
    // Clear particles
    particles.forEach(p => scene.remove(p.mesh))
    particles = []
    
    // Reset invaders
    makeInvaders(level)

    // Reset player ship
    playerShip.position.x = 0
    playerShip.userData.targetX = 0

    score = 0
    lives = 3
    emit('score', score)
    emit('lives', lives)
    emit('state', gameState)
  }

  const resize = ()=>{
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight
    if(camera) {
      camera.aspect = sizes.width / sizes.height
      camera.updateProjectionMatrix()
    }
    if(renderer) renderer.setSize(sizes.width, sizes.height)
    if(composer) composer.setSize(sizes.width, sizes.height)
  }

  const tick = ()=>{
    rafId = requestAnimationFrame(tick)
    const dt = Math.min(clock.getDelta(), 0.05)

    // Always allow ship movement (even when paused)
    if(keys.ArrowLeft) playerShip.userData.targetX -= 60 * dt
    if(keys.ArrowRight) playerShip.userData.targetX += 60 * dt
    playerShip.userData.targetX = THREE.MathUtils.clamp(playerShip.userData.targetX, -play.x+1.5, play.x-1.5)

    // Ship smoothing
    playerShip.position.x += (playerShip.userData.targetX - playerShip.position.x) * 20 * dt

    // Only update game logic when playing
    if(gameState === 'playing'){
      // Player shooting
      const now = clock.getElapsedTime()
      if(keys.Space && (now - lastPlayerShot) > 0.3) {
        createPlayerBullet()
        lastPlayerShot = now
        Audio.play('paddle', { volume: 0.6, playbackRate: 1.2 })
      }

      // Update player bullets
      for(let i=playerBullets.length-1; i>=0; i--){
        const bullet = playerBullets[i]
        bullet.mesh.position.addScaledVector(bullet.vel, dt)
        
        // Remove if off screen
        if(bullet.mesh.position.y > 10){
          scene.remove(bullet.mesh)
          playerBullets.splice(i, 1)
          continue
        }
        
        // Check collision with invaders
        for(let j=invaders.length-1; j>=0; j--){
          const inv = invaders[j]
          const dx = Math.abs(bullet.mesh.position.x - inv.mesh.position.x)
          const dy = Math.abs(bullet.mesh.position.y - inv.mesh.position.y)
          
          if(dx < inv.w/2 + 0.2 && dy < inv.h/2 + 0.3){
            // Hit!
            const invColor = inv.mesh.children[0]?.material?.color || colors.invader
            scene.remove(inv.mesh)
            invaders.splice(j, 1)
            scene.remove(bullet.mesh)
            playerBullets.splice(i, 1)
            
            spawnParticles(inv.mesh.position, invColor)
            Audio.play('brick', { volume: 0.8, playbackRate: 1.1 })
            camera.userData.shake = 0.05
            
            score += 100
            emit('score', score)
            break
          }
        }
      }

      // Update enemy bullets
      for(let i=enemyBullets.length-1; i>=0; i--){
        const bullet = enemyBullets[i]
        bullet.mesh.position.addScaledVector(bullet.vel, dt)
        
        // Remove if off screen
        if(bullet.mesh.position.y < -10){
          scene.remove(bullet.mesh)
          enemyBullets.splice(i, 1)
          continue
        }
        
        // Check collision with player
        const dx = Math.abs(bullet.mesh.position.x - playerShip.position.x)
        const dy = Math.abs(bullet.mesh.position.y - playerShip.position.y)
        
        if(dx < 1 && dy < 1){
          // Hit player!
          scene.remove(bullet.mesh)
          enemyBullets.splice(i, 1)
          
          spawnParticles(playerShip.position, colors.player)
          Audio.play('life_lost', { volume: 0.8, playbackRate: 1 })
          camera.userData.shake = 0.2
          
          lives--
          emit('lives', lives)
          
          // Clear all bullets on death
          enemyBullets.forEach(b => scene.remove(b.mesh))
          enemyBullets = []
          playerBullets.forEach(b => scene.remove(b.mesh))
          playerBullets = []
          
          if(lives <= 0){
            gameState = 'gameOver'
            emit('gameover', true)
            emit('state', gameState)
          } else {
            // Player death - pause and require input to continue
            gameState = 'paused'
            playerShip.position.x = 0
            playerShip.userData.targetX = 0
            emit('state', gameState)
          }
          break
        }
      }

      // Enemy shooting
      if(invaders.length > 0 && (now - lastEnemyShot) > 1.5){
        const randomInv = invaders[Math.floor(Math.random() * invaders.length)]
        createEnemyBullet(randomInv.mesh.position)
        lastEnemyShot = now
        Audio.play('paddle', { volume: 0.4, playbackRate: 0.8 })
      }

      // Move invaders
      invaderDescendTimer += dt
      if(invaderDescendTimer > 0.8){
        invaderDescendTimer = 0
        
        // Check if any invader hit the edge
        let hitEdge = false
        for(const inv of invaders){
          if(invaderDirection > 0 && inv.mesh.position.x > play.x - 1){
            hitEdge = true
            break
          }
          if(invaderDirection < 0 && inv.mesh.position.x < -play.x + 1){
            hitEdge = true
            break
          }
        }
        
        if(hitEdge){
          // Move down and reverse
          invaderDirection *= -1
          for(const inv of invaders){
            inv.mesh.position.y -= 0.5
            
            // Check if invaders reached player
            if(inv.mesh.position.y < playerShip.position.y + 2){
              gameState = 'gameOver'
              lives = 0
              emit('lives', lives)
              emit('gameover', true)
              emit('state', gameState)
            }
          }
        } else {
          // Move horizontally
          for(const inv of invaders){
            inv.mesh.position.x += invaderDirection * invaderSpeed
          }
        }
      }

      // Win condition - level cleared
      if(invaders.length === 0){
        // Clear bullets and particles
        playerBullets.forEach(b => scene.remove(b.mesh))
        playerBullets = []
        enemyBullets.forEach(b => scene.remove(b.mesh))
        enemyBullets = []
        
        gameState = 'levelCleared'
        Audio.play('uiSwitch', { volume: 0.9, playbackRate: 1 })
        emit('levelCleared', level)
        emit('state', gameState)
      }
    }

    // Particles
    for(let i=particles.length-1; i>=0; i--){
      const p = particles[i]
      p.life -= dt * 1.5
      
      const positions = p.mesh.geometry.attributes.position.array
      const lifes = p.mesh.geometry.attributes.life.array
      
      for(let j=0; j<p.velocities.length; j++){
        positions[j*3] += p.velocities[j].x
        positions[j*3+1] += p.velocities[j].y
        positions[j*3+2] += p.velocities[j].z
        lifes[j] = p.life
      }
      p.mesh.geometry.attributes.position.needsUpdate = true
      p.mesh.geometry.attributes.life.needsUpdate = true
      
      if(p.life <= 0){
        scene.remove(p.mesh)
        p.mesh.geometry.dispose()
        p.mesh.material.dispose()
        particles.splice(i, 1)
      }
    }

    // Camera sway
    const targetCamX = playerShip.position.x * 0.05
    camera.position.x += (targetCamX - camera.position.x) * dt
    
    // Screen shake decay
    if(camera.userData.shake > 0) {
        camera.position.x += (Math.random() - 0.5) * camera.userData.shake
        camera.position.y += (Math.random() - 0.5) * camera.userData.shake
        camera.userData.shake *= 0.9
        if(camera.userData.shake < 0.01) camera.userData.shake = 0
    }
    
    camera.lookAt(0, 0, -5)

    composer.render()
  }

  const toggleBloom = (enabled) => {
    // Bloom removed - function kept for compatibility
    bloomEnabled = false
  }

  const setTheme = (name) => {
    if(!scene) return
    currentTheme = name
    const p = palettes[name] || palettes.night
    
    // Update global colors
    colors.player = p.player
    colors.invader = p.invader
    if(p.playerBullet) colors.playerBullet = p.playerBullet
    if(p.enemyBullet) colors.enemyBullet = p.enemyBullet
    
    // Toggle body class for UI styling
    if(name === 'day') document.body.classList.add('theme-day')
    else document.body.classList.remove('theme-day')

    scene.background = new THREE.Color(p.bg)
    
    // No fog for clean look
    scene.fog = null

    // Update player ship colors (it's a group now)
    if(playerShip && playerShip.children) {
      playerShip.children.forEach(child => {
        if(child.material && !child.isPointLight) {
          if(child !== playerShip.children[1]) { // Skip cockpit
            child.material.color = new THREE.Color(p.player)
          }
        }
      })
    }
    
    // Refresh invaders to match theme
    makeInvaders(level)
  }

  const toggleAutoTheme = (enabled) => {
    if(enabled) currentTheme = 'auto'
    else currentTheme = 'night'
  }

  return { init, start, reset, resize, on, toggleBloom, setTheme, toggleAutoTheme, _debug: { scene } }
})()

export default Game
