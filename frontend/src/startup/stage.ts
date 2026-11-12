// 启动页的 3D 舞台：渲染器、主循环、镜头在“自由环绕”和“停靠站点”之间的切换、指针交互、画质降档与资源释放。
import { PCFShadowMap, PerspectiveCamera, Vector2, Vector3, WebGLRenderer } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Game } from '@/game'
import type { GameCallbacks } from '@/game/hud'
import { CameraTween, applyPose, lensFor, nearestOrbit, orbitLimits, orbitPose, type Pose } from './cameraRig'
import { StationPicker } from './picker'
import { QUALITY, QualityGovernor, initialTier, type QualityStep } from './quality'
import { Pipeline } from './render/pipeline'
import { buildWorld, type World } from './scene'
import { polar } from './scene/layout'
import { STATIONS, type Station, type StationId } from './scene/stations'

export interface StageOptions {
  /** 用户开启了“减少动态效果”：不做待机动效与镜头过渡，只在画面变化时重绘。 */
  reducedMotion: boolean
  /** 显卡上下文丢失，场景无法继续显示。 */
  onLost: () => void
  /** 指针悬停的站点发生变化。 */
  onHover: (station: StationId | null) => void
  /** 悬停站点在画面上的位置（CSS 像素），每帧更新，用来摆放标签。 */
  onHoverMove: (x: number, y: number) => void
  /** 用户在场景里点选或取消了某个站点。 */
  onFocus: (station: StationId | null) => void
  /** 闪电刚刚劈下（用来触发雷声）。 */
  onThunder: () => void
}

export interface Stage {
  /** 回到初始机位。 */
  resetView: () => void
  /** 让镜头停靠到某个站点；传 null 回到自由环绕。 */
  focusStation: (station: StationId | null) => void
  /** 进入系统前的短暂推进；结束后镜头保持锁定，等待页面跳转。 */
  playEnter: (durationMs: number) => Promise<void>
  /** 跳转失败时把镜头控制还给用户。 */
  resumeControl: () => void
  /** 提前在后台把比赛场景搭好（可以多次调用）。搭的过程分成小段，不影响指挥室的画面。 */
  prepareGame: () => void
  /** 镜头俯冲进战术桌并切换到比赛场景；比赛期间不再绘制指挥室。 */
  startGame: (callbacks: GameCallbacks) => Promise<void>
  /** 结束比赛，镜头从战术桌上方拉回指挥室。 */
  stopGame: () => void
  /** 比赛中的操作：暂停/继续、重新开始、静音切换。 */
  gameCommand: (command: 'pause' | 'restart' | 'mute') => void
  /** 停止绘制并释放显卡资源。 */
  dispose: () => void
}

const RESET_MS = 800
const FOCUS_MS = 1300
const RELEASE_MS = 1000
const INTRO_MS = 3600
/** 减少动态效果时使用的固定场景时刻（秒）。 */
const STILL_TIME = 30
/** 进入比赛前，镜头先升到战术桌正上方俯视，再向桌面俯冲。 */
const TABLE_OVERHEAD: Pose = { position: new Vector3(0, 4.6, 0.55), target: new Vector3(0, 0.9, 0) }
const TABLE_DIVE: Pose = { position: new Vector3(0, 2.5, 0.3), target: new Vector3(0, 0.9, 0) }
const DIVE_MS = 520
/** 俯冲到底时画面过曝的倍数：冲进全息球场的光里，再从一片白里显出球馆。 */
const GLARE = 26
/** 按下后移动超过这个像素数就算拖动，不算点击。 */
const DRAG_PIXELS = 7

/** 开场镜头：贴近桌面、从全息球场后方看向落地窗，随后拉升到初始机位。 */
const INTRO_POSE: Pose = { position: polar((270 * Math.PI) / 180, 4.5, 1.42), target: orbitLimits.target.clone().setY(1.15) }

