import { AmbientLight, Box3, Color, DirectionalLight, Group, HemisphereLight, OrthographicCamera, PCFShadowMap, Raycaster, Scene, Vector2, Vector3, WebGLRenderer, type Object3D, type Ray } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { SLATE_LOOK, PALETTE, type MapLight } from './materials'
import { lightsOf, type Light } from './style'

export interface SessionOptions {
  /** Shadows cost a full extra pass; off for the smallest devices. */
  shadows?: boolean
  /** Device pixel ratio cap; two is plenty for a wall panel. */
  maxPixelRatio?: number
  /** Whether the view can be dragged; a wall panel only auto-rotates. */
  interactive?: boolean
  /** How the scene is lit, as a look's light (`lightsOf`); `lights` instead gives the whole list. Slate's when both are left out. */
  light?: MapLight
  /** Whether the host paints what is behind the scene; the map's own ground colour when left out. */
  clear?: boolean
  /** Where the camera looks from; the lobby look's when left out. */
  view?: CameraView
  /** The scene's lights (a style's `lights`), in place of `light`. */
  lights?: Light[]
}

export interface RenderSession {
  readonly scene: Scene
  readonly camera: OrthographicCamera
  readonly renderer: WebGLRenderer
  readonly controls: OrbitControls
  /** Adds to the scene and asks for a frame with the shadows redrawn, since what casts them changed. */
  add(object: Object3D): void
  /** Removes from the scene and asks for a frame with the shadows redrawn. */
  remove(object: Object3D): void
  /** Frames a box from the standard viewing direction, inside the view less `reserve` (screen pixels kept free on each side, such as for labels); also where the lights aim. Given `points`, such as a level's outline, what is framed is what they cover on screen, tighter than the box's corners. */
  fit(box: Box3, margin?: number, reserve?: Reserve, points?: [number, number, number][]): void
  resize(width: number, height: number): void
  /** Asks for a frame; the scene changed when `shadows` is set, so the shadow map is redrawn too. */
  invalidate(shadows?: boolean): void
  /** Screen pixels of a scene point for the last frame's camera. */
  project(position: [number, number, number]): [number, number]
  /** The ray into the scene through a point on the canvas, in its own pixels from the top-left, for picking. */
  rayAt(x: number, y: number): Ray
  /** Called after every frame, for overlays that follow the scene. */
  onRender(listener: () => void): () => void
  /** Draws frames while `step` returns true, calling it with the frame's time before each; for fades, not for anything that moves, so the shadow map is kept. */
  animate(step: (now: number) => boolean): void
  setAutoRotate(on: boolean): void
  /** Turns the key light, and the shadows it casts, to come from another direction. */
  setKeyLight(light: KeyLight): void
  /** Lights the scene with another light (`SessionOptions.light`), the key keeping its direction. */
  setLight(light: MapLight): void
  /** Lights the scene with these lights in place of all it had. */
  setLights(lights: Light[]): void
  /** Looks from another direction, framing again what was framed last. */
  setView(view: CameraView): void
  /** Where the camera is now: looking from which way, how much nearer than the framing, at which scene point. */
  cameraState(): CameraState
  /** Moves the camera, easing every value left out or given to where it is asked to be over `duration` milliseconds (0 jumps); done when it arrives, or when a hand or another move takes over. */
  moveCamera(to: Partial<CameraState>, duration?: number): Promise<void>
  /** Moves back to what was framed last, from its own direction, nearness undone. */
  home(duration?: number): Promise<void>
  dispose(): void
}


/** Screen pixels kept free along each edge of the view when framing. */
export interface Reserve {
  left: number
  right: number
  top: number
  bottom: number
}

/** Where the key light comes from: a compass bearing in degrees, clockwise from north, and a height above the horizon in degrees. */
export interface KeyLight {
  azimuth: number
  elevation: number
}

/** Where the camera looks from, in degrees: turned from the south toward the west, and down from the horizon. */
export interface CameraView {
  turn: number
  down: number
}

/** Where the camera stands: looking from `turn` and `down` (`CameraView`), `zoom` times nearer than the framing, at `target` in the scene. */
export interface CameraState extends CameraView {
  zoom: number
  target: [number, number, number]
}

/** How long a camera move takes when the host does not say, in milliseconds. */
const MOVE_MS = 600

/** The view a direction from what is looked at toward the camera stands for: `cameraDirection` read back. */
export function viewOf(direction: Vector3): CameraView {
  return { turn: Math.atan2(-direction.x, direction.z) * DEGREES, down: Math.asin(Math.max(-1, Math.min(1, direction.y))) * DEGREES }
}

