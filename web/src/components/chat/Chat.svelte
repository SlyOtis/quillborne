<script lang="ts">
  import { getCampaign, getCsrfHeaders, getProfiles } from '$lib/api'
  import type { Profile } from '$lib/api/types'
  import {onDestroy, getContext} from "svelte";
  import {type ChatLog, detectAction, getChatLog} from "$lib/chat";
  import ChatItem from "./ChatItem.svelte";
  import { user, userDetails, userProfile } from "$lib/stores/auth.store";
  import Sigil from "$components/ui/Sigil.svelte";
  import Glyph from "$components/ui/Glyph.svelte";
  import FriendsPanel from "$pages/main/FriendsPanel.svelte";
  import { rollMode, rollHidden, type RollMode } from "$lib/engine";
  import { currentCampaignId } from "$lib/stores/campaign.store";

  const {unsubscribeChat, chatStore} = getChatLog()

  const dialogState = getContext<{isAnyDialogOpen: boolean, setDialogState: (isOpen: boolean) => void}>('dialogState');
  let isDialogOpen = $derived(dialogState?.isAnyDialogOpen || false);

  onDestroy(() => {
    unsubscribeChat()
  })

  let chatLog: ChatLog = $derived($chatStore)

  let chatInput: string = $state("")
  let stateThinking = $state<string | undefined>(undefined)
  let stateError = $state<string | undefined>(undefined)
  let showHidden = $state<boolean>(false)
  let dmOf = $state<string | null>(null)

  const MODES: { id: RollMode, title: string, mark: string }[] = [
    { id: "disadvantage", title: "Roll the next d20 with disadvantage", mark: "Dis" },
    { id: "normal", title: "Roll the next d20 straight", mark: "—" },
    { id: "advantage", title: "Roll the next d20 with advantage", mark: "Adv" }
  ]

  $effect(() => {
    const campaignId = $currentCampaignId
    dmOf = null
    rollHidden.set(false)
    if (!campaignId) return
    getCampaign(campaignId).then((campaign) => {
      if ($currentCampaignId === campaignId) dmOf = campaign?.dm_id ?? null
    })
  })

  let friends = $state<Profile[]>([])
  let friendsLoading = $state(true)
  let view = $state<'chat' | 'party'>('chat')

  $effect(() => {
    const ids = $userProfile?.friends ?? []
    friendsLoading = true
    getProfiles(ids)
      .then((known) => friends = known)
      .finally(() => friendsLoading = false)
  })

  const isDm = $derived(Boolean($user?.user_id) && dmOf === $user?.user_id)
  let scroller = $state<HTMLElement | null>(null)
  
  let isRecording = $state(false)
  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: Blob[] = []
  

  $effect(() => {
    chatLog.length || stateThinking?.length || stateError?.length || showHidden;
    scroller?.scrollTo(0, scroller.scrollHeight)
  })

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      onSend(e)
    }
  }

  function onSend(e: Event) {
    e.preventDefault()
    e.stopPropagation()

    if (!chatInput.length) {
      return
    }

    stateThinking = "Thinking about it"
    detectAction(chatInput).then(() => stateThinking = undefined).catch((err: any) => {
      stateThinking = undefined
      stateError = err.message || 'An error occurred'
    })
    if (document.activeElement && 'blur' in document.activeElement) {
      (document.activeElement as HTMLElement).blur();
    }
    chatInput = ''
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder = new MediaRecorder(stream)
      audioChunks = []

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
        await transcribeAudio(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      isRecording = true
    } catch (error) {
      console.error('Error starting recording:', error)
      stateError = 'Could not access microphone'
    }
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop()
      isRecording = false
    }
  }

  async function transcribeAudio(audioBlob: Blob) {
    try {
      stateThinking = "Converting speech to text..."
      
      const apiKey = $userDetails?.replicate_api_key
      if (!apiKey) {
        throw new Error("Replicate API key is missing")
      }
      
      const audioDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(audioBlob)
      })

      console.log('Attempting transcription with audio data length:', audioDataUrl.length)
      
      const requestBody = {
        stream: false,
        input: {
          audio: audioDataUrl
        }
      }
      
      
      const response = await fetch('/api/ai/models/thomasmol/whisper-diarization/predictions', {
        method: 'POST',
        headers: {
          ...getCsrfHeaders(), 'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
      
      console.log('Response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error Details:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText,
          url: response.url
        })
        throw new Error(`Transcription failed: ${response.status} - ${errorText}`)
      }

      const resp = await response.json()
      let getUrl: string | undefined = resp?.urls?.get?.replace("https://api.replicate.com/v1", "/api/ai")
      
      if (!getUrl) {
        throw new Error(`Invalid response - no polling URL provided`)
      }
      
      const result = await pollWhisperResult(getUrl)
      if (result && typeof result === 'string' && result.trim()) {
        chatInput = result.trim()
        stateThinking = undefined
        setTimeout(() => {
          if (chatInput.trim()) {
            onSend(new Event('submit'))
          }
        }, 100)
      } else {
        stateError = 'No transcription text received'
        stateThinking = undefined
      }
      
    } catch (error) {
      console.error('Error transcribing audio:', error)
      stateError = `Failed to transcribe audio: ${error instanceof Error ? error.message : String(error)}`
      stateThinking = undefined
    }
  }

  const pollWhisperResult = (getUrl: string): Promise<string> => new Promise((resolve, reject) => {
    let retries = 1;
    const maxRetries = 15;
    
    const poll = () => {
      if (retries > maxRetries) {
        reject(new Error('Transcription timeout after 15 retries'));
        return;
      }
      
      setTimeout(async () => {
        try {
          console.log(`Polling Whisper result, attempt ${retries}`);
          stateThinking = `Converting speech to text... (${retries}/${maxRetries})`
          
          const res = await fetch(getUrl, {
            method: "GET",
            headers: {
              "Content-Type": "application/json"
            },
          })

          const response = await res.json()

          if (response.status === 'succeeded') {
            let transcription = ''
            if (typeof response.output === 'string') {
              transcription = response.output
            } else if (response.output?.transcription) {
              transcription = response.output.transcription
            } else if (response.output?.text) {
              transcription = response.output.text
            } else if (Array.isArray(response.output)) {
              transcription = response.output.join(' ')
            }
            
            if (transcription && transcription.trim()) {
              resolve(transcription.trim())
            } else {
              reject(new Error('No transcription text in response'))
            }
          } else if (response.status === 'failed') {
            reject(new Error(`Transcription failed: ${response.error || 'Unknown error'}`))
          } else if (response.status === 'canceled') {
            reject(new Error('Transcription was canceled'))
          } else {
            retries++;
            poll()
          }
        } catch (error) {
          console.error('Error in Whisper polling:', error)
          reject(error)
        }
      }, 2000) // Poll every 2 seconds
    }
    
    poll()
  })

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1]) // Remove data:audio/webm;base64, prefix
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

