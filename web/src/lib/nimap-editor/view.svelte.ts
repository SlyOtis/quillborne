import type { Vec2 } from '$lib/nimap'

export interface ViewBox {
  x: number
  y: number
  width: number
  height: number
}

export class ViewState {
  viewportSize = $state.raw({ width: 800, height: 600 })
  viewBox = $state.raw<ViewBox>({ x: -1, y: -7.5, width: 14, height: 10.5 })
  scale = $derived(this.viewportSize.width / this.viewBox.width)
  viewport = $derived({ minX: this.viewBox.x, minY: -(this.viewBox.y + this.viewBox.height), maxX: this.viewBox.x + this.viewBox.width, maxY: -this.viewBox.y })

  setViewportSize(width: number, height: number) {
    if (width <= 0 || height <= 0) return
    const aspect = width / height
    this.viewportSize = { width, height }
    this.viewBox = { ...this.viewBox, height: this.viewBox.width / aspect }
  }

  fitTo(minX: number, minY: number, maxX: number, maxY: number, padding = 0.08) {
    const width = Math.max(maxX - minX, 1e-3)
    const height = Math.max(maxY - minY, 1e-3)
    const aspect = this.viewportSize.width / this.viewportSize.height
    let w = width * (1 + padding * 2)
    let h = w / aspect
    if (h < height * (1 + padding * 2)) {
      h = height * (1 + padding * 2)
      w = h * aspect
    }
    this.viewBox = { x: minX + width / 2 - w / 2, y: minY + height / 2 - h / 2, width: w, height: h }
  }

  zoomAt(svgPoint: Vec2, factor: number) {
    const v = this.viewBox
    const width = Math.min(Math.max(v.width * factor, 0.5), 5000)
    const height = width / (v.width / v.height)
    const fx = (svgPoint[0] - v.x) / v.width
    const fy = (svgPoint[1] - v.y) / v.height
    this.viewBox = { x: svgPoint[0] - fx * width, y: svgPoint[1] - fy * height, width, height }
  }

  panBy(dxPx: number, dyPx: number) {
    const v = this.viewBox
    this.viewBox = { ...v, x: v.x - dxPx / this.scale, y: v.y - dyPx / this.scale }
  }
}