/** Where a turn from `from` toward `to` ends, the shorter way round: within half a turn of `from`. */
export const turnToward = (from: number, to: number) => from + ((((to - from) % 360) + 540) % 360) - 180

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** The width and height a box covers as the camera sees it, so a fit is snug in the view rather than to the box's own axes. */
function projectedExtent(box: Box3, camera: OrthographicCamera): { width: number; height: number } {
  const inverse = camera.matrixWorldInverse
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const corner = new Vector3()
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corner.set(x, y, z).applyMatrix4(inverse)
        minX = Math.min(minX, corner.x)
        maxX = Math.max(maxX, corner.x)
        minY = Math.min(minY, corner.y)
        maxY = Math.max(maxY, corner.y)
      }
    }
  }
  return { width: maxX - minX, height: maxY - minY }
}

const DEGREES = 180 / Math.PI

/** The lobby look's viewing direction: from the south-west, high. */
const VIEW_DIRECTION = new Vector3(-0.58, 0.76, 0.7).normalize()

/** Which way across the plan the viewer stands, in the document's frame: a thing whose front faces this faces the camera. */
/** The lobby look's view, about 40° round from the south and 40° down. */
export const LOBBY_VIEW: CameraView = {
  turn: Math.atan2(-VIEW_DIRECTION.x, VIEW_DIRECTION.z) * DEGREES,
  down: Math.asin(VIEW_DIRECTION.y) * DEGREES
}

/** True isometric: every axis of the plan and height drawn at the same scale, 45° round and about 35.26° down. */
export const ISOMETRIC_VIEW: CameraView = { turn: 45, down: Math.atan(Math.SQRT1_2) * DEGREES }

export const TOWARD_VIEWER: [number, number] = [VIEW_DIRECTION.x / Math.hypot(VIEW_DIRECTION.x, VIEW_DIRECTION.z), -VIEW_DIRECTION.z / Math.hypot(VIEW_DIRECTION.x, VIEW_DIRECTION.z)]
const CAMERA_DISTANCE = 100

/** The unit vector from what is framed toward the camera, for a view. */
export function cameraDirection({ turn, down }: CameraView): Vector3 {
  const t = turn / DEGREES
  const d = down / DEGREES
  return new Vector3(-Math.sin(t) * Math.cos(d), Math.sin(d), Math.cos(t) * Math.cos(d))
}
/** The lobby look's key light: from a little west of north, high enough for long shadows falling south; the fill from the south-west, low. */
const KEY_DIRECTION = new Vector3(-4, 30, -18).normalize()


/** The lobby look's key light as a bearing and a height, for controls that turn it. */
export const KEY_LIGHT: KeyLight = {
  azimuth: (Math.atan2(KEY_DIRECTION.x, -KEY_DIRECTION.z) * DEGREES + 360) % 360,
  elevation: Math.asin(KEY_DIRECTION.y) * DEGREES
}

/** The unit vector toward a light from where it shines: the scene's north is negative z, east positive x. */
export function lightDirection({ azimuth, elevation }: KeyLight): Vector3 {
  const a = azimuth / DEGREES
  const e = elevation / DEGREES
  return new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e))
}
const LIGHT_DISTANCE = 40

/** The light that casts shadows, else the first directional one: what `setKeyLight` turns. */
const keyIndex = (lights: Light[]) => {
  const shadowed = lights.findIndex(l => l.type === 'directional' && l.shadows)
  return shadowed >= 0 ? shadowed : lights.findIndex(l => l.type === 'directional')
}
const keyOf = (lights: Light[]): KeyLight | null => {
  const l = lights[keyIndex(lights)]
  return l?.type === 'directional' ? l.direction : null
}

/**
 * Renderer, camera, lights and the on-demand loop, on a canvas. Nothing
 * here knows what a level is; hosts add the groups a level builder returns.
 * A frame is drawn only when asked for, and while the controls settle.
 */
