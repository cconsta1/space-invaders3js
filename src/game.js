import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

const Game = (()=>{
  let canvas, renderer, scene, camera, clock
  let composer
  let paddle, balls = [], ballRadius = 0.4, bricks = []
  let particles = []
  let powerups = []
  let activePowerupTimers = []
  let score = 0, lives = 3, level = 1
  let rafId, started = false
  const events = new Map()
  const keys = { ArrowLeft: false, ArrowRight: false }

  // Config
  const sizes = { width: window.innerWidth, height: window.innerHeight }
  const play = { x: 12, y: 8, zNear: 4, zFar: -16 }
  const colors = {
    paddle: '#00ffff',
    ball: '#ffffff',
    wall: '#1a1a2e',
    bg: '#050510',
    powerup: '#ff00ff'
  }

  const emit = (k,v)=> (events.get(k)||[]).forEach(fn=>fn(v))
  const on = (k,fn)=> { events.set(k, [...(events.get(k)||[]), fn]) }

  const init = ({canvas:cnv})=>{
    canvas = cnv
    
    // Renderer
    renderer = new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance'})
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ReinhardToneMapping

    scene = new THREE.Scene()
    scene.background = new THREE.Color(colors.bg)
    scene.fog = new THREE.FogExp2(colors.bg, 0.02)

    camera = new THREE.PerspectiveCamera(50, sizes.width/sizes.height, 0.1, 100)
    camera.position.set(0, 8, 22)
    camera.lookAt(0, 0, -4)

    clock = new THREE.Clock()

    // Post Processing (Bloom)
    const renderScene = new RenderPass(scene, camera)
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(sizes.width, sizes.height), 1.5, 0.4, 0.85)
    bloomPass.threshold = 0.1
    bloomPass.strength = 1.5
    bloomPass.radius = 0.6

    composer = new EffectComposer(renderer)
    composer.addPass(renderScene)
    composer.addPass(bloomPass)

    // Lighting
    const amb = new THREE.AmbientLight('#ffffff', 0.2)
    scene.add(amb)
    
    const dir = new THREE.DirectionalLight('#ffffff', 1)
    dir.position.set(5, 10, 5)
    scene.add(dir)
    
    // Grid floor
    const grid = new THREE.GridHelper(80, 40, '#2a2a40', '#111')
    grid.position.y = -8
    grid.position.z = -10
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

  const makeBricks = (currentLevel = 1)=>{
    bricks.forEach(b=>scene.remove(b.mesh))
    bricks = []

    const rows = 6 + (currentLevel - 1)
    const cols = 8 + (currentLevel - 1)
    const w = 2.2
    const h = 0.8
    const gap = 0.2
    const startX = -((cols * (w+gap)) / 2) + (w+gap)/2
    const baseY = 4
    
    for(let r=0; r<rows; r++){
      for(let c=0; c<cols; c++){
        // Gradient colors
        const hue = (c / cols) * 0.2 + (r / rows) * 0.5 + 0.5 // Blue to Pink
        const color = new THREE.Color().setHSL(hue, 1, 0.5)
        
        const mat = new THREE.MeshStandardMaterial({
          color: color,
          emissive: color,
          emissiveIntensity: 0.8,
          roughness: 0.1,
          metalness: 0.9
        })
        
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1), mat)
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
    const count = 12
    const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2)
    const mat = new THREE.MeshBasicMaterial({ color: color })
    
    for(let i=0; i<count; i++){
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.copy(pos)
      
      // Random velocity
      const vel = new THREE.Vector3(
        (Math.random()-0.5)*0.5,
        (Math.random()-0.5)*0.5,
        (Math.random()-0.5)*0.5
      )
      
      scene.add(mesh)
      particles.push({ mesh, vel, life: 1.0 })
    }
  }

  const spawnPowerup = (pos) => {
    const r = Math.random()
    let type = 'WIDE'
    if(r > 0.7) type = 'LIFE'
    if(r > 0.85) type = 'MULTI'

    const geo = new THREE.OctahedronGeometry(0.4)
    const mat = new THREE.MeshStandardMaterial({ 
      color: type === 'MULTI' ? '#ffff00' : colors.powerup, 
      emissive: type === 'MULTI' ? '#ffff00' : colors.powerup, 
      emissiveIntensity: 2 
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(pos)
    scene.add(mesh)
    powerups.push({ mesh, type, vel: new THREE.Vector3(0, -4, 0) })
  }

  const start = ()=>{
    if(started) return
    started = true
    if(balls.length > 0) {
      balls[0].vel = new THREE.Vector3((Math.random()-0.5), 1, 0).normalize().multiplyScalar(0.35) // Slower start
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
  }

  const resize = ()=>{
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()
    renderer.setSize(sizes.width, sizes.height)
    composer.setSize(sizes.width, sizes.height)
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
      p.life -= dt * 2
      p.mesh.position.add(p.vel)
      p.mesh.rotation.x += p.vel.z
      p.mesh.rotation.y += p.vel.x
      p.mesh.scale.setScalar(p.life)
      
      if(p.life <= 0){
        scene.remove(p.mesh)
        particles.splice(i, 1)
      }
    }

    // Powerups
    for(let i=powerups.length-1; i>=0; i--){
      const p = powerups[i]
      p.mesh.position.addScaledVector(p.vel, dt)
      p.mesh.rotation.y += dt * 2
      
      // Collision with paddle
      if(p.mesh.position.y < paddle.position.y + 1 && 
         p.mesh.position.y > paddle.position.y - 1 &&
         Math.abs(p.mesh.position.x - paddle.position.x) < 2.5) {
           
           // Apply effect
           if(p.type === 'WIDE') {
             paddle.scale.x = 1.5
             const timerId = setTimeout(()=>paddle.scale.x=1, 8000)
             activePowerupTimers.push(timerId)
           } else if (p.type === 'LIFE') {
             lives++
             emit('lives', lives)
           } else if (p.type === 'MULTI') {
             spawnExtraBalls()
           }
           
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
    }
    if(pos.y > play.y) {
      vel.y *= -1
      pos.y = play.y
    }

    // Paddle
    if(pos.y < paddle.position.y + 1 && 
       pos.y > paddle.position.y - 1 &&
       Math.abs(pos.x - paddle.position.x) < 2.5) {
         
       if(vel.y < 0){
         vel.y *= -1
         // English/Spin effect
         vel.x += (pos.x - paddle.position.x) * 0.3
         vel.normalize().multiplyScalar(0.65) // Speed up slightly
         
         // Squash effect
         paddle.scale.y = 0.5
         setTimeout(()=>paddle.scale.y=1, 100)
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
        
        // Chance for powerup
        if(Math.random() < 0.2) spawnPowerup(brick.mesh.position)

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
      level++
      makeBricks(level)
      resetBall()
      started = false
      emit('pause')
    }
  }

  return { init, start, reset, resize, on, _debug: { scene } }
})()

export default Game
