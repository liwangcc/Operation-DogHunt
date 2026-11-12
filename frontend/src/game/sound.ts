// 比赛音效：拍球、鞋底摩擦、哨声、打板、砸筐、刷网、扣篮、蜂鸣器和观众声，全部由 Web Audio 现场合成。
import type { GameEvent } from './sim/types'

export interface GameSound {
  /** 按比赛事件播放对应的声音。 */
  play: (event: GameEvent) => void
  /** 出手时机完美时的一声清脆提示。 */
  chime: () => void
  setMuted: (muted: boolean) => void
  dispose: () => void
}

function makeNoise(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  return buffer
}

interface Kit {
  context: AudioContext
  output: GainNode
  noise: AudioBuffer
}

/** 一个音调：频率可以在持续时间内滑动，音量快速起、指数衰减。 */
function tone(kit: Kit, type: OscillatorType, from: number, to: number, seconds: number, level: number, delay = 0): void {
  const { context, output } = kit
  const start = context.currentTime + delay
  const oscillator = context.createOscillator()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(from, start)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + seconds)
  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(level, start + 0.006)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + seconds)
  oscillator.connect(envelope).connect(output)
  oscillator.start(start)
  oscillator.stop(start + seconds + 0.03)
}

/** 一阵经过滤波的噪声：用来做摩擦、刷网、拍击和人群的声音。 */
function hiss(kit: Kit, type: BiquadFilterType, from: number, to: number, q: number, seconds: number, level: number, attack = 0.004, delay = 0): void {
  const { context, output, noise } = kit
  const start = context.currentTime + delay
  const source = context.createBufferSource()
  source.buffer = noise
  source.loop = true
  const filter = context.createBiquadFilter()
  filter.type = type
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, start)
  filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), start + seconds)
  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(level, start + attack)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + seconds)
  source.connect(filter).connect(envelope).connect(output)
  source.start(start, Math.random())
  source.stop(start + seconds + 0.05)
}

/** 球砸在地板上：一声低沉的“嘭”加一点皮革拍击的脆响，力度越大越响。 */
function thump(kit: Kit, strength: number): void {
  const level = Math.min(0.5, 0.08 + strength * 0.05)
  tone(kit, 'sine', 120, 52, 0.11, level)
  hiss(kit, 'lowpass', 1400, 500, 0.7, 0.05, level * 0.5)
}

/** 鞋底在地板上急停的尖叫声：高频、带颤动、很短。 */
function squeak(kit: Kit): void {
  const pitch = 2100 + Math.random() * 1300
  tone(kit, 'sawtooth', pitch, pitch * (1.08 + Math.random() * 0.25), 0.06 + Math.random() * 0.07, 0.035)
  hiss(kit, 'bandpass', pitch * 1.4, pitch * 1.7, 9, 0.08, 0.05)
}

/** 篮圈的金属声：几个不成整数倍的频率叠在一起，听起来是“哐”而不是音符。 */
function clank(kit: Kit, strength: number): void {
  const level = Math.min(0.3, 0.06 + strength * 0.035)
  for (const [frequency, seconds] of [[510, 0.4], [1127, 0.3], [1790, 0.2], [2650, 0.12]]) tone(kit, 'sine', frequency, frequency * 0.985, seconds, level * (510 / frequency + 0.3))
  hiss(kit, 'bandpass', 3000, 2000, 2, 0.05, level * 0.5)
}

/** 裁判哨：两个相近的高音加快速颤动，像含着小球的哨子。 */
function whistle(kit: Kit, seconds: number): void {
  const { context, output } = kit
  const start = context.currentTime
  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(0.16, start + 0.015)
  envelope.gain.setValueAtTime(0.16, start + seconds - 0.05)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + seconds)
  const trill = context.createOscillator()
  trill.frequency.value = 34
  const depth = context.createGain()
  depth.gain.value = 0.07
  trill.connect(depth).connect(envelope.gain)
  for (const frequency of [2780, 2925]) {
    const pipe = context.createOscillator()
    pipe.type = 'sine'
    pipe.frequency.value = frequency
    pipe.connect(envelope)
    pipe.start(start)
    pipe.stop(start + seconds + 0.02)
  }
  envelope.connect(output)
  trill.start(start)
  trill.stop(start + seconds + 0.02)
}

