const Audio = (()=>{
  let ctx = null
  const buffers = new Map()

  // Manifest of named sounds -> URL
  const manifest = {
    uiClick: '/src/assets/kenney_ui-audio/Audio/click1.ogg',
    uiSwitch: '/src/assets/kenney_ui-audio/Audio/switch13.ogg',
    paddle: '/src/assets/kenney_sci-fi-sounds/Audio/laserSmall_001.ogg',
    brick: '/src/assets/kenney_sci-fi-sounds/Audio/impactMetal_002.ogg',
    powerup_spawn: '/src/assets/kenney_sci-fi-sounds/Audio/forceField_002.ogg',
    powerup_collect: '/src/assets/kenney_ui-audio/Audio/switch1.ogg',
    life_lost: '/src/assets/kenney_sci-fi-sounds/Audio/lowFrequency_explosion_000.ogg',
    explosion: '/src/assets/kenney_sci-fi-sounds/Audio/explosionCrunch_002.ogg',
    chaos: '/src/assets/kenney_sci-fi-sounds/Audio/computerNoise_000.ogg'
  }

  const init = ()=>{
    if(!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  }

  const resume = async ()=>{
    init()
    if(ctx.state === 'suspended') await ctx.resume()
  }

  const load = async (name, url) => {
    try{
      const res = await fetch(url)
      const ab = await res.arrayBuffer()
      const buf = await ctx.decodeAudioData(ab)
      buffers.set(name, buf)
    }catch(err){
      console.warn('Audio load failed', name, url, err)
    }
  }

  const loadAll = async ()=>{
    init()
    const entries = Object.entries(manifest)
    await Promise.all(entries.map(([n,u])=>load(n,u)))
  }

  const play = (name, {volume = 1, playbackRate = 1} = {})=>{
    if(!ctx) init()
    const buf = buffers.get(name)
    if(!buf) return
    try{
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = playbackRate
      const gain = ctx.createGain()
      gain.gain.value = volume
      src.connect(gain).connect(ctx.destination)
      src.start()
    }catch(e){
      // ignore - playback may fail when context not resumed
    }
  }

  return { init, resume, loadAll, play, _debug: { manifest } }
})()

export default Audio
