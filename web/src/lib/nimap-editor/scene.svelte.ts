export interface ScenePreview {
  furniture: boolean
  openings: boolean
  wallHeight: number
  exteriorWallHeight: number
}

const KEY = 'quillborne.nimap.scene'

const read = (): Partial<ScenePreview> => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Partial<ScenePreview>
  } catch {
    return {}
  }
}

let kept: ScenePreview | null = null

export function getScenePreview(): ScenePreview {
  if (kept) return kept
  const preview = $state<ScenePreview>({ furniture: true, openings: true, wallHeight: 115, exteriorWallHeight: 115, ...read() })
  kept = preview
  return preview
}

export function putScenePreview(preview: ScenePreview) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(preview))
  } catch {}
}