/** 蜂鸣器：低沉刺耳的方波长音。 */
function buzzer(kit: Kit, seconds: number): void {
  tone(kit, 'sawtooth', 196, 194, seconds, 0.16)
  tone(kit, 'square', 294, 292, seconds, 0.07)
}

/** 观众的欢呼：一大片中频噪声缓缓涌起再退去，强度越大越响、越久。 */
function cheer(kit: Kit, strength: number): void {
  hiss(kit, 'bandpass', 900, 1500, 0.6, 1.6 + strength * 1.6, 0.1 + strength * 0.16, 0.18)
  hiss(kit, 'bandpass', 2200, 2800, 1.2, 1.1 + strength, 0.03 + strength * 0.05, 0.25, 0.05)
}

function startCrowdBed(kit: Kit): void {
  const { context, output, noise } = kit
  const source = context.createBufferSource()
  source.buffer = noise
  source.loop = true
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 650
  filter.Q.value = 0.5
  const level = context.createGain()
  level.gain.value = 0.045
  const swell = context.createOscillator()
  swell.frequency.value = 0.11
  const depth = context.createGain()
  depth.gain.value = 0.015
  swell.connect(depth).connect(level.gain)
  source.connect(filter).connect(level).connect(output)
  source.start()
  swell.start()
}

function playEvent(kit: Kit, event: GameEvent): void {
  switch (event.type) {
    case 'bounce':
      thump(kit, event.speed)
      break
    case 'dribble':
      thump(kit, 2.2)
      break
    case 'squeak':
      squeak(kit)
      break
    case 'rim':
      clank(kit, event.speed)
      break
    case 'board':
      tone(kit, 'sine', 150, 80, 0.13, Math.min(0.4, 0.1 + event.speed * 0.04))
      hiss(kit, 'lowpass', 900, 300, 0.7, 0.08, 0.12)
      break
    case 'net':
      hiss(kit, 'bandpass', 2600, 800, 1.1, event.clean ? 0.3 : 0.22, event.clean ? 0.3 : 0.18)
      break
    case 'dunk':
      tone(kit, 'sine', 95, 40, 0.3, 0.6)
      clank(kit, 9)
      break
    case 'score':
      cheer(kit, event.kind === 'dunk' || event.points === 3 ? 1 : 0.5)
      break
    case 'steal':
    case 'block':
      hiss(kit, 'highpass', 1500, 900, 0.7, 0.06, 0.3)
      tone(kit, 'sine', 210, 120, 0.06, 0.2)
      cheer(kit, 0.25)
      break
    case 'pass':
      hiss(kit, 'bandpass', 700, 1600, 0.8, 0.09, 0.07)
      break
    case 'catch':
      hiss(kit, 'lowpass', 1100, 500, 0.7, 0.04, 0.12)
      break
    case 'whistle':
      whistle(kit, event.reason === 'start' ? 0.7 : 0.42)
      break
    case 'buzzer':
      buzzer(kit, event.reason === 'shotclock' ? 0.7 : 1.3)
      break
    case 'tip':
      whistle(kit, 0.5)
      break
    default:
      break
  }
}

/** 必须在用户操作（点击 PLAY）的回调里创建，浏览器才允许出声。创建失败时返回一个什么都不做的空实现。 */
export function createGameSound(): GameSound {
  let kit: Kit | null = null
  try {
    const context = new AudioContext()
    const output = context.createGain()
    output.gain.value = 0.9
    output.connect(context.destination)
    kit = { context, output, noise: makeNoise(context) }
    void context.resume()
    startCrowdBed(kit)
  } catch {
    kit = null
  }
  return {
    play: (event) => {
      // 音频设备出错或被系统挂起时不再排播，等它恢复。
      if (kit && kit.context.state === 'running') playEvent(kit, event)
    },
    chime: () => {
      if (!kit || kit.context.state !== 'running') return
      tone(kit, 'sine', 1320, 1320, 0.16, 0.1)
      tone(kit, 'sine', 1980, 1980, 0.22, 0.07, 0.05)
    },
    setMuted: (muted) => {
      if (kit) kit.output.gain.setTargetAtTime(muted ? 0 : 0.9, kit.context.currentTime, 0.05)
    },
    dispose: () => {
      void kit?.context.close()
      kit = null
    },
  }
}
