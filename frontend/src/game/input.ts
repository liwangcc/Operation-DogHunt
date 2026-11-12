// 比赛输入：把键盘和手柄的状态整理成“这一帧玩家想做什么”，并分辨出按键是刚按下还是刚松开。
import type { Intent } from './sim/types'

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
}
const SHOOT = ['KeyJ', 'Space']
const PASS = ['KeyK']
const STEAL = ['KeyL']
const SPRINT = ['ShiftLeft', 'ShiftRight']
/** 这些键在比赛中有用途，不能再触发浏览器的滚动等默认行为。 */
const CAPTURED = new Set([...Object.keys(MOVE_KEYS), ...SHOOT, ...PASS, ...STEAL])
const STICK_DEADZONE = 0.2

export class GameInput {
  private readonly held = new Set<string>()
  /** 上一帧各动作键是否按着，用来判断“刚按下”和“刚松开”。 */
  private previous = { shoot: false, pass: false, steal: false }

  /**
   * @param onPause 按下 Esc（或手柄 Start）
   * @param onMute 按下 M
   */
  constructor(private readonly onPause: () => void, private readonly onMute: () => void) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
  }

  /** 读取当前输入。每帧调用一次；“刚按下 / 刚松开”只在这一次返回中为 true。 */
  sample(): Intent {
    let moveX = 0
    let moveZ = 0
    for (const [code, [x, z]] of Object.entries(MOVE_KEYS)) {
      if (!this.held.has(code)) continue
      moveX += x
      moveZ += z
    }
    const pad = this.readGamepad()
    if (pad && Math.hypot(pad.x, pad.z) > STICK_DEADZONE) {
      moveX = pad.x
      moveZ = pad.z
    }
    const length = Math.hypot(moveX, moveZ)
    if (length > 1) {
      moveX /= length
      moveZ /= length
    }
    const any = (codes: string[]) => codes.some((code) => this.held.has(code))
    const now = { shoot: any(SHOOT) || !!pad?.shoot, pass: any(PASS) || !!pad?.pass, steal: any(STEAL) || !!pad?.steal }
    const intent: Intent = {
      moveX, moveZ,
      sprint: any(SPRINT) || !!pad?.sprint,
      shootHeld: now.shoot,
      shootPressed: now.shoot && !this.previous.shoot,
      shootReleased: !now.shoot && this.previous.shoot,
      passPressed: now.pass && !this.previous.pass,
      stealPressed: now.steal && !this.previous.steal,
    }
    this.previous = now
    return intent
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
  }

  private startHeld = false

  /** 手柄：左摇杆移动，X 投篮，A 传球，B 抢断，右扳机或右肩键加速，Start 暂停。 */
  private readGamepad(): { x: number; z: number; shoot: boolean; pass: boolean; steal: boolean; sprint: boolean } | null {
    const pad = navigator.getGamepads?.().find((candidate) => candidate && candidate.connected)
    if (!pad) return null
    const pressed = (index: number) => !!pad.buttons[index]?.pressed
    const start = pressed(9)
    if (start && !this.startHeld) this.onPause()
    this.startHeld = start
    return { x: pad.axes[0] ?? 0, z: pad.axes[1] ?? 0, shoot: pressed(2), pass: pressed(0), steal: pressed(1), sprint: pressed(7) || pressed(5) }
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' && !event.repeat) this.onPause()
    if (event.code === 'KeyM' && !event.repeat) this.onMute()
    if (!CAPTURED.has(event.code) && !SPRINT.includes(event.code)) return
    // 焦点在按钮上时，空格要留给按钮本身。
    if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return
    this.held.add(event.code)
    if (CAPTURED.has(event.code)) event.preventDefault()
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code)
  }

  /** 窗口失去焦点时收不到松键事件，全部当作松开，避免球员自己一直跑。 */
  private readonly onBlur = (): void => {
    this.held.clear()
  }
}
