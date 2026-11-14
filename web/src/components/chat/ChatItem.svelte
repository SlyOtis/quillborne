<script lang="ts">
    import {format} from "date-fns";
    import {marked} from 'marked';
    import type {LogItem} from "../../lib/chat";
    let {logItem, showHidden}: {logItem: LogItem, showHidden: boolean} = $props()

    // Configure marked for better formatting
    marked.setOptions({
        breaks: true,
        gfm: true
    });

    function renderMarkdown(text: string): string {
        return marked(text) as string;
    }
</script>

{#if logItem.type === 'chat'}
    {#if logItem.data.hidden}
        <li class="chat" class:hidden={!showHidden}>
            <div class="chat-title">
                <span>Query:</span>
                <span class="date">{format(logItem.data.sentAt, 'MMM d h:mm')}</span>
            </div>
            <span class="query">{logItem.data.query}</span>
            <div class="chat-title">
                <span>Response:</span>
                <span class="date">{format(logItem.data.returnedAt, 'MMM d h:mm')}</span>
            </div>
            <div class="response">
                <span>{logItem.data.response}</span>
            </div>
        </li>
    {:else}
        <li class="chat">
            <div class="chat-title">
                <span>Query:</span>
                <span class="date">{format(logItem.data.sentAt, 'MMM d h:mm')}</span>
            </div>
            <span class="query">{logItem.data.query}</span>
            <div class="chat-title">
                <span>Response:</span>
                <span class="date">{format(logItem.data.returnedAt, 'MMM d h:mm')}</span>
            </div>
            {#if logItem.data.message}
                <div class="message" class:card={logItem.data.data?.type === 'item_card' || logItem.data.data?.type === 'npc_card'}>
                    <div class="formatted-content">
                        {@html renderMarkdown(logItem.data.message)}
                    </div>
                </div>
            {:else}
                <div class="response">
                    <span>{logItem.data.message}</span>
                </div>
            {/if}
        </li>
    {/if}
{:else }
    <li class="roll">
        <div class="chat-title">
            <h4>{logItem.data.text}</h4>
            <span class="date">{format(logItem.data.rolledAt, 'MMM d h:mm')}</span>
        </div>

        <div class="roll-by">
            {#if logItem.data.author}
                <span class="roll-author">{logItem.data.author}</span>
            {/if}
            {#if logItem.data.formula}
                <span class="roll-formula">{logItem.data.formula}</span>
            {/if}
            {#if logItem.data.details}
                <span class="roll-dice">{logItem.data.details}</span>
            {/if}
        </div>

        <div class="result">
            <span>On the die: <b>{logItem.data.roll}</b></span>
            <span>Total with modifiers: <b>{logItem.data.total}</b></span>
        </div>
    </li>
{/if}

<style>
    li {
        position: relative;
        width: 100%;
        height: auto;
        margin: 0;
        padding: var(--space-2) var(--space-3);
        list-style: none;
        color: var(--ink);
        border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 45%, transparent);
        box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--shadow-ink) 70%, transparent);
    }

    .roll {
        margin: var(--space-1) 0;
        padding: var(--space-2) var(--space-3);
        border-bottom: none;
        background:
            linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 12%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 55%, transparent) 55%, color-mix(in srgb, var(--shadow-ink) 70%, transparent) 100%),
            var(--texture-noise),
            var(--stone-dark);
        box-shadow: var(--rim-thin), var(--bevel-up), inset 0 0 14px 2px var(--shade-hard);
    }


    .roll-by {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-1) var(--space-2);
        margin-bottom: var(--space-1);
        font-size: var(--text-xs);
    }

    .roll-author {
        font-family: var(--font-display);
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--metal);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    .roll-formula {
        padding: 0 var(--space-2);
        border: var(--border-hair) solid var(--metal-dim);
        border-radius: var(--radius-sm);
        background: var(--texture-noise), var(--ground-deep);
        box-shadow: var(--bevel-down);
        font-family: var(--font-mono);
        color: var(--ink-dim);
    }

    .roll-dice {
        font-family: var(--font-mono);
        color: var(--ink-faint);
    }

    .result {
        position: relative;
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-direction: row;
        gap: var(--space-2);
        overflow: hidden;
        font-size: var(--text-xs);
        color: var(--ink-dim);
    }

    .result > span {
        position: relative;
        width: auto;
        padding: var(--space-1) var(--space-2);
    }

    .result b {
        font-family: var(--font-figures);
        font-weight: 700;
        color: var(--ink);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    .result > *:last-child {
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep), var(--ground));
        border: var(--border-hair) solid var(--metal-dim);
        border-radius: var(--radius-sm);
        box-shadow: var(--bevel-down);
        overflow: hidden;
    }

    .result > *:last-child b {
        font-size: var(--text-lg);
        color: var(--metal-bright);
        text-shadow: var(--glow-text);
        vertical-align: middle;
    }

    h4 {
        margin: 0 0 var(--space-1);
        padding: 0;
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: 700;
        letter-spacing: var(--tracking-wide);
        color: var(--metal-bright);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    .date {
        flex: none;
        font-family: var(--font-figures);
        font-size: 0.7em;
        letter-spacing: var(--tracking-wide);
        color: var(--ink-faint);
    }

    .chat-title {
        position: relative;
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        flex-direction: row;
        gap: var(--space-2);
        margin-bottom: var(--space-1);
        font-family: var(--font-display);
        font-size: var(--text-xs);
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--ink-faint);
    }

    .chat-title:not(:first-child) {
        margin-top: var(--space-2);
    }

    .chat {
        position: relative;
        width: 100%;
        height: auto;
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: stretch;
        flex-direction: column;
    }

    .query {
        position: relative;
        width: 100%;
        padding: 0 0 0 var(--space-2);
        overflow: hidden;
        border: var(--border-hair) solid var(--metal);
        font-weight: 500;
        color: var(--metal-bright);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    .response {
        position: relative;
        width: 100%;
        padding: var(--space-2) var(--space-3);
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep), var(--ground));
        border-radius: var(--radius-sm);
        box-shadow: var(--bevel-down), inset 0 0 0 1px color-mix(in srgb, var(--metal-dim) 60%, transparent);
    }

    .response > span {
        font-size: var(--text-sm);
        color: var(--ink);
    }

    .hidden {
        display: none;
        max-height: 0;
    }

    .message {
        position: relative;
        width: 100%;
        font-size: var(--text-sm);
        line-height: 1.45;
    }

    .message.card {
        margin: var(--space-2) 0;
        padding: var(--space-4);
        background: var(--rivets), var(--texture-leather), var(--texture-parchment);
        border-radius: var(--radius-lg);
        box-shadow: var(--rim), inset 0 0 24px 4px color-mix(in srgb, #5a3a12 45%, transparent), var(--shadow-md);
        --ink: var(--ink-parchment);
        --ink-dim: color-mix(in srgb, var(--ink-parchment) 75%, #d7c091);
        --metal: color-mix(in srgb, var(--ink-parchment) 70%, #8a5a14);
        --metal-bright: var(--ink-parchment);
    }

    .message.card .formatted-content :global(:is(h1, h2, h3, h4)) {
        text-shadow: none;
    }

    .message.card .formatted-content :global(a:hover) {
        text-shadow: none;
    }

    .formatted-content {
        color: var(--ink);
        line-height: 1.55;
        overflow-wrap: anywhere;
    }

    .formatted-content :global(h1),
    .formatted-content :global(h2),
    .formatted-content :global(h3),
    .formatted-content :global(h4) {
        margin: 0.8rem 0 0.4rem 0;
        font-family: var(--font-display);
        font-weight: 700;
        letter-spacing: var(--tracking-wide);
        color: var(--metal);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    .formatted-content :global(strong) {
        color: var(--metal-bright);
        font-weight: 700;
    }

    .formatted-content :global(em) {
        color: var(--ink-dim);
        font-style: italic;
    }

    .formatted-content :global(a) {
        color: var(--metal);
        text-decoration: underline;
        text-decoration-color: var(--metal-dim);
        text-underline-offset: 0.15em;
    }

    .formatted-content :global(a:hover) {
        color: var(--metal-bright);
        text-shadow: var(--glow-text);
    }

    .formatted-content :global(ul),
    .formatted-content :global(ol) {
        margin: 0.5rem 0;
        padding-left: 1.5rem;
    }

    .formatted-content :global(li) {
        margin: 0.3rem 0;
        color: var(--ink);
    }

    .formatted-content :global(li::marker) {
        color: var(--metal);
    }

    .formatted-content :global(p) {
        margin: 0.5rem 0;
        color: var(--ink);
    }

    .formatted-content :global(img) {
        max-width: 100%;
        height: auto;
        margin: 0.5rem 0;
        border-radius: var(--radius-sm);
        box-shadow: var(--rim-thin), var(--shadow-sm);
    }

    .formatted-content :global(code) {
        padding: 0.1rem 0.3rem;
        background: var(--ground-deep);
        border: var(--border-hair) solid var(--metal-dim);
        border-radius: var(--radius-sm);
        box-shadow: var(--bevel-down);
        color: var(--ember-core);
        font-family: var(--font-mono);
        font-size: 0.9em;
    }

    .formatted-content :global(pre) {
        padding: var(--space-2) var(--space-3);
        overflow-x: auto;
        background: var(--texture-noise), var(--ground-deep);
        border-radius: var(--radius-sm);
        box-shadow: var(--bevel-down), inset 0 0 0 1px var(--metal-dim);
    }

    .formatted-content :global(pre code) {
        padding: 0;
        border: none;
        box-shadow: none;
        background: none;
    }

    .formatted-content :global(blockquote) {
        margin: 1rem 0;
        padding: var(--space-2) var(--space-4);
        border-block: var(--border-hair) solid var(--metal-dim);
        background: linear-gradient(180deg, var(--sheen-soft), transparent);
        color: var(--ink-dim);
        font-style: italic;
    }
</style>
