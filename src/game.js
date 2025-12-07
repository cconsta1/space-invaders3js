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
  let paddle, balls = [], ballRadius = 0.4, bricks = []
  let particles = []
  let powerups = []
  let activePowerupTimers = []
  let speedMultiplier = 1
  let wideActive = false
  let score = 0, lives = 3, level = 1
  let rafId, started = false
  let bloomEnabled = true
  let currentTheme = 'night'
  let themeTime = 0
  const events = new Map()
  const keys = { ArrowLeft: false, ArrowRight: false }

  // Config
  const sizes = { width: window.innerWidth, height: window.innerHeight }
  const play = { x: 12, y: 8, zNear: 4, zFar: -16 }
  
  // Industrial Cyberpunk Palette
  const colors = {
    paddle: '#00f3ff',      // Neon Cyan
    ball: '#ff0099',        // Neon Magenta
    wall: '#050505',        // Void Black
    bg: '#020203',          // Deep dark
    powerup: '#39ff14',     // Neon Green
    grid: '#ff0099',        // Magenta Grid
    accent: '#00f3ff'       // Cyan Accent
  }

  const palettes = {
    night: { 
      ...colors, 
      amb: '#111111', 
      dir: '#ffffff', 
      floor: '#000000', 
      grid1: '#ff0099', 
      grid2: '#220033',
      bg: '#050505',
      paddle: '#00f3ff', 
      ball: '#ff0099'
    },
    day: { // Vivid, Cartoonish, Industrial
      paddle: '#ff3300', // Vivid Orange-Red
      ball: '#111111',   // Dark Matter
      wall: '#34495e',   // Dark Blue-Grey
      bg: '#f0f5fa',     // Cool White/Blue tint
      grid1: '#b0c4de',  // Light Steel Blue
      grid2: '#e6e6fa',  // Lavender
      accent: '#ff3300',
      amb: '#ffffff',
      dir: '#ffffff',
      floor: '#ffffff'
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
    // Pointer/touch controls: map pointer X to paddle target
    const onPointer = (e) => {
      // support touch/pointer
      const x = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX) || 0
      const pct = x / window.innerWidth
      // Map 0..1 to -play.x .. play.x
      const target = (pct * (play.x * 2)) - play.x
      if(paddle) paddle.userData.targetX = THREE.MathUtils.clamp(target, -play.x+2, play.x-2)
    }
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('touchmove', onPointer, { passive: true })
    
    // Renderer
    renderer = new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance'})
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ReinhardToneMapping

    scene = new THREE.Scene()
    // Initialize fog before setting theme - Deep Cyber Fog
    scene.fog = new THREE.FogExp2(colors.bg, 0.03)
    
    // Lighting
    const amb = new THREE.AmbientLight('#111111', 0.5)
    scene.add(amb)
    
    const dir = new THREE.DirectionalLight('#ffffff', 0.5)
    dir.position.set(5, 10, 5)
    scene.add(dir)

    // Add some colored point lights for atmosphere
    const pLight1 = new THREE.PointLight('#00f3ff', 2, 20)
    pLight1.position.set(-10, 5, -5)
    scene.add(pLight1)

    const pLight2 = new THREE.PointLight('#ff0099', 2, 20)
    pLight2.position.set(10, 5, -5)
    scene.add(pLight2)

    setTheme(currentTheme) // Apply initial theme

    camera = new THREE.PerspectiveCamera(50, sizes.width/sizes.height, 0.1, 100)
    camera.position.set(0, 8, 22)
    camera.lookAt(0, 0, -4)
    camera.userData = { shake: 0 }

    clock = new THREE.Clock()

    // Post Processing (Bloom + Film)
    const renderScene = new RenderPass(scene, camera)
    
    // Soft, atmospheric bloom
    bloomPass = new UnrealBloomPass(new THREE.Vector2(sizes.width, sizes.height), 1.5, 0.4, 0.85)
    bloomPass.threshold = 0.15
    bloomPass.strength = 0.8 // Reduced from 1.2
    bloomPass.radius = 0.4
    bloomPass.enabled = bloomEnabled

    const filmPass = new FilmPass(0.2, false) // Reduced noise

    const outputPass = new OutputPass()

    composer = new EffectComposer(renderer)
    composer.addPass(renderScene)
    composer.addPass(bloomPass)
    composer.addPass(filmPass)
    composer.addPass(outputPass)
    
    // Grid floor - Subtle Industrial Grid
    const grid = new THREE.GridHelper(80, 40, '#333333', '#111111')
    grid.position.y = -8
    grid.position.z = -10
    grid.material.opacity = 0.2
    grid.material.transparent = true
    scene.add(grid)

    makePaddle()
    resetBall()
    makeBricks()

    // Input - Keyboard only
    window.addEventListener('keydown', e => {
      if(e.code === 'ArrowLeft') keys.ArrowLeft = true
      if(e.code === 'ArrowRight') keys.ArrowRight = true
    })
    window.addEventListener('keyup', e => {
      if(e.code === 'ArrowLeft') keys.ArrowLeft = false
      if(e.code === 'ArrowRight') keys.ArrowRight = false
    })

    tick()
  }

  const makePaddle = ()=>{
    const geo = new THREE.BoxGeometry(4, 0.5, 1)
    const mat = new THREE.MeshStandardMaterial({
      color: colors.paddle,
      emissive: colors.paddle,
      emissiveIntensity: 2,
      roughness: 0.1,
      metalness: 0.8
    })
    paddle = new THREE.Mesh(geo, mat)
    paddle.position.set(0, -6, 0)
    paddle.userData = { targetX: 0 }
    scene.add(paddle)

    // Paddle light
    const light = new THREE.PointLight(colors.paddle, 2, 10)
    light.position.y = 1
    paddle.add(light)
  }

  const createBallMesh = () => {
    const geo = new THREE.SphereGeometry(ballRadius, 32, 32)
    const mat = new THREE.MeshStandardMaterial({
      color: colors.ball,
      emissive: colors.ball,
      emissiveIntensity: 5,
      toneMapped: false
    })
    const mesh = new THREE.Mesh(geo, mat)
    
    // Trail
    const trailGeo = new THREE.BufferGeometry()
    const trailMat = new THREE.LineBasicMaterial({ color: colors.ball, transparent: true, opacity: 0.5 })
    const trail = new THREE.Line(trailGeo, trailMat)
    scene.add(trail)
    
    return { mesh, trail, history: [], vel: new THREE.Vector3() }
  }

  const resetBall = ()=>{
    // Remove existing balls
    balls.forEach(b => {
      scene.remove(b.mesh)
      scene.remove(b.trail)
    })
    balls = []

    const b = createBallMesh()
    b.mesh.position.set(0, -4, 0)
    b.vel.set(0,0,0)
    scene.add(b.mesh)
    balls.push(b)
  }

  const spawnExtraBalls = () => {
    if(balls.length === 0) return
    const origin = balls[0]
    for(let i=0; i<2; i++){
      const b = createBallMesh()
      b.mesh.position.copy(origin.mesh.position)
      b.vel.copy(origin.vel).applyAxisAngle(new THREE.Vector3(0,0,1), (Math.random()-0.5)*0.5)
      scene.add(b.mesh)
      balls.push(b)
    }
  }

  const addExtraBalls = (count) => {
    if(balls.length === 0) return
    const origin = balls[0]
    for(let i=0; i<count; i++){
      const b = createBallMesh()
      b.mesh.position.copy(origin.mesh.position)
      b.vel.copy(origin.vel).applyAxisAngle(new THREE.Vector3(0,0,1), (Math.random()-0.5)*0.8)
      scene.add(b.mesh)
      balls.push(b)
    }
  }

  const makeBricks = (currentLevel = 1)=>{
    bricks.forEach(b=>scene.remove(b.mesh))
    bricks = []

    const rows = 6
    const cols = 8
    const w = 2.2
    const h = 0.8
    const gap = 0.2
    const startX = -((cols * (w+gap)) / 2) + (w+gap)/2
    const baseY = 4

    // Shift hue palette each level for visual variety
    const levelHueOffset = ((currentLevel - 1) * 0.15) % 1
    const isDay = currentTheme === 'day'
    
    for(let r=0; r<rows; r++){
      for(let c=0; c<cols; c++){
        // Neon Gradient colors
        const hue = ((c / cols) * 0.3 + (r / rows) * 0.2 + levelHueOffset) % 1
        const sat = 1.0
        const light = 0.5
        const color = new THREE.Color().setHSL(hue, sat, light)
        
        const mat = new THREE.MeshStandardMaterial({
          color: color,
          emissive: color,
          emissiveIntensity: isDay ? 0.5 : 1.5, // Balanced glow
          roughness: 0.2,
          metalness: 0.8
        })
        
        const geo = new THREE.BoxGeometry(w, h, 1)
        const mesh = new THREE.Mesh(geo, mat)
        
        // Add crisp edges - Subtle lines
        if(isDay) {
            const edges = new THREE.EdgesGeometry(geo)
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }))
            mesh.add(line)
        }

        mesh.position.set(
          startX + c*(w+gap),
          baseY + r*(h+gap),
          0
        )
        
        scene.add(mesh)
        bricks.push({ mesh, w, h, d:1, active:true })
      }
    }

    // Ensure the ball can reach the highest row before bouncing off the ceiling
    const highestRowCenter = baseY + (rows - 1) * (h + gap)
    play.y = highestRowCenter + h / 2 + 1
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

  const spawnPowerup = (pos) => {
    const r = Math.random()
    // Distribution: WIDE 65%, MULTI 25%, LIFE 10%
    let type = 'WIDE'
    if(r >= 0.65 && r < 0.90) type = 'MULTI'
    else if(r >= 0.90) type = 'LIFE'

    // Distinct colors: WIDE=blue, MULTI=yellow, LIFE=green
    let col = '#00aaff' // WIDE blue
    if(type === 'MULTI') col = '#ffff00' // yellow
    if(type === 'LIFE') col = '#00ff66' // green

    const geo = new THREE.OctahedronGeometry(0.4)
    const mat = new THREE.MeshStandardMaterial({ 
      color: col, 
      emissive: col, 
      emissiveIntensity: 2 
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(pos)
    scene.add(mesh)
    // play spawn sound (don't spawn while wide is active)
    Audio.play('powerup_spawn', { volume: 0.8, playbackRate: 1 })
    powerups.push({ mesh, type, vel: new THREE.Vector3(0, -4, 0) })
  }

  const start = ()=>{
    if(started) return
    started = true
    if(balls.length > 0) {
      balls[0].vel = new THREE.Vector3((Math.random()-0.5), 1, 0).normalize().multiplyScalar(0.35 * speedMultiplier) // Slower start (adjusted by level)
    }
    // Don't reset score and lives on continue
    emit('score', score)
    emit('lives', lives)
  }

  const reset = ()=>{
    started = false
    level = 1
    resetBall()
    makeBricks(level)
    
    // Clear particles
    particles.forEach(p => scene.remove(p.mesh))
    particles = []
    
    // Clear powerups
    powerups.forEach(p => scene.remove(p.mesh))
    powerups = []
    
    // Clear all active powerup timers
    activePowerupTimers.forEach(timerId => clearTimeout(timerId))
    activePowerupTimers = []

    // Reset paddle
    paddle.position.x = 0
    paddle.userData.targetX = 0
    paddle.scale.set(1,1,1)

    score = 0
    lives = 3
    emit('score', score)
    emit('lives', lives)
    wideActive = false
  }

  // Clear transient objects that shouldn't persist between levels
  const clearLevelTransient = ()=>{
    // remove powerups
    powerups.forEach(p => scene.remove(p.mesh))
    powerups = []

    // remove particles
    particles.forEach(p => scene.remove(p.mesh))
    particles = []

    // clear powerup timers
    activePowerupTimers.forEach(timerId => clearTimeout(timerId))
    activePowerupTimers = []

    // reset paddle visual state
    if(paddle) {
      paddle.scale.set(1,1,1)
      paddle.position.x = 0
      if(paddle.material){
        paddle.material.emissive = new THREE.Color(colors.paddle)
        paddle.material.color = new THREE.Color(colors.paddle)
      }
    }
    // ensure wide flag is cleared so powerups can spawn again
    wideActive = false
  }

  const applyLevelVariation = (lvl)=>{
    // Simple surprise: pick one of a few visual/feel changes per level
    speedMultiplier = 1 + Math.min(0.5, (lvl - 1) * 0.05)

    // Cycle paddle colors
    const colorMode = (lvl - 1) % 3
    let col
    if(colorMode === 0) col = colors.paddle // Cyan
    else if(colorMode === 1) col = '#ff00ff' // Magenta
    else col = '#ffff00' // Yellow

    if(paddle && paddle.material) {
      paddle.material.color = new THREE.Color(col)
      paddle.material.emissive = new THREE.Color(col)
      // Update point light child
      if(paddle.children[0]) paddle.children[0].color = new THREE.Color(col)
    }

    // play a pleasant level-up sound
    try{ Audio.play('uiSwitch', { volume: 0.9, playbackRate: 1 }) }catch(e){}
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

    // Keyboard input - Faster paddle
    if(keys.ArrowLeft) paddle.userData.targetX -= 60 * dt
    if(keys.ArrowRight) paddle.userData.targetX += 60 * dt
    paddle.userData.targetX = THREE.MathUtils.clamp(paddle.userData.targetX, -play.x+2, play.x-2)

    // Paddle smoothing - Snappier
    paddle.position.x += (paddle.userData.targetX - paddle.position.x) * 20 * dt

    if(started){
      // Update all balls
      for(let i=balls.length-1; i>=0; i--){
        const b = balls[i]
        b.mesh.position.addScaledVector(b.vel, dt * 30) // Slower ball speed
        
        // Trail update
        b.history.push(b.mesh.position.clone())
        if(b.history.length > 15) b.history.shift()
        b.trail.geometry.setFromPoints(b.history)

        handleCollisions(b, i)
      }
    } else {
      if(balls.length > 0){
        balls[0].mesh.position.x = paddle.position.x
        balls[0].mesh.position.y = paddle.position.y + 1.5
        balls[0].history = []
        balls[0].trail.geometry.setFromPoints([])
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

    // Powerups
    for(let i=powerups.length-1; i>=0; i--){
      const p = powerups[i]
      p.mesh.position.addScaledVector(p.vel, dt)
      p.mesh.rotation.y += dt * 2
      
      // Collision with paddle
      const paddleWidth = paddle.scale.x * 4
      if(p.mesh.position.y < paddle.position.y + 1 && 
         p.mesh.position.y > paddle.position.y - 1 &&
         Math.abs(p.mesh.position.x - paddle.position.x) < (paddleWidth/2 + 0.8)) {
           
           // Apply effect
           if(p.type === 'WIDE') {
             // If already active, extend the timer; otherwise start it
             if(wideActive){
               // Clear existing timer and set a new one to extend duration
               activePowerupTimers.forEach(timerId => clearTimeout(timerId))
               activePowerupTimers = []
             } else {
               paddle.scale.x = 1.5
               wideActive = true
             }
             const timerId = setTimeout(()=>{
               paddle.scale.x = 1
               wideActive = false
             }, 8000)
             activePowerupTimers.push(timerId)
           } else if (p.type === 'LIFE') {
             lives++
             emit('lives', lives)
           } else if (p.type === 'MULTI') {
             // Always add 3 balls (stacking: 1->4, 4->7, etc.)
             addExtraBalls(3)
           }

           // play collect sound (generic)
           Audio.play('powerup_collect', { volume: 0.85 })
           scene.remove(p.mesh)
           powerups.splice(i, 1)
           continue
      }

      if(p.mesh.position.y < -10){
        scene.remove(p.mesh)
        powerups.splice(i, 1)
      }
    }

    // Camera sway
    const targetCamX = balls.length > 0 ? balls[0].mesh.position.x * 0.05 : 0
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

  const handleCollisions = (b, index)=>{
    const pos = b.mesh.position
    const vel = b.vel

    // Walls
    if(pos.x > play.x || pos.x < -play.x) {
      vel.x *= -1
      pos.x = Math.sign(pos.x) * play.x
      spawnParticles(pos, colors.wall)
    }
    if(pos.y > play.y) {
      vel.y *= -1
      pos.y = play.y
      spawnParticles(pos, colors.wall)
    }

    // Paddle
    const paddleWidth = paddle.scale.x * 4
    if(pos.y < paddle.position.y + 1 && 
       pos.y > paddle.position.y - 1 &&
       Math.abs(pos.x - paddle.position.x) < (paddleWidth/2 + 0.5)) {
         
       if(vel.y < 0){
         vel.y *= -1
         spawnParticles(pos, colors.paddle)
         // English/Spin effect
         vel.x += (pos.x - paddle.position.x) * 0.3
         vel.normalize().multiplyScalar(0.65) // Speed up slightly
        // Play paddle hit sound (pitch slightly based on horizontal velocity)
        Audio.play('paddle', { volume: 0.75, playbackRate: 1 + Math.min(0.6, Math.abs(vel.x) * 0.5) })

         // Squash effect
         paddle.scale.y = 0.5
         setTimeout(()=>paddle.scale.y=1, 100)
         
         // Subtle shake on paddle hit
         camera.userData.shake = 0.15
       }
    }

    // Bricks
    for(let i=bricks.length-1; i>=0; i--){
      const brick = bricks[i]

      // 2D AABB collision detection (X and Y only, since game is 2D in 3D space)
      const dx = Math.abs(pos.x - brick.mesh.position.x)
      const dy = Math.abs(pos.y - brick.mesh.position.y)
      
      if(dx < (brick.w/2 + ballRadius) && dy < (brick.h/2 + ballRadius)){
        // Hit!
        scene.remove(brick.mesh)
        bricks.splice(i, 1)
        
        // Reflect
        // Determine side
        const overlapX = (brick.w/2 + ballRadius) - dx
        const overlapY = (brick.h/2 + ballRadius) - dy
        
        if(overlapX < overlapY) vel.x *= -1
        else vel.y *= -1

        spawnParticles(brick.mesh.position, brick.mesh.material.color)
        // play brick impact sound
        Audio.play('brick', { volume: 0.95, playbackRate: 0.95 + Math.random() * 0.2 })
        
        // Screen shake on impact
        camera.userData.shake = 0.08 // Very subtle
        
        // Chance for powerup (can spawn even while WIDE is active since it extends the timer)
        if(Math.random() < 0.18) spawnPowerup(brick.mesh.position)

        score += 100
        emit('score', score)
        break // Only one brick per frame
      }
    }

    // Death
    if(pos.y < -10){
      // Remove ball
      scene.remove(b.mesh)
      scene.remove(b.trail)
      balls.splice(index, 1)

      if(balls.length === 0) {
        lives--
        emit('lives', lives)
        // play life lost sound
        Audio.play('life_lost', { volume: 0.95, playbackRate: 1 })
        
        // Clear all powerups immediately
        powerups.forEach(p => scene.remove(p.mesh))
        powerups = []
        
        // Clear all active powerup timers and reset paddle
        activePowerupTimers.forEach(timerId => clearTimeout(timerId))
        activePowerupTimers = []
        paddle.scale.set(1,1,1)
        
        if(lives <= 0) {
          started = false
          emit('gameover', true)
        } else {
          resetBall()
          started = false // Pause before launch
          emit('pause')
        }
      }
    }
    
    // Win
    if(bricks.length === 0) {
      // clear any falling powerups/particles so they don't persist into the next level
      clearLevelTransient()
      level++
      applyLevelVariation(level)
      makeBricks(level)
      resetBall()
      started = false
      emit('pause')
    }
  }

  const toggleBloom = (enabled) => {
    bloomEnabled = enabled
    if(bloomPass) bloomPass.enabled = bloomEnabled
  }

  const setTheme = (name) => {
    if(!scene) return
    currentTheme = name
    const p = palettes[name] || palettes.night
    
    // Update global colors so new balls get correct color
    colors.ball = p.ball
    colors.paddle = p.paddle
    
    // Toggle body class for UI styling
    if(name === 'day') document.body.classList.add('theme-day')
    else document.body.classList.remove('theme-day')

    scene.background = new THREE.Color(p.bg)
    scene.fog.color = new THREE.Color(p.bg)
    
    // Adjust Bloom based on theme
    if(bloomPass) {
      if(name === 'day') {
        bloomPass.strength = 0.35 // A tad more noticeable
        bloomPass.threshold = 0.7
        bloomPass.radius = 0.3
      } else {
        bloomPass.strength = 0.5 // A tad less excessive
        bloomPass.threshold = 0.2
        bloomPass.radius = 0.5
      }
    }

    if(paddle && paddle.material) {
      paddle.material.color = new THREE.Color(p.paddle)
      paddle.material.emissive = new THREE.Color(p.paddle)
      if(paddle.children[0]) paddle.children[0].color = new THREE.Color(p.paddle)
    }
    
    balls.forEach(b => {
      if(b.mesh) {
        b.mesh.material.color = new THREE.Color(p.ball)
        b.mesh.material.emissive = new THREE.Color(p.ball)
      }
    })
    
    // Refresh bricks to match theme saturation
    makeBricks(level)
  }

  const toggleAutoTheme = (enabled) => {
    if(enabled) currentTheme = 'auto'
    else currentTheme = 'night'
  }

  return { init, start, reset, resize, on, toggleBloom, setTheme, toggleAutoTheme, _debug: { scene } }
})()

export default Game