class StartupStage implements Stage {
  private readonly camera = new PerspectiveCamera(55, 1, 0.2, 2600)
  private readonly controls: OrbitControls
  private readonly world: World
  private readonly pipeline: Pipeline
  private readonly picker: StationPicker
  private readonly tween = new CameraTween()
  private readonly governor: QualityGovernor
  private readonly resizeObserver: ResizeObserver
  private readonly bufferSize = new Vector2()
  /** 镜头当前看向的点。 */
  private readonly look = orbitLimits.target.clone()
  private readonly pointer = { x: 0, y: 0, downX: 0, downY: 0, down: false, dragged: false, inside: false }
  private station: Station | null = null
  private hovered: Station | null = null
  private game: Game | null = null
  /** 后台搭好（或正在搭）的比赛；退出比赛后留着，下次直接进入。 */
  private prepared: Promise<Game> | null = null
  /** 当前画面过曝的倍数，以及俯冲开始的时刻（没有在俯冲时为 0）。 */
  private glare = 0
  private diveStartedAt = 0
  private pixelRatio: number
  private mirrorScale: number
  private frame = 0
  private lastFrameAt = 0
  private elapsed = 0
  private locked = false
  private disposed = false

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly host: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly options: StageOptions,
  ) {
    const profile = QUALITY[initialTier()]
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, profile.pixelRatio)
    this.mirrorScale = profile.mirrorScale
    renderer.setPixelRatio(this.pixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFShadowMap
    // 场景里投影的物体都是静止的，阴影只需要算一次。
    renderer.shadowMap.autoUpdate = false

    this.world = buildWorld(renderer, { ...profile, still: options.reducedMotion })
    // 减少动态效果时场景时间不再推进：直接从“全息投影已经开机”的时刻取一帧。
    if (options.reducedMotion) this.elapsed = STILL_TIME
    this.pipeline = new Pipeline(renderer, profile)
    this.picker = new StationPicker(this.camera, STATIONS)
    this.controls = this.createControls()
    this.governor = new QualityGovernor(this.qualitySteps())

    this.resize()
    applyPose(this.camera, this.homePose())
    this.controls.update()
    this.world.update(this.elapsed, 0)
    renderer.shadowMap.needsUpdate = true
    this.world.setEnvironment(this.pipeline.captureEnvironment(this.world))
    this.playIntro()
    this.renderOnce()

    this.resizeObserver = new ResizeObserver(() => {
      this.resize()
      this.renderOnce()
    })
    this.resizeObserver.observe(host)
    document.addEventListener('visibilitychange', this.onVisibility)
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    host.addEventListener('wheel', this.onWheel, { capture: true, passive: true })
    if (options.reducedMotion) this.controls.addEventListener('change', this.renderOnce)
    this.start()
  }

  resetView(): void {
    if (this.disposed || this.locked) return
    this.setStation(null)
    this.glide(this.homePose(), RESET_MS, this.freeCamera)
  }

  focusStation(id: StationId | null): void {
    if (this.disposed || this.locked) return
    const next = STATIONS.find((station) => station.id === id) ?? null
    if (next === this.station) return
    this.setStation(next)
    if (next) this.glide({ position: next.camera, target: next.focus }, FOCUS_MS)
    else this.glide(orbitPose(nearestOrbit(this.camera.position)), RELEASE_MS, this.freeCamera)
  }

  playEnter(durationMs: number): Promise<void> {
    if (this.disposed || this.options.reducedMotion) return Promise.resolve()
    this.locked = true
    // 只沿视线朝正在看的东西推近一小段，所以从任何机位进入都不会穿过桌子或墙。
    const position = this.camera.position.clone().lerp(this.look, 0.16)
    return new Promise((resolve) => this.glide({ position, target: this.look.clone() }, durationMs, resolve))
  }

  resumeControl(): void {
    this.locked = false
    if (!this.tween.active && !this.station) this.controls.enabled = true
  }

  prepareGame(): void {
    if (this.disposed || this.prepared) return
    const breathe = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))
    const building = import('@/game').then(({ Game }) => Game.create(this.renderer, this.world.kit, this.options.reducedMotion, breathe))
    this.prepared = building
    // 搭建失败就忘掉这次尝试，下次进入时重新来。
    building.catch(() => {
      if (this.prepared === building) this.prepared = null
    })
  }

  async startGame(callbacks: GameCallbacks): Promise<void> {
    if (this.disposed || this.game || this.locked) return
    this.locked = true
    this.setStation(null)
    this.updateHover()
    this.prepareGame()
    try {
      await new Promise<void>((resolve) => this.glide(TABLE_OVERHEAD, 1200, resolve))
      // 球馆通常在镜头到位之前就搭好了；还没好的话镜头停在桌面上方等它，画面照常在动。
      const game = await this.prepared!
      if (this.disposed) return
      this.diveStartedAt = performance.now()
      await new Promise<void>((resolve) => this.glide(TABLE_DIVE, DIVE_MS, resolve))
      if (this.disposed) return
      game.begin(callbacks)
      game.setAspect(this.camera.aspect)
      this.game = game
      this.diveStartedAt = 0
      this.glare = this.options.reducedMotion ? 0 : GLARE
      // 减少动态效果时平常不跑循环，但比赛必须逐帧推进。
      this.start()
    } catch (error) {
      this.diveStartedAt = 0
      this.locked = false
      throw error
    }
  }

  stopGame(): void {
    if (!this.game) return
    this.game.end()
    this.game = null
    this.glare = 0
    this.pipeline.grade.pass.uniforms.uFlash.value = 0
    // 指挥室的阴影只算一次；比赛期间被球场的阴影覆盖过，回来后重算。
    this.renderer.shadowMap.needsUpdate = true
    this.locked = false
    applyPose(this.camera, TABLE_OVERHEAD)
    this.look.copy(TABLE_OVERHEAD.target)
    this.glide(this.homePose(), 1700, this.freeCamera)
    if (this.options.reducedMotion) this.stop()
  }

  gameCommand(command: 'pause' | 'restart' | 'mute'): void {
    if (command === 'pause') this.game?.togglePause()
    else if (command === 'restart') this.game?.restart()
    else this.game?.toggleMute()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stop()
    this.game = null
    void this.prepared?.then((game) => game.dispose()).catch(() => undefined)
    this.prepared = null
    this.tween.cancel()
    this.resizeObserver.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.host.removeEventListener('wheel', this.onWheel, { capture: true })
    this.controls.dispose()
    this.world.dispose()
    this.pipeline.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }

  private createControls(): OrbitControls {
    const controls = new OrbitControls(this.camera, this.canvas)
    controls.target.copy(orbitLimits.target)
    controls.enablePan = false
    controls.enableDamping = !this.options.reducedMotion
    controls.dampingFactor = 0.09
    controls.rotateSpeed = 0.55
    controls.zoomSpeed = 0.7
    controls.minDistance = orbitLimits.minDistance
    controls.maxDistance = orbitLimits.maxDistance
    controls.minPolarAngle = orbitLimits.minPolar
    controls.maxPolarAngle = orbitLimits.maxPolar
    return controls
  }

  /** 由轻到重的降档顺序：先降分辨率，再降倒影、关遮蔽，最后关掉倒影并继续降分辨率。 */
  private qualitySteps(): QualityStep[] {
    const lowerTo = (ratio: number): QualityStep => () => {
      if (this.pixelRatio <= ratio) return false
      this.pixelRatio = ratio
      this.renderer.setPixelRatio(ratio)
      this.resize()
      return true
    }
    const mirrorTo = (scale: number): QualityStep => () => {
      if (this.mirrorScale <= scale) return false
      this.mirrorScale = scale
      this.pipeline.setMirrorScale(scale)
      return true
    }
    const dropOcclusion: QualityStep = () => this.pipeline.disableOcclusion()
    return [lowerTo(1.5), lowerTo(1.25), mirrorTo(0.35), dropOcclusion, lowerTo(1), mirrorTo(0), lowerTo(0.8)]
  }

  private homePose(): Pose {
    return orbitPose(lensFor(this.camera.aspect).home)
  }

  /** 开场：从贴近桌面的低机位拉升到初始机位，期间不接受拖动。减少动态效果时跳过。 */
  private playIntro(): void {
    if (this.options.reducedMotion) return
    applyPose(this.camera, INTRO_POSE)
    this.look.copy(INTRO_POSE.target)
    this.glide(this.homePose(), INTRO_MS, this.freeCamera)
  }

  /** 把镜头平滑移到指定机位；减少动态效果时直接到位。期间关闭拖动。 */
  private glide(to: Pose, durationMs: number, done?: () => void): void {
    this.settleInertia()
    this.controls.enabled = false
    const from: Pose = { position: this.camera.position.clone(), target: this.look.clone() }
    this.tween.begin(from, to, this.options.reducedMotion ? 0 : durationMs, performance.now(), done)
    if (this.frame === 0) this.advance(performance.now())
  }

  /** 镜头回到自由环绕后，把拖动控制还给用户。 */
  private readonly freeCamera = (): void => {
    this.look.copy(orbitLimits.target)
    this.controls.enabled = !this.locked && !this.station
  }

  /** 清掉拖动留下的惯性，否则过渡结束后镜头还会继续滑一下。 */
  private settleInertia(): void {
    if (!this.controls.enabled) return
    const position = this.camera.position.clone()
    this.controls.enableDamping = false
    this.controls.update()
    this.controls.enableDamping = !this.options.reducedMotion
    this.camera.position.copy(position)
    this.camera.lookAt(this.look)
  }

  private setStation(station: Station | null): void {
    this.station = station
    this.refreshMarker()
  }

  /** 光环优先跟着指针悬停的站点，其次是镜头停靠的站点。 */
  private refreshMarker(): void {
    this.world.setMarker(this.hovered ?? this.station, this.options.reducedMotion)
  }

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth)
    const height = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(width, height, false)
    this.renderer.getDrawingBufferSize(this.bufferSize)
    this.pipeline.setSize(this.bufferSize.x, this.bufferSize.y)
    this.world.setViewport(this.bufferSize.x, this.bufferSize.y, this.pixelRatio)
    this.camera.aspect = width / height
    this.camera.fov = lensFor(this.camera.aspect).fov
    this.camera.updateProjectionMatrix()
    this.game?.setAspect(this.camera.aspect)
  }

  private start(): void {
    if (this.frame !== 0 || this.disposed || document.hidden) return
    if (this.options.reducedMotion && !this.game) return
    this.lastFrameAt = performance.now()
    this.frame = requestAnimationFrame(this.tick)
  }

  private stop(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  /** 推进镜头并绘制一帧。 */
  private advance(now: number): void {
    const target = this.tween.step(this.camera, now)
    if (target) this.look.copy(target)
    else if (this.controls.enabled) this.controls.update()
    this.reportHover()
    this.renderOnce()
  }

  private readonly tick = (now: number): void => {
    this.frame = requestAnimationFrame(this.tick)
    const frameMs = now - this.lastFrameAt
    this.lastFrameAt = now
    const delta = Math.min(frameMs, 100) / 1000
    this.elapsed += delta
    if (this.game) {
      // 比赛模式：只推进并绘制比赛场景；球员的影子每帧都要重算。
      this.renderer.shadowMap.needsUpdate = true
      this.glare *= Math.exp(-delta * 4.2)
      this.pipeline.grade.pass.uniforms.uFlash.value = this.glare
      this.game.frame(delta, this.host.clientWidth, this.host.clientHeight)
      this.pipeline.renderLite(this.game.view, this.elapsed)
      this.governor.sample(frameMs)
      return
    }
    const lightning = this.world.update(this.elapsed, delta)
    // 闪电的一瞬间整个画面也跟着亮一下，像镜头来不及收光。
    const dive = this.diveStartedAt > 0 && !this.options.reducedMotion ? Math.min(1, (now - this.diveStartedAt) / DIVE_MS) : 0
    this.pipeline.grade.pass.uniforms.uFlash.value = lightning.level * 0.1 + GLARE * dive * dive * dive
    if (lightning.struck) this.options.onThunder()
    this.advance(now)
    this.governor.sample(frameMs)
  }

  private readonly renderOnce = (): void => {
    if (this.disposed) return
    if (this.game) this.pipeline.renderLite(this.game.view, this.elapsed)
    else this.pipeline.render(this.world, this.camera, this.elapsed)
  }

  /** 重新判断指针对准了哪个站点；拖动中、镜头锁定时不判断。 */
  private updateHover(): void {
    const pickable = this.pointer.inside && !this.pointer.dragged && !this.locked && !this.game
    const rect = this.canvas.getBoundingClientRect()
    const x = ((this.pointer.x - rect.left) / rect.width) * 2 - 1
    const y = 1 - ((this.pointer.y - rect.top) / rect.height) * 2
    const next = pickable ? this.picker.pick(x, y) : null
    if (next === this.hovered) return
    this.hovered = next
    this.canvas.style.cursor = next ? 'pointer' : ''
    this.refreshMarker()
    this.options.onHover(next?.id ?? null)
    this.reportHover()
    if (this.frame === 0) this.renderOnce()
  }

  private reportHover(): void {
    if (!this.hovered) return
    const spot = this.picker.locate(this.hovered, this.host.clientWidth, this.host.clientHeight)
    if (spot) this.options.onHoverMove(spot.x, spot.y)
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    Object.assign(this.pointer, { x: event.clientX, y: event.clientY, downX: event.clientX, downY: event.clientY, down: true, dragged: false, inside: true })
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.pointer.x = event.clientX
    this.pointer.y = event.clientY
    this.pointer.inside = true
    if (this.pointer.down && !this.pointer.dragged && Math.hypot(event.clientX - this.pointer.downX, event.clientY - this.pointer.downY) > DRAG_PIXELS) {
      this.pointer.dragged = true
      // 镜头停靠在站点时，一拖动就回到自由环绕。
      if (this.station && !this.locked) {
        this.focusStation(null)
        this.options.onFocus(null)
      }
    }
    this.updateHover()
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const clicked = this.pointer.down && !this.pointer.dragged
    this.pointer.down = false
    this.pointer.dragged = false
    this.pointer.inside = event.pointerType === 'mouse'
    if (clicked && !this.locked) this.handleClick(event)
    this.updateHover()
  }

  private readonly onPointerLeave = (): void => {
    this.pointer.inside = false
    this.pointer.down = false
    this.pointer.dragged = false
    this.updateHover()
  }

  /** 点击：点到站点就停靠过去（再点一次战术桌则切换战术），点到空处则回到自由环绕。 */
  private handleClick(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    const hit = this.picker.pick(((event.clientX - rect.left) / rect.width) * 2 - 1, 1 - ((event.clientY - rect.top) / rect.height) * 2)
    if (hit && hit === this.station) {
      if (hit.id === 'assistant') this.world.nextPlay()
      return
    }
    if (!hit && !this.station) return
    this.focusStation(hit?.id ?? null)
    this.options.onFocus(hit?.id ?? null)
  }

  /** 页面切到后台时停止绘制，回来再继续。 */
  private readonly onVisibility = (): void => {
    if (document.hidden) this.stop()
    else this.start()
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault()
    this.options.onLost()
  }

  /** Ctrl / ⌘ + 滚轮留给浏览器做页面缩放，不让场景缩放把它拦下。 */
  private readonly onWheel = (event: WheelEvent): void => {
    if (event.ctrlKey || event.metaKey) event.stopPropagation()
  }
}

/** 在指定画布上搭建并启动场景；浏览器不支持 WebGL 或搭建失败时抛出异常，由调用方转入降级显示。 */
export function createStage(host: HTMLElement, canvas: HTMLCanvasElement, options: StageOptions): Stage {
  // 抗锯齿在管线内部的渲染目标上做，屏幕缓冲区只接收最终画面，不需要再开一遍。
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  try {
    return new StartupStage(renderer, host, canvas, options)
  } catch (error) {
    renderer.dispose()
    renderer.forceContextLoss()
    throw error
  }
}
