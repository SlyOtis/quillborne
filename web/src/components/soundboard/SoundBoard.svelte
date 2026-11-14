<script lang="ts">
  import Glyph from '$components/ui/Glyph.svelte'
  import { postSoundClip, playSoundClip, createDefaultSoundBoard, addClipToSoundBoard, removeClipFromSoundBoard } from '../../lib/soundboard';
  import type { SoundClip, SoundBoard } from '../../lib/character.types';
  
  let { soundBoard = $bindable(), onSoundBoardChange }: { 
    soundBoard: SoundBoard | null, 
    onSoundBoardChange: (soundBoard: SoundBoard) => void 
  } = $props();
  
  let fileInput: HTMLInputElement;
  let isUploading = $state(false);
  let draggedOver = $state(false);
  let playingClips = $state(new Set<string>());

  // Initialize sound board if it doesn't exist
  $effect(() => {
    if (!soundBoard) {
      const newSoundBoard = createDefaultSoundBoard();
      soundBoard = newSoundBoard;
      onSoundBoardChange(newSoundBoard);
    }
  });

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0 || !soundBoard) return;
    
    isUploading = true;
    
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('audio/')) {
          console.warn(`Skipping non-audio file: ${file.name}`);
          continue;
        }
        
        const clip = await postSoundClip('', file);
        const updatedSoundBoard = addClipToSoundBoard(soundBoard, clip);
        soundBoard = updatedSoundBoard;
        onSoundBoardChange(updatedSoundBoard);
      }
    } catch (error) {
      console.error('Error uploading sound files:', error);
    } finally {
      isUploading = false;
    }
  }

  async function playClip(clip: SoundClip) {
    if (playingClips.has(clip.id)) return;
    
    playingClips.add(clip.id);
    
    try {
      await playSoundClip(clip);
    } catch (error) {
      console.error('Error playing sound:', error);
    } finally {
      playingClips.delete(clip.id);
    }
  }

  function removeClip(clipId: string) {
    if (!soundBoard) return;
    
    const updatedSoundBoard = removeClipFromSoundBoard(soundBoard, clipId);
    soundBoard = updatedSoundBoard;
    onSoundBoardChange(updatedSoundBoard);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    draggedOver = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    draggedOver = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    draggedOver = false;
    handleFileUpload(event.dataTransfer?.files || null);
  }

  function openFileDialog() {
    fileInput?.click();
  }
</script>

<div 
  class="clips-grid" 
  class:dragged-over={draggedOver}
  role="region"
  aria-label="Sound clip drop zone"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  {#if soundBoard?.clips && soundBoard.clips.length > 0}
    {#each soundBoard.clips as clip (clip.id)}
      <div class="clip-tile">
        <button 
          class="clip-button medieval-button"
          class:playing={playingClips.has(clip.id)}
          onclick={() => playClip(clip)}
          disabled={playingClips.has(clip.id)}
        >
          <div class="clip-content">
            <div class="clip-icon">
              <Glyph name={playingClips.has(clip.id) ? 'sound' : 'music'} size="sm" />
            </div>
            <div class="clip-name">{clip.name}</div>
          </div>
        </button>
        <button 
          class="remove-btn"
          onclick={() => removeClip(clip.id)}
          title="Remove sound"
        >
        </button>
      </div>
    {/each}
  {/if}
  
  <!-- Add new sound button -->
  <div class="clip-tile add-tile">
    <button 
      class="clip-button add-button medieval-button"
      onclick={openFileDialog}
      disabled={isUploading}
    >
      <div class="clip-content">
        <div class="clip-icon">
          <Glyph name={isUploading ? 'upload' : 'add'} size="sm" />
        </div>
      </div>
    </button>
  </div>
</div>

<input 
  bind:this={fileInput}
  type="file" 
  accept="audio/*" 
  multiple
  style="display: none"
  onchange={(e) => handleFileUpload((e.target as HTMLInputElement)?.files)}
/>

<style>
  .clips-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    padding: var(--space-2);
    border: var(--border-hair) dashed transparent;
    border-radius: var(--radius-sm);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .clips-grid.dragged-over {
    border-color: var(--metal-bright);
    border-style: solid;
    background: var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down), inset 0 0 30px -10px var(--ember-glow);
  }

  .clip-tile {
    position: relative;
    aspect-ratio: 1;
    min-height: 3.75rem;
  }

  .clip-button {
    width: 100%;
    height: 100%;
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    border-radius: var(--radius-sm);
  }

  .clip-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    text-align: center;
  }

  .clip-icon {
    font-size: 1.2em;
    line-height: 1;
  }

  .clip-name {
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    line-height: 1.1;
    word-break: break-word;
    max-width: 100%;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .medieval-button.add-button {
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--rim-thin), var(--bevel-down);
    color: var(--ink-faint);
    font-size: var(--text-xl);
  }

  .medieval-button.add-button:hover:not(:disabled) {
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--rim-thin), var(--bevel-down), inset 0 0 18px -4px var(--ember-glow);
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .clip-button.playing,
  .medieval-button.playing:disabled {
    background:
      radial-gradient(ellipse 80% 80% at 50% 60%, var(--ember-glow) 0%, transparent 75%),
      linear-gradient(180deg, color-mix(in srgb, var(--shadow-ink) 55%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 30%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--rim), var(--bevel-down), inset 0 0 14px var(--ember-glow);
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
    opacity: 1;
  }

  .remove-btn {
    position: absolute;
    top: calc(var(--space-1) * -1);
    right: calc(var(--space-1) * -1);
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: none;
    border-radius: 50%;
    background:
      radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--state-bad) 70%, var(--ink)) 0%, var(--state-bad) 45%, color-mix(in srgb, var(--state-bad) 45%, var(--shadow-ink)) 100%);
    box-shadow: var(--rim-thin), 0 2px 4px var(--shade-hard);
    color: var(--ink);
    font-size: var(--text-sm);
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    line-height: 1;
    z-index: 10;
    transition: filter 0.15s ease;
  }

  .remove-btn:hover {
    filter: brightness(1.2) drop-shadow(0 0 0.3rem var(--state-bad));
  }

  .remove-btn:active {
    filter: brightness(0.85);
  }

  .medieval-button {
    position: relative;
    cursor: pointer;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    min-height: 2.5rem;
    transition: box-shadow 0.15s ease, filter 0.15s ease, color 0.15s ease, text-shadow 0.15s ease;
    box-shadow: var(--rim-thin), var(--bevel-up), 0 2px 4px var(--shade-hard);
    font-family: var(--font-display);
    font-weight: 700;
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 2px var(--shadow-ink);
    color: var(--metal);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .medieval-button:hover:not(:disabled) {
    box-shadow:
      inset 0 0 0 1px var(--keyline),
      inset 0 0 0 2px var(--metal-bright),
      inset 0 0 0 3px var(--keyline),
      var(--bevel-up),
      inset 0 -10px 18px -8px var(--ember-glow),
      0 2px 4px var(--shade-hard);
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .medieval-button:active:not(:disabled) {
    box-shadow: var(--rim-thin), inset 0 3px 5px var(--shade-hard), inset 0 -1px 0 var(--sheen-soft);
    filter: brightness(0.85);
  }

  .medieval-button:active:not(:disabled) .clip-content {
    transform: translateY(1px);
  }

  .medieval-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>
