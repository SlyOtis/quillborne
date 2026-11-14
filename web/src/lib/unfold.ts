/**
 * Folds a box open and shut by animating max-height to its measured content
 * height, then lets it go once open so the content may keep growing. A box
 * that sets `--unfold-rest` shuts to that height instead of nothing, and one
 * that sets `--unfold-time` moves at that pace.
 */
export function unfold(node: HTMLElement, open: boolean) {
  let shown = open
  const rest = 'var(--unfold-rest, 0px)'

  node.style.overflow = 'hidden'
  node.style.willChange = 'max-height'
  node.style.transition = 'max-height var(--unfold-time, 0.22s) cubic-bezier(0.4, 0, 0.2, 1)'
  node.style.maxHeight = open ? 'none' : rest
  node.inert = !open

  function settle(event: TransitionEvent) {
    if (event.target !== node || event.propertyName !== 'max-height') return
    if (shown) node.style.maxHeight = 'none'
  }

  node.addEventListener('transitionend', settle)

  return {
    update(next: boolean) {
      if (next === shown) return
      shown = next
      node.inert = !next
      node.style.maxHeight = `${node.getBoundingClientRect().height}px`
      void node.offsetHeight
      node.style.maxHeight = next ? `${node.scrollHeight}px` : rest
    },
    destroy() {
      node.removeEventListener('transitionend', settle)
    }
  }
}
