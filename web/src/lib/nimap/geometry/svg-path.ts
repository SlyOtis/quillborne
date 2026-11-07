import { EPS, type Vec2, add, sub, mul, cross, dot, length, distance } from './vector'

export interface PathStroke {
  /** The drawing command that produced this polyline, upper-cased. */
  command: string
  /** Absolute SVG coordinates; the first point is where the command started. */
  points: Vec2[]
}

export interface PathOptions {
  /** Maximum distance between a curve and its polyline, in SVG units. */
  tolerance?: number
}

const TOKEN = /[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function flattenCubic(a: Vec2, b: Vec2, c: Vec2, d: Vec2, out: Vec2[], tolerance: number, depth = 0): void {
  const v = sub(d, a)
  const den = length(v) || 1
  const dist = (q: Vec2) => Math.abs(cross(v, sub(q, a))) / den
  if (depth >= 12 || (dist(b) <= tolerance && dist(c) <= tolerance)) {
    out.push(d)
    return
  }
  const ab = mul(add(a, b), 0.5)
  const bc = mul(add(b, c), 0.5)
  const cd = mul(add(c, d), 0.5)
  const abc = mul(add(ab, bc), 0.5)
  const bcd = mul(add(bc, cd), 0.5)
  const mid = mul(add(abc, bcd), 0.5)
  flattenCubic(a, ab, abc, mid, out, tolerance, depth + 1)
  flattenCubic(mid, bcd, cd, d, out, tolerance, depth + 1)
}

function vectorAngle(u: Vec2, v: Vec2): number {
  const sign = cross(u, v) < 0 ? -1 : 1
  return sign * Math.acos(clamp(dot(u, v) / (length(u) * length(v)), -1, 1))
}

/** SVG arc (endpoint parameterization) to points, excluding the start and including the end. */
export function arcPoints(p0: Vec2, rx: number, ry: number, rotationDeg: number, largeArc: boolean, sweep: boolean, p1: Vec2, tolerance: number): Vec2[] {
  if (distance(p0, p1) < EPS) return []
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  if (rx === 0 || ry === 0) return [p1]
  const phi = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (p0[0] - p1[0]) / 2
  const dy = (p0[1] - p1[1]) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const sign = largeArc !== sweep ? 1 : -1
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1
  const coef = sign * Math.sqrt(Math.max(0, num / den))
  const cxp = (coef * rx * y1) / ry
  const cyp = (coef * -ry * x1) / rx
  const cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2
  const cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2
  const start: Vec2 = [(x1 - cxp) / rx, (y1 - cyp) / ry]
  const end: Vec2 = [(-x1 - cxp) / rx, (-y1 - cyp) / ry]
  const theta = vectorAngle([1, 0], start)
  let delta = vectorAngle(start, end)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI
  const r = Math.max(rx, ry)
  const step = tolerance >= r ? Math.PI / 2 : 2 * Math.acos(1 - tolerance / r)
  const n = clamp(Math.ceil(Math.abs(delta) / step), 1, 512)
  const out: Vec2[] = []
  for (let k = 1; k <= n; k++) {
    const t = theta + (delta * k) / n
    const x = rx * Math.cos(t)
    const y = ry * Math.sin(t)
    out.push([cos * x - sin * y + cx, sin * x + cos * y + cy])
  }
  out[out.length - 1] = p1
  return out
}

/**
 * Parses SVG path data into one polyline per drawing command, in absolute
 * SVG coordinates (y down). Curves are flattened adaptively. Every command
 * of M/L/H/V/C/S/Q/T/A/Z, absolute and relative, is supported.
 */
export function pathToStrokes(d: string, options: PathOptions = {}): PathStroke[] {
  const tolerance = options.tolerance ?? 0.25
  const tokens = d.match(TOKEN) ?? []
  const strokes: PathStroke[] = []
  let i = 0
  let command = ''
  let current: Vec2 = [0, 0]
  let start: Vec2 = [0, 0]
  let lastCubic: Vec2 | null = null
  let lastQuad: Vec2 | null = null

  const num = (): number => {
    const n = Number(tokens[i++])
    if (!Number.isFinite(n)) throw new Error(`Invalid SVG path number at token ${i - 1}.`)
    return n
  }
  const point = (relative: boolean): Vec2 => {
    const p: Vec2 = [num(), num()]
    return relative ? add(current, p) : p
  }
  const emit = (cmd: string, points: Vec2[]) => {
    if (points.length === 2 && distance(points[0], points[1]) < EPS) return
    strokes.push({ command: cmd, points })
  }
  const reflect = (control: Vec2 | null): Vec2 => (control ? sub(mul(current, 2), control) : current)

  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) command = tokens[i++]
    if (!command) throw new Error('SVG path data must start with a command.')
    const upper = command.toUpperCase()
    const relative = command !== upper
    let cubic: Vec2 | null = null
    let quad: Vec2 | null = null

    switch (upper) {
      case 'M': {
        current = point(relative)
        start = current
        command = relative ? 'l' : 'L'
        break
      }
      case 'L': {
        const q = point(relative)
        emit('L', [current, q])
        current = q
        break
      }
      case 'H': {
        const x = num()
        const q: Vec2 = [relative ? current[0] + x : x, current[1]]
        emit('H', [current, q])
        current = q
        break
      }
      case 'V': {
        const y = num()
        const q: Vec2 = [current[0], relative ? current[1] + y : y]
        emit('V', [current, q])
        current = q
        break
      }
      case 'C':
      case 'S': {
        const c1 = upper === 'C' ? point(relative) : reflect(lastCubic)
        const c2 = point(relative)
        const end = point(relative)
        const points: Vec2[] = [current]
        flattenCubic(current, c1, c2, end, points, tolerance)
        emit(upper, points)
        cubic = c2
        current = end
        break
      }
      case 'Q':
      case 'T': {
        const c: Vec2 = upper === 'Q' ? point(relative) : reflect(lastQuad)
        const end = point(relative)
        const c1 = add(current, mul(sub(c, current), 2 / 3))
        const c2 = add(end, mul(sub(c, end), 2 / 3))
        const points: Vec2[] = [current]
        flattenCubic(current, c1, c2, end, points, tolerance)
        emit(upper, points)
        quad = c
        current = end
        break
      }
      case 'A': {
        const rx = num()
        const ry = num()
        const rotation = num()
        const largeArc = num() !== 0
        const sweep = num() !== 0
        const end = point(relative)
        const points = [current, ...arcPoints(current, rx, ry, rotation, largeArc, sweep, end, tolerance)]
        emit('A', points)
        current = end
        break
      }
      case 'Z': {
        emit('Z', [current, start])
        current = start
        command = ''
        break
      }
      default:
        throw new Error(`Unsupported SVG path command: ${command}`)
    }
    lastCubic = cubic
    lastQuad = quad
  }
  return strokes
}

/** Every `d` attribute in an SVG document, in document order. */
export function extractPathData(svg: string): string[] {
  const result: string[] = []
  const pattern = /\bd\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(svg)) !== null) result.push(match[1] ?? match[2] ?? '')
  return result
}