export function createRenderSession(canvas: HTMLCanvasElement, options: SessionOptions = {}): RenderSession {
  const shadows = options.shadows ?? true
  const clear = !!options.clear
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: clear })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxPixelRatio ?? 2))
  renderer.shadowMap.enabled = shadows
  renderer.shadowMap.type = PCFShadowMap
  renderer.shadowMap.autoUpdate = false

  const scene = new Scene()
  scene.background = clear ? null : new Color(PALETTE.background)
  const aimed = new Vector3()
  let span = 20
  const rig = new Group()
  scene.add(rig)
  let lights: Light[] = []
  /** Each directional light where its direction says, aimed at what was framed, a shadow caster's camera covering the framed span. */
  const place = () => {
    for (const object of rig.children) {
      if (!(object instanceof DirectionalLight)) continue
      const direction = object.userData.direction as KeyLight
      object.position.copy(aimed).addScaledVector(lightDirection(direction), LIGHT_DISTANCE)
      object.target.position.copy(aimed)
      if (!object.castShadow) continue
      const camera = object.shadow.camera
      camera.left = -span
      camera.right = span
      camera.top = span
      camera.bottom = -span
      camera.near = 1
      camera.far = 80
      camera.updateProjectionMatrix()
    }
  }
  const light = (next: Light[]) => {
    for (const object of [...rig.children]) {
      rig.remove(object)
      if (object instanceof DirectionalLight) object.shadow.map?.dispose()
    }
    lights = next
    for (const l of next) {
      if (l.type === 'hemisphere') rig.add(new HemisphereLight(new Color(l.sky), new Color(l.ground), l.intensity))
      else if (l.type === 'ambient') rig.add(new AmbientLight(new Color(l.color), l.intensity))
      else {
        const directional = new DirectionalLight(new Color(l.color), l.intensity)
        directional.userData.direction = l.direction
        directional.castShadow = shadows && !!l.shadows
        directional.shadow.mapSize.set(2048, 2048)
        directional.shadow.normalBias = 0.035
        directional.shadow.bias = -0.00015
        rig.add(directional, directional.target)
      }
    }
    place()
  }
  const fromLight = (l: MapLight) => lightsOf(l, keyOf(lights) ?? KEY_LIGHT)
  light(options.lights ?? fromLight(options.light ?? SLATE_LOOK.light))

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000)
  let looking = options.view ? cameraDirection(options.view) : VIEW_DIRECTION.clone()
  let framed: Parameters<RenderSession['fit']> | null = null
  let viewHeight = 20
  let aspect = 1
  /** Where the framed box's centre sits, as a share of the view off its middle: right and up are positive. */
  let shift = { x: 0, y: 0 }
  /** Where the framed points' middle lies off the camera's axis, in the view's own units. */
  let aim = { x: 0, y: 0 }
  const frame = () => {
    const dx = shift.x * viewHeight * aspect - aim.x
    const dy = shift.y * viewHeight - aim.y
    camera.top = viewHeight / 2 - dy
    camera.bottom = -viewHeight / 2 - dy
    camera.left = (-viewHeight * aspect) / 2 - dx
    camera.right = (viewHeight * aspect) / 2 - dx
    camera.updateProjectionMatrix()
  }

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.autoRotateSpeed = 0.5
  controls.enabled = options.interactive ?? true
  controls.maxPolarAngle = Math.PI / 2 - 0.03

  const listeners = new Set<() => void>()
  const steps = new Set<(now: number) => boolean>()
  let pending = false
  let settling = false
  const draw = (now: number) => {
    pending = false
    for (const step of [...steps]) if (!step(now)) steps.delete(step)
    const moving = controls.update()
    renderer.render(scene, camera)
    for (const l of listeners) l()
    if (moving || settling || controls.autoRotate || steps.size) request()
    settling = false
  }
  const request = () => {
    if (pending) return
    pending = true
    requestAnimationFrame(draw)
  }
  controls.addEventListener('change', () => {
    settling = true
    request()
  })

  /** The move in progress, ended early when a hand or another move takes over. */
  let moving: { step: (now: number) => boolean; done: () => void } | null = null
  const endMove = () => {
    if (!moving) return
    steps.delete(moving.step)
    const { done } = moving
    moving = null
    controls.enabled = options.interactive ?? true
    done()
  }
  controls.addEventListener('start', endMove)
  const stand = (state: CameraState) => {
    const target = new Vector3(...state.target)
    camera.position.copy(target).addScaledVector(cameraDirection(state), CAMERA_DISTANCE)
    camera.zoom = state.zoom
    camera.lookAt(target)
    camera.updateProjectionMatrix()
    controls.target.copy(target)
  }
  const current = (): CameraState => {
    const offset = camera.position.clone().sub(controls.target).normalize()
    return { ...viewOf(offset), zoom: camera.zoom, target: [controls.target.x, controls.target.y, controls.target.z] }
  }
  let homeState: CameraState | null = null
  const move = (to: Partial<CameraState>, duration = MOVE_MS): Promise<void> => {
    endMove()
    const from = current()
    const end: CameraState = { ...from, ...to }
    const turn = turnToward(from.turn, end.turn)
    if (duration <= 0) {
      stand(end)
      controls.update()
      request()
      return Promise.resolve()
    }
    return new Promise(resolve => {
      const start = performance.now()
      const step = (now: number) => {
        const k = easeInOut(Math.min(1, (now - start) / duration))
        const at = (a: number, b: number) => a + (b - a) * k
        stand({
          turn: at(from.turn, turn),
          down: at(from.down, end.down),
          zoom: from.zoom * Math.pow(end.zoom / from.zoom, k),
          target: [at(from.target[0], end.target[0]), at(from.target[1], end.target[1]), at(from.target[2], end.target[2])]
        })
        if (k < 1) return true
        moving = null
        controls.enabled = options.interactive ?? true
        controls.update()
        resolve()
        return false
      }
      controls.enabled = false
      moving = { step, done: resolve }
      steps.add(step)
      request()
    })
  }

  const size = { width: 1, height: 1 }
  const projected = new Vector3()

  return {
    scene,
    camera,
    renderer,
    controls,
    add(object) {
      scene.add(object)
      this.invalidate(true)
    },
    remove(object) {
      scene.remove(object)
      this.invalidate(true)
    },
    fit(box, margin = 1.2, reserve = { left: 0, right: 0, top: 0, bottom: 0 }, points) {
      endMove()
      framed = [box, margin, reserve, points]
      const centre = box.getCenter(new Vector3())
      const extent = box.getSize(new Vector3())
      camera.zoom = 1
      camera.position.copy(centre).addScaledVector(looking, CAMERA_DISTANCE)
      camera.lookAt(centre)
      camera.updateMatrixWorld()
      let seen = projectedExtent(box, camera)
      aim = { x: 0, y: 0 }
      if (points?.length) {
        const at = new Vector3()
        let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity]
        for (const p of points) {
          at.set(p[0], p[1], p[2]).applyMatrix4(camera.matrixWorldInverse)
          minX = Math.min(minX, at.x)
          maxX = Math.max(maxX, at.x)
          minY = Math.min(minY, at.y)
          maxY = Math.max(maxY, at.y)
        }
        seen = { width: maxX - minX, height: maxY - minY }
        aim = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
      }
      const free = { width: Math.max(1, size.width - reserve.left - reserve.right), height: Math.max(1, size.height - reserve.top - reserve.bottom) }
      viewHeight = Math.max((seen.height * size.height) / free.height, (seen.width * size.height) / free.width, 1) * margin
      shift = { x: (reserve.left - reserve.right) / 2 / size.width, y: (reserve.bottom - reserve.top) / 2 / size.height }
      frame()
      controls.target.copy(centre)
      controls.update()
      homeState = { ...viewOf(looking), zoom: 1, target: [centre.x, centre.y, centre.z] }
      span = Math.max(extent.x, extent.z) * 0.75 + 5
      aimed.copy(centre)
      place()
      this.invalidate(true)
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) return
      size.width = width
      size.height = height
      aspect = width / height
      renderer.setSize(width, height, false)
      frame()
      request()
    },
    invalidate(shadowsToo = false) {
      if (shadowsToo) renderer.shadowMap.needsUpdate = true
      request()
    },
    rayAt(x, y) {
      const caster = new Raycaster()
      caster.setFromCamera(new Vector2((x / size.width) * 2 - 1, 1 - (y / size.height) * 2), camera)
      return caster.ray
    },
    project(position) {
      projected.set(position[0], position[1], position[2]).project(camera)
      return [((projected.x + 1) / 2) * size.width, ((1 - projected.y) / 2) * size.height]
    },
    animate(step) {
      steps.add(step)
      request()
    },
    onRender(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setAutoRotate(on) {
      controls.autoRotate = on
      request()
    },
    setKeyLight(direction) {
      const at = keyIndex(lights)
      if (at < 0) return
      light(lights.map((l, i) => (i === at && l.type === 'directional' ? { ...l, direction } : l)))
      this.invalidate(true)
    },
    setLight(next) {
      light(fromLight(next))
      this.invalidate(true)
    },
    setLights(next) {
      light(next)
      this.invalidate(true)
    },
    setView(view) {
      looking = cameraDirection(view)
      if (framed) this.fit(...framed)
    },
    cameraState: current,
    moveCamera: move,
    home(duration) {
      return homeState ? move(homeState, duration) : Promise.resolve()
    },
    dispose() {
      endMove()
      controls.dispose()
      renderer.dispose()
      listeners.clear()
      steps.clear()
    }
  }
}
