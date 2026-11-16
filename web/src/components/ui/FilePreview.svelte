<script lang="ts">
  import { onDestroy } from 'svelte'
  import Glyph from './Glyph.svelte'

  type Kind = 'image' | 'video' | 'audio' | 'pdf' | 'html' | 'gsuite' | 'font' | 'code' | 'other'
  type Status = 'idle' | 'loading' | 'ready' | 'error'

  const {
    url,
    mimeType,
    name = '',
    uploading = false
  }: {
    /** Fetchable address of the file, which resets the preview when it changes. */
    url: string
    /** The first signal for picking what is drawn. */
    mimeType: string
    /** File name read for the extension when the mime type says nothing, and written in the fallback. */
    name?: string
    /** Blurs the preview and lays a spinner over it while an upload runs. */
    uploading?: boolean
  } = $props()

  const CODE_EXTENSIONS = [
    'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'vue', 'svelte', 'json', 'py', 'go', 'rs', 'sh', 'bash', 'zsh', 'cs', 'yml', 'yaml',
    'css', 'scss', 'less', 'sql', 'md', 'markdown', 'xml', 'toml', 'ini', 'conf', 'cfg', 'env', 'diff', 'patch', 'srt', 'vtt',
    'properties', 'log', 'txt'
  ]
  const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2', 'eot']

  let status = $state<Status>('idle')
  let error = $state('')
  let text = $state('')
  let family = $state('')
  let face: FontFace | null = null
  let fontCount = 0

  const extension = $derived.by(() => {
    const at = name.lastIndexOf('.')
    return at >= 0 ? name.slice(at + 1).toLowerCase() : ''
  })

  const kind = $derived.by<Kind>(() => {
    const mime = mimeType ?? ''
    if (mime.startsWith('application/vnd.google-apps')) return 'gsuite'
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('video/')) return 'video'
    if (mime.startsWith('audio/')) return 'audio'
    if (mime === 'application/pdf' || extension === 'pdf') return 'pdf'
    if (mime === 'text/html' || extension === 'html' || extension === 'htm') return 'html'
    if (mime.startsWith('font/') || mime.includes('font') || FONT_EXTENSIONS.includes(extension)) return 'font'
    if (
      mime.startsWith('text/') ||
      mime === 'application/json' ||
      mime.includes('javascript') ||
      mime.includes('ecmascript') ||
      mime.includes('xml') ||
      CODE_EXTENSIONS.includes(extension)
    ) {
      return 'code'
    }
    return 'other'
  })

  const pdfSrc = $derived(url ? `${url}#toolbar=0&navpanes=0&scrollbar=0` : '')

  const gsuiteSrc = $derived.by(() => {
    if (!url) return ''
    if (/\/preview(\?|$)/.test(url)) return url
    if (/\/(edit|view)(\?|$)/.test(url)) return url.replace(/\/(edit|view)(\?|$)/, '/preview$2')
    return url.includes('docs.google.com') ? `${url.replace(/\/$/, '')}/preview` : url
  })

  function release() {
    if (face) document.fonts.delete(face)
    face = null
  }

  async function read(target: string): Promise<Response> {
    const answer = await fetch(target)
    if (!answer.ok) throw new Error(`Could not read the file, the server answered ${answer.status}`)
    return answer
  }

  async function load(target: string, what: Kind) {
    release()
    text = ''
    family = ''
    if (what !== 'code' && what !== 'font') {
      status = 'idle'
      return
    }
    status = 'loading'
    error = ''
    try {
      if (what === 'code') {
        const answer = await read(target)
        const body = await answer.text()
        if (target !== url) return
        text = body
      } else {
        fontCount += 1
        const named = `dnd-preview-font-${fontCount}`
        const loaded = new FontFace(named, `url("${target}")`)
        await loaded.load()
        if (target !== url) return
        document.fonts.add(loaded)
        face = loaded
        family = named
      }
      status = 'ready'
    } catch (reason) {
      if (target !== url) return
      error = reason instanceof Error ? reason.message : 'Preview failed'
      status = 'error'
    }
  }

  $effect(() => {
    void load(url, kind)
  })

  onDestroy(release)
</script>