</script>

<div class="root" class:disabled={isDialogOpen}>
    <div class="inner">
        <div class="tabs" role="tablist" aria-label="The drawer">
            <button type="button" class="tab" class:tab-on={view === 'chat'} role="tab" aria-selected={view === 'chat'} onclick={() => view = 'chat'}>Chat</button>
            <button type="button" class="tab" class:tab-on={view === 'party'} role="tab" aria-selected={view === 'party'} onclick={() => view = 'party'}>Party <span class="tab-count">{friends.length}</span></button>
        </div>
        {#if view === 'party'}
        <div class="party"><FriendsPanel loading={friendsLoading} bind:friends /></div>
        {:else}
        <div class="scroll" bind:this={scroller}>
            <ul>
                {#each chatLog as logItem}
                    <ChatItem {logItem} {showHidden} />
                {/each}
            </ul>
        </div>
        {#if stateThinking || stateError}
            <div class="status" class:error={stateError?.length}>
                <span class="thinking">{stateThinking || stateError}</span>
            </div>
        {/if}
        <div class="modes" role="group" aria-label="The next d20">
            {#each MODES as mode (mode.id)}
                <button
                    type="button"
                    class="mode"
                    class:mode-on={$rollMode === mode.id}
                    title={mode.title}
                    aria-pressed={$rollMode === mode.id}
                    onclick={() => rollMode.set(mode.id)}
                >{mode.mark}</button>
            {/each}
            {#if isDm}
                <button
                    type="button"
                    class="mode mode-hidden"
                    class:mode-on={$rollHidden}
                    title={$rollHidden ? 'Your rolls reach only you' : 'Your rolls reach the whole table'}
                    aria-pressed={$rollHidden}
                    onclick={() => rollHidden.update((hidden) => !hidden)}
                >{$rollHidden ? 'Hidden' : 'Open'}</button>
            {/if}
        </div>
        <div class="input" class:disabled={Boolean(stateThinking?.length || stateError?.length || isDialogOpen)}>
            <textarea bind:value={chatInput} onkeydown={onKeyDown}></textarea>
            <div class="actions">
                <Sigil
                    title={showHidden ? 'Hide hidden entries' : 'Show hidden entries'}
                    size="sm"
                    frame="ring"
                    active={showHidden}
                    onclick={() => showHidden = !showHidden}
                >
                    <Glyph name={showHidden ? 'conceal' : 'reveal'} size="sm" />
                </Sigil>

                <Sigil
                    title={isRecording ? 'Stop recording' : 'Start voice recording'}
                    frame="ring"
                    tone={isRecording ? 'bane' : 'ember'}
                    size="sm"
                    active={isRecording}
                    disabled={Boolean(stateThinking?.length || stateError?.length || isDialogOpen)}
                    onclick={toggleRecording}
                >
                    <Glyph name={isRecording ? 'stop' : 'record'} size="sm" />
                </Sigil>

                <Sigil title="Send" tone="metal" size="sm" frame="star" onclick={onSend}>
                    <Glyph name="send" size="sm" />
                </Sigil>
            </div>
        </div>
        {/if}
    </div>
</div>

<style>
    .root {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
        z-index: 100;
    }

    .inner {
        position: absolute;
        width: 100%;
        min-width: 0;
        left: 0;
        top: 0;
        bottom: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: stretch;
    }

    .scroll {
        position: relative;
        width: 100%;
        height: 100%;
        flex: 1;
        display: flex;
        flex-direction: column-reverse;
        justify-content: end;
        align-items: start;
        overflow: hidden;
        overflow-y: scroll;
        box-shadow: inset 0 0 18px 4px var(--shade-hard);
    }

    .input {
        position: relative;
        width: 100%;
        height: auto;
        display: flex;
        justify-content: stretch;
        align-items: stretch;
        flex-direction: row;
        overflow: hidden;
        background:
            linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 18%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent) 100%),
            var(--texture-noise),
            var(--stone);
        box-shadow:
            var(--bevel-up),
            inset 0 1px 0 var(--keyline),
            inset 0 2px 0 var(--metal),
            inset 0 3px 0 var(--keyline),
            0 -4px 10px var(--shade);
    }

    .input > textarea {
        position: relative;
        flex: 1;
        min-width: 0;
        height: auto;
        min-height: 0;
        max-height: 40vh;
        field-sizing: content;
        overflow-y: auto;
        resize: none;
        margin: var(--space-3) var(--space-2) var(--space-2) var(--space-3);
        padding: var(--space-2) var(--space-3);
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
        color: var(--ink);
        outline: none;
        font-family: var(--font-body);
        font-size: var(--text-sm);
        line-height: 1.45;
        border: var(--border-hair) solid var(--metal-dim);
        border-radius: var(--radius-sm);
        box-shadow: var(--bevel-down), inset 0 2px 6px var(--shade-hard);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .input > textarea:focus {
        border-color: var(--metal-bright);
        box-shadow: var(--bevel-down), inset 0 2px 6px var(--shade-hard), var(--glow-metal);
    }

    .input > textarea::placeholder {
        color: var(--ink-faint);
        font-style: italic;
    }

    ul {
        position: relative;
        width: 100%;
        height: auto;
        margin: 0;
        padding: var(--space-1) var(--space-2);
        list-style: none;
        color: var(--ink);
    }

    .disabled {
        user-select: none;
        pointer-events: none;
        cursor: default;
        opacity: 0.5;
    }

    .disabled > * {
        user-select: none;
        pointer-events: none;
        cursor: default;
        opacity: 0.65;
    }

    .root.disabled {
        filter: grayscale(0.5);
        pointer-events: none;
        user-select: none;
    }

    .modes,
    .tabs {
        display: flex;
        align-self: stretch;
        gap: 0;
        margin: var(--space-2) var(--space-3);
        padding: 0.2rem;
        border-radius: var(--radius-sm);
        background: var(--texture-noise), var(--ground-deep);
        box-shadow: var(--rim-thin), var(--bevel-down);
    }

    .mode,
    .tab {
        position: relative;
        flex: 1;
        padding: var(--space-1) var(--space-2);
        border: none;
        border-radius: 0;
        background:
            linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 16%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 50%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 70%, transparent) 100%),
            var(--texture-noise),
            var(--stone-dark);
        box-shadow: var(--bevel-up), inset 0 0 0 1px var(--keyline);
        color: var(--ink-dim);
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        text-shadow: 0 1px 0 var(--shadow-ink);
        cursor: pointer;
        transition: color 0.18s ease, text-shadow 0.18s ease, box-shadow 0.18s ease;
    }

    .mode:first-child,
    .tab:first-child {
        border-radius: var(--radius-sm) 0 0 var(--radius-sm);
    }

    .mode:last-child,
    .tab:last-child {
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    }

    .mode:hover,
    .tab:hover {
        color: var(--metal-bright);
        text-shadow: var(--glow-text);
    }

    .mode:active,
    .tab:active {
        filter: brightness(0.85);
    }

    .mode:focus-visible,
    .tab:focus-visible {
        outline: none;
        box-shadow: var(--focus-ring);
        z-index: 1;
    }

    .mode-on,
    .tab-on {
        color: var(--metal-bright);
        text-shadow: var(--glow-text);
        background:
            radial-gradient(ellipse 90% 130% at 50% 110%, color-mix(in srgb, var(--ember) 55%, transparent) 0%, transparent 70%),
            linear-gradient(180deg, color-mix(in srgb, var(--shadow-ink) 55%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 30%, transparent) 100%),
            var(--texture-noise),
            var(--stone);
        box-shadow: var(--bevel-down), inset 0 0 0 1px var(--metal-bright), inset 0 0 12px var(--ember-glow), 0 0 10px var(--ember-glow);
        z-index: 1;
    }

    .mode-hidden {
        flex: 1.4;
    }

    .tabs {
        flex: none;
        margin: var(--space-3) var(--space-3) var(--space-2);
    }

    .tab-count {
        margin-inline-start: var(--space-1);
        font-family: var(--font-figures);
        font-variant-numeric: lining-nums tabular-nums;
        color: var(--ink-dim);
    }

    .party {
        flex: 1;
        min-height: 0;
        padding: var(--space-3);
        overflow-y: auto;
    }

    .actions {
        display: flex;
        flex: none;
        flex-direction: column;
        align-items: stretch;
        justify-content: space-between;
        gap: var(--space-1);
        align-self: stretch;
        padding: var(--space-3) var(--space-3) var(--space-2) 0;
    }

    .actions :global(.dnd-sigil[title]:hover::after),
    .actions :global(.dnd-sigil[title]:focus-visible::after) {
        top: 50%;
        right: calc(100% + var(--space-2));
        bottom: auto;
        left: auto;
        transform: translateY(-50%);
    }

    .status {
        position: relative;
        width: 100%;
        height: auto;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: row;
        padding: var(--space-1) var(--space-3);
        border-top: var(--border-hair) solid var(--metal-dim);
        background: var(--texture-noise), var(--ground-deep);
        font-family: var(--font-display);
        font-size: var(--text-xs);
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--metal);
        text-shadow: var(--glow-text);
    }

    .status.error {
        border-color: var(--state-bad);
        color: var(--state-bad);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }
</style>
