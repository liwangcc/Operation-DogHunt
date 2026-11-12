// 环境声与界面音效：全部由 Web Audio 现场合成（雨声、室内低鸣、雷声、悬停与确认提示音），不加载任何音频文件。

export interface Soundscape {
  /** 开关声音。浏览器要求由用户操作触发，所以默认关闭，由界面上的按钮调用。 */
  setEnabled: (enabled: boolean) => void
  hover: () => void
  select: () => void
  /** 镜头移动时的一声风响。 */
  whoosh: () => void
  /** 闪电之后的雷声；会自动延后一小段时间，像雷从远处传来。 */
  thunder: () => void
  dispose: () => void
}

const MASTER_LEVEL = 0.8

/** 两秒钟的白噪声，循环播放后经不同滤波器变成雨声、风声和雷声的原料。 */
function createNoise(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  return buffer
}

function loopNoise(context: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const source = context.createBufferSource()
  source.buffer = buffer
  source.loop = true
  source.start()
  return source
}

function filter(context: AudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const node = context.createBiquadFilter()
  node.type = type
  node.frequency.value = frequency
  node.Q.value = q
  return node
}

function gain(context: AudioContext, level: number): GainNode {
  const node = context.createGain()
  node.gain.value = level
  return node
}

/** 持续的底噪：隔着玻璃的雨声、低沉的风雨轰鸣，以及设备运转的嗡鸣。 */
function startAmbience(context: AudioContext, noise: AudioBuffer, output: AudioNode): void {
  // 雨打在玻璃和楼面上：中高频的沙沙声，被玻璃滤掉了最尖的部分。
  const rain = gain(context, 0.1)
  loopNoise(context, noise).connect(filter(context, 'bandpass', 1900, 0.5)).connect(filter(context, 'lowpass', 3200)).connect(rain).connect(output)
  // 雨势有缓慢的起伏。
  const swell = context.createOscillator()
  swell.frequency.value = 0.07
  const swellDepth = gain(context, 0.03)
  swell.connect(swellDepth).connect(rain.gain)
  swell.start()
  loopNoise(context, noise).connect(filter(context, 'lowpass', 240)).connect(gain(context, 0.16)).connect(output)

  for (const [frequency, level] of [[55, 0.03], [82.5, 0.018], [110, 0.008]]) {
    const hum = context.createOscillator()
    hum.frequency.value = frequency
    hum.connect(gain(context, level)).connect(output)
    hum.start()
  }
  // 全息投影的细微高频：两个略微失谐的音，产生缓慢的拍频。
  for (const frequency of [1320, 1326]) {
    const shimmer = context.createOscillator()
    shimmer.type = 'sine'
    shimmer.frequency.value = frequency
    shimmer.connect(gain(context, 0.0025)).connect(output)
    shimmer.start()
  }
}

/** 一段短促的正弦提示音。 */
function blip(context: AudioContext, output: AudioNode, from: number, to: number, seconds: number, level: number, delay = 0): void {
  const start = context.currentTime + delay
  const tone = context.createOscillator()
  tone.type = 'sine'
  tone.frequency.setValueAtTime(from, start)
  tone.frequency.exponentialRampToValueAtTime(to, start + seconds)
  const envelope = gain(context, 0)
  envelope.gain.setValueAtTime(0, start)
  envelope.gain.linearRampToValueAtTime(level, start + 0.008)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + seconds)
  tone.connect(envelope).connect(output)
  tone.start(start)
  tone.stop(start + seconds + 0.02)
}

/** 一阵经过滤波的噪声：frequency 在持续时间内从 from 滑到 to。 */
function burst(context: AudioContext, noise: AudioBuffer, output: AudioNode, type: BiquadFilterType, from: number, to: number, seconds: number, level: number, delay = 0): void {
  const start = context.currentTime + delay
  const source = context.createBufferSource()
  source.buffer = noise
  source.loop = true
  const shape = filter(context, type, from, 0.8)
  shape.frequency.setValueAtTime(from, start)
  shape.frequency.exponentialRampToValueAtTime(to, start + seconds)
  const envelope = gain(context, 0)
  envelope.gain.setValueAtTime(0, start)
  envelope.gain.linearRampToValueAtTime(level, start + Math.min(0.08, seconds * 0.2))
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + seconds)
  source.connect(shape).connect(envelope).connect(output)
  source.start(start)
  source.stop(start + seconds + 0.05)
}

export function createSoundscape(): Soundscape {
  let context: AudioContext | null = null
  let master: GainNode | null = null
  let noise: AudioBuffer | null = null
  let enabled = false

  /** 第一次打开声音时才创建音频环境，避免页面一加载就占用音频设备。 */
  function ensure(): boolean {
    if (context) return true
    try {
      context = new AudioContext()
      master = gain(context, 0)
      master.connect(context.destination)
      noise = createNoise(context)
      startAmbience(context, noise, master)
      return true
    } catch {
      context = null
      return false
    }
  }

  /** 只有声音打开时才播放一次性的音效。 */
  function play(sound: (context: AudioContext, output: GainNode, noise: AudioBuffer) => void): void {
    if (enabled && context && master && noise) sound(context, master, noise)
  }

  return {
    setEnabled: (next) => {
      enabled = next
      if (next && !ensure()) return
      if (!context || !master) return
      if (next) void context.resume()
      master.gain.cancelScheduledValues(context.currentTime)
      master.gain.setTargetAtTime(next ? MASTER_LEVEL : 0, context.currentTime, 0.25)
    },
    hover: () => play((ctx, out) => blip(ctx, out, 1500, 1900, 0.05, 0.035)),
    select: () =>
      play((ctx, out) => {
        blip(ctx, out, 660, 660, 0.12, 0.07)
        blip(ctx, out, 990, 990, 0.18, 0.06, 0.07)
      }),
    whoosh: () => play((ctx, out, buffer) => burst(ctx, buffer, out, 'bandpass', 260, 1400, 0.8, 0.12)),
    thunder: () =>
      play((ctx, out, buffer) => {
        const delay = 0.5 + Math.random() * 0.9
        burst(ctx, buffer, out, 'lowpass', 900, 120, 0.5, 0.35, delay)
        burst(ctx, buffer, out, 'lowpass', 190, 50, 4.2, 0.85, delay + 0.08)
      }),
    dispose: () => {
      void context?.close()
      context = null
      master = null
      noise = null
    },
  }
}