<div class="dnd-filepreview" class:dnd-filepreview-uploading={uploading} data-kind={kind}>
  {#if uploading}
    <div class="dnd-filepreview-veil"><span class="dnd-spinner"></span></div>
  {/if}

  {#if !url}
    <div class="dnd-filepreview-fallback">
      <Glyph name="file" size="lg" />
      <span class="dnd-filepreview-fallback-name">{name || 'file'}</span>
    </div>
  {:else if kind === 'image'}
    <img class="dnd-filepreview-image" src={url} alt={name} />
  {:else if kind === 'video'}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video class="dnd-filepreview-video" controls src={url}></video>
  {:else if kind === 'audio'}
    <div class="dnd-filepreview-audio">
      <audio controls src={url}></audio>
    </div>
  {:else if kind === 'pdf'}
    <object class="dnd-filepreview-pdf" data={pdfSrc} type="application/pdf" title={name || 'Document'}>
      <a class="dnd-filepreview-link" href={url} target="_blank" rel="noopener noreferrer">Open in new tab</a>
    </object>
  {:else if kind === 'gsuite'}
    <iframe class="dnd-filepreview-frame" src={gsuiteSrc} title={name || 'preview'}></iframe>
  {:else if kind === 'html'}
    <iframe class="dnd-filepreview-frame" src={url} title={name || 'preview'} sandbox="" referrerpolicy="no-referrer"></iframe>
  {:else if kind === 'font' || kind === 'code'}
    {#if status === 'loading'}
      <div class="dnd-filepreview-state">
        <span class="dnd-spinner"></span>
        <span>{kind === 'font' ? 'Loading font' : 'Loading preview'}</span>
      </div>
    {:else if status === 'error'}
      <div class="dnd-filepreview-state">
        <Glyph name="trianglealert" size="lg" />
        <span class="dnd-filepreview-state-name">{name || 'file'}</span>
        <span>{error}</span>
        <a class="dnd-filepreview-link" href={url} target="_blank" rel="noopener noreferrer">Open in new tab</a>
      </div>
    {:else if kind === 'font'}
      <div class="dnd-filepreview-scroll dnd-scroll">
        <div class="dnd-filepreview-font" style:font-family={family}>
          <div class="dnd-filepreview-font-hero">Ag</div>
          <p class="dnd-filepreview-font-pangram">The quick brown fox jumps over the lazy dog</p>
          <p class="dnd-filepreview-font-row">ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
          <p class="dnd-filepreview-font-row">abcdefghijklmnopqrstuvwxyz</p>
          <p class="dnd-filepreview-font-row">0123456789</p>
          <p class="dnd-filepreview-font-s1">The quick brown fox</p>
          <p class="dnd-filepreview-font-s2">The quick brown fox</p>
          <p class="dnd-filepreview-font-s3">The quick brown fox</p>
        </div>
      </div>
    {:else}
      <div class="dnd-filepreview-scroll dnd-scroll">
        <pre class="dnd-filepreview-code">{text}</pre>
      </div>
    {/if}
  {:else}
    <div class="dnd-filepreview-fallback">
      <Glyph name="file" size="lg" />
      <span class="dnd-filepreview-fallback-name">{name || 'file'}</span>
      <a class="dnd-filepreview-link" href={url} target="_blank" rel="noopener noreferrer">Open in new tab</a>
    </div>
  {/if}
</div>

<style>
  .dnd-filepreview {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--texture-noise), radial-gradient(ellipse at 50% 40%, var(--ground-raised) 0%, var(--ground-deep) 80%);
  }

  .dnd-filepreview-uploading > :not(.dnd-filepreview-veil) {
    filter: blur(0.5em);
    opacity: 0.6;
    pointer-events: none;
  }

  .dnd-filepreview-veil {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dnd-filepreview-image,
  .dnd-filepreview-video {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    background: var(--ground-deep);
  }

  .dnd-filepreview-audio {
    display: flex;
    width: 80%;
    max-width: 32em;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard);
  }

  .dnd-filepreview-audio audio {
    width: 100%;
  }

  .dnd-filepreview-pdf,
  .dnd-filepreview-frame {
    display: block;
    width: 100%;
    height: 100%;
    border: none;
    background: var(--ground-deep);
  }

  .dnd-filepreview-scroll {
    width: 100%;
    height: 100%;
    overflow: auto;
  }

  .dnd-filepreview-code {
    margin: 0;
    padding: var(--space-4);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--ink);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .dnd-filepreview-font {
    max-width: 46em;
    margin: 0 auto;
    padding: 2.5em 3em;
    color: var(--ink);
  }

  .dnd-filepreview-font p {
    margin: 0;
  }

  .dnd-filepreview-font-hero {
    margin-bottom: 0.2em;
    font-size: 5em;
    line-height: 1.1;
  }

  .dnd-filepreview-font-pangram {
    margin-bottom: 0.8571em;
    font-size: 1.75em;
  }

  .dnd-filepreview-font-row {
    margin-bottom: 0.4em;
    font-size: 1.25em;
    letter-spacing: 0.05em;
    color: var(--ink-dim);
    word-break: break-all;
  }

  .dnd-filepreview-font-s1 {
    margin-top: 1.4286em;
    font-size: 0.875em;
  }

  .dnd-filepreview-font-s2 {
    margin-top: 0.5em;
    font-size: 1.25em;
  }

  .dnd-filepreview-font-s3 {
    margin-top: 0.3125em;
    font-size: 2em;
  }

  .dnd-filepreview-state,
  .dnd-filepreview-fallback {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin: auto;
    padding: var(--space-5);
    text-align: center;
    font-size: var(--text-sm);
    color: var(--ink-faint);
  }

  .dnd-filepreview-state-name,
  .dnd-filepreview-fallback-name {
    font-family: var(--font-display);
    font-weight: 600;
    color: var(--ink);
  }

  .dnd-filepreview-link {
    font-size: var(--text-xs);
    color: var(--metal);
    text-decoration: none;
  }

  .dnd-filepreview-link:hover {
    color: var(--metal-bright);
    text-decoration: underline;
  }
</style>
