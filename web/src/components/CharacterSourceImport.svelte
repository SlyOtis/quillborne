<script lang="ts">
  import type { CharacterSourceData } from '../lib/character.types';
  import BaseDialog from './BaseDialog.svelte';
  import Button from '$components/ui/Button.svelte';
  import Field from '$components/ui/Field.svelte';
  import Glyph from '$components/ui/Glyph.svelte';
  import Ornament from '$components/ui/Ornament.svelte';
  import { aiService } from '$lib/ai';
  import { getSource, getSourceKind, SOURCE_ACCEPT } from '$lib/sources';

  let { isOpen = $bindable(false) } = $props();

  let sources = $state<any[]>([]);
  let dragActive = $state(false);
  let processing = $state(false);
  let processingMessage = $state('Processing character source with AI...');
  let errorMessage = $state<string | undefined>(undefined);
  let successMessage = $state<string | undefined>(undefined);
  let showImportDialog = $state(false);

  // Load sources from localStorage when dialog opens
  $effect(() => {
    if (isOpen) {
      loadSources();
    }
  });

  function loadSources() {
    try {
      const storedSources = localStorage.getItem('character_sources');
      if (storedSources) {
        const parsedSources = JSON.parse(storedSources);
        sources = parsedSources.map((source: any) => ({
          ...source,
          enabled: source.enabled !== false // Default to enabled
        }));
      } else {
        sources = [];
      }
    } catch (error) {
      console.error('Failed to load sources:', error);
      sources = [];
    }
  }

  function saveSources() {
    try {
      localStorage.setItem('character_sources', JSON.stringify(sources));
      // Build and save extracted data as structured JSONs
      buildAndSaveStructuredData();
    } catch (error) {
      console.error('Failed to save sources:', error);
    }
  }

  function buildAndSaveStructuredData() {
    try {
      // Instead of extracting filled content, build schemas for AI processing
      const itemsSchema = buildItemsSchema();
      const characterSchema = buildCharacterSchema();
      
      // Save schemas to localStorage for AI consumption
      localStorage.setItem('dnd_items_schema', JSON.stringify(itemsSchema));
      localStorage.setItem('dnd_character_schema', JSON.stringify(characterSchema));
      
      console.log('Built AI schemas:', { itemsSchema, characterSchema });
    } catch (error) {
      console.error('Failed to build schemas:', error);
    }
  }

  function buildItemsSchema() {
    return {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "D&D Items Database Schema",
      description: "Schema for AI to extract and organize D&D items from source materials",
      type: "object",
      properties: {
        metadata: {
          type: "object",
          properties: {
            generatedAt: { type: "string", format: "date-time" },
            version: { type: "string" },
            sourceCount: { type: "integer" },
            totalItems: { type: "integer" }
          },
          required: ["generatedAt", "version", "totalItems"]
        },
        weapons: {
          type: "array",
          items: { $ref: "#/$defs/weapon" }
        },
        armor: {
          type: "array", 
          items: { $ref: "#/$defs/armor" }
        },
        equipment: {
          type: "array",
          items: { $ref: "#/$defs/item" }
        },
        magicItems: {
          type: "array",
          items: { $ref: "#/$defs/magicItem" }
        },
        consumables: {
          type: "array",
          items: { $ref: "#/$defs/consumable" }
        },
        treasures: {
          type: "array",
          items: { $ref: "#/$defs/treasure" }
        }
      },
      $defs: {
        item: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            type: { type: "string" },
            description: { type: "string" },
            weight: { type: "number" },
            cost: {
              type: "object",
              properties: {
                amount: { type: "number" },
                currency: { type: "string", enum: ["cp", "sp", "gp", "pp"] }
              }
            },
            rarity: { type: "string", enum: ["common", "uncommon", "rare", "very rare", "legendary", "artifact"] },
            source: { type: "string" }
          },
          required: ["id", "name", "type", "description"]
        },
        weapon: {
          allOf: [
            { $ref: "#/$defs/item" },
            {
              properties: {
                damage: {
                  type: "object",
                  properties: {
                    amount: { type: "integer" },
                    dice: { type: "integer" },
                    type: { type: "string" },
                    bonus: { type: "integer" }
                  }
                },
                properties: { type: "array", items: { type: "string" } },
                range: {
                  type: "object",
                  properties: {
                    normal: { type: "integer" },
                    max: { type: "integer" }
                  }
                }
              }
            }
          ]
        },
        armor: {
          allOf: [
            { $ref: "#/$defs/item" },
            {
              properties: {
                ac: {
                  type: "object",
                  properties: {
                    base: { type: "integer" },
                    bonus: { type: "integer" },
                    dexModifier: { type: "boolean" },
                    maxDexBonus: { type: "integer" }
                  }
                },
                armorType: { type: "string", enum: ["light", "medium", "heavy", "shield"] }
              }
            }
          ]
        },
        magicItem: {
          allOf: [
            { $ref: "#/$defs/item" },
            {
              properties: {
                attunement: { type: "boolean" },
                charges: { type: "integer" },
                effects: { type: "array", items: { type: "string" } }
              }
            }
          ]
        },
        consumable: {
          allOf: [
            { $ref: "#/$defs/item" },
            {
              properties: {
                uses: { type: "integer" },
                effect: { type: "string" }
              }
            }
          ]
        },
        treasure: {
          allOf: [
            { $ref: "#/$defs/item" },
            {
              properties: {
                value: { type: "number" }
              }
            }
          ]
        }
      },
      required: ["metadata", "weapons", "armor", "equipment", "magicItems", "consumables", "treasures"]
    };
  }


  function buildCharacterSchema() {
    return {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "D&D Character Database Schema", 
      description: "Schema for AI to extract and organize D&D character data from source materials",
      type: "object",
      properties: {
        metadata: {
          type: "object",
          properties: {
            generatedAt: { type: "string", format: "date-time" },
            version: { type: "string" },
            sourceCount: { type: "integer" },
            totalClasses: { type: "integer" },
            totalRaces: { type: "integer" },
            totalFeatures: { type: "integer" }
          },
          required: ["generatedAt", "version"]
        },
        classes: {
          type: "array",
          items: { $ref: "#/$defs/class" }
        },
        races: {
          type: "array",
          items: { $ref: "#/$defs/race" }
        },
        backgrounds: {
          type: "array", 
          items: { $ref: "#/$defs/background" }
        },
        features: {
          type: "array",
          items: { $ref: "#/$defs/feature" }
        },
        spells: {
          type: "array",
          items: { $ref: "#/$defs/spell" }
        },
        subclasses: {
          type: "array",
          items: { $ref: "#/$defs/subclass" }
        }
      },
      $defs: {
        class: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            hitDie: { type: "integer", minimum: 6, maximum: 12 },
            primaryAbility: { type: "array", items: { type: "string" } },
            savingThrowProficiencies: { type: "array", items: { type: "string" } },
            skillProficiencies: { type: "array", items: { type: "string" } },
            equipment: { type: "array", items: { type: "string" } },
            levels: {
              type: "array",
              items: { $ref: "#/$defs/classLevel" }
            },
            description: { type: "string" },
            source: { type: "string" }
          },
          required: ["id", "name", "hitDie", "levels"]
        },
        classLevel: {
          type: "object",
          properties: {
            level: { type: "integer", minimum: 1, maximum: 20 },
            proficiencyBonus: { type: "integer" },
            features: { type: "array", items: { $ref: "#/$defs/feature" } },
            hitDie: {
              type: "object",
              properties: {
                amount: { type: "integer" },
                die: { type: "integer" }
              }
            },
            abilityScoreImprovement: { type: "boolean" },
            featChoice: { type: "boolean" },
            subclassChoice: { type: "boolean" },
            additionalChoices: { type: "array", items: { $ref: "#/$defs/choice" } }
          },
          required: ["level", "proficiencyBonus", "features"]
        },
        race: {
          type: "object", 
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            abilityScoreIncrease: { type: "object" },
            size: { type: "string", enum: ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"] },
            speed: { type: "integer" },
            languages: { type: "array", items: { type: "string" } },
            traits: { type: "array", items: { $ref: "#/$defs/feature" } },
            description: { type: "string" },
            source: { type: "string" }
          },
          required: ["id", "name", "size", "speed"]
        },
        background: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            skillProficiencies: { type: "array", items: { type: "string" } },
            languages: { type: "array", items: { type: "string" } },
            equipment: { type: "array", items: { type: "string" } },
            feature: { $ref: "#/$defs/feature" },
            description: { type: "string" },
            source: { type: "string" }
          },
          required: ["id", "name"]
        },
        feature: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            level: { type: "integer", minimum: 1, maximum: 20 },
            source: { type: "string" },
            type: { type: "string", enum: ["class", "race", "background", "feat", "optional"] },
            prerequisite: { type: "string" }
          },
          required: ["id", "name", "description"]
        },
        spell: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            level: { type: "integer", minimum: 0, maximum: 9 },
            school: { type: "string", enum: ["abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation"] },
            castingTime: { type: "string" },
            range: { type: "string" },
            components: { type: "array", items: { type: "string" } },
            duration: { type: "string" },
            description: { type: "string" },
            source: { type: "string" }
          },
          required: ["id", "name", "level", "school", "description"]
        },
        subclass: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            parentClass: { type: "string" },
            description: { type: "string" },
            features: { type: "array", items: { $ref: "#/$defs/feature" } },
            source: { type: "string" }
          },
          required: ["id", "name", "parentClass"]
        },
        choice: {
          type: "object",
          properties: {
            type: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            maxSelections: { type: "integer", minimum: 1 }
          },
          required: ["type", "title", "options", "maxSelections"]
        }
      },
      required: ["metadata", "classes", "races", "backgrounds", "features", "spells", "subclasses"]
    };
  }









  function exportStructuredData() {
    try {
      // Get current schemas from localStorage
      const itemsSchemaData = localStorage.getItem('dnd_items_schema');
      const characterSchemaData = localStorage.getItem('dnd_character_schema');
      
      if (!itemsSchemaData || !characterSchemaData) {
        // Build the schemas first if they don't exist
        buildAndSaveStructuredData();
        setTimeout(() => exportStructuredData(), 100);
        return;
      }

      const timestamp = new Date().toISOString().split('T')[0];
      
      // Export items schema
      const itemsBlob = new Blob([itemsSchemaData], {type: 'application/json'});
      const itemsLink = document.createElement('a');
      itemsLink.href = URL.createObjectURL(itemsBlob);
      itemsLink.download = `dnd_items_schema_${timestamp}.json`;
      itemsLink.click();
      URL.revokeObjectURL(itemsLink.href);
      
      // Export character schema
      const characterBlob = new Blob([characterSchemaData], {type: 'application/json'});
      const characterLink = document.createElement('a');
      characterLink.href = URL.createObjectURL(characterBlob);
      characterLink.download = `dnd_character_schema_${timestamp}.json`;
      characterLink.click();
      URL.revokeObjectURL(characterLink.href);

      // Show success message
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('showFunnyText', {
          detail: { text: 'AI schemas exported successfully!', category: 'treasure' }
        }));
        window.dispatchEvent(new CustomEvent('playButtonClick'));
      }
      
      successMessage = 'AI schema files exported successfully!';
      setTimeout(() => successMessage = undefined, 3000);
      
    } catch (error) {
      console.error('Export failed:', error);
      errorMessage = 'Failed to export schema files.';
      setTimeout(() => errorMessage = undefined, 3000);
    }
  }

  function toggleSource(index: number) {
    sources[index].enabled = !sources[index].enabled;
    saveSources();
  }

  function removeSource(index: number) {
    sources.splice(index, 1);
    saveSources();
  }

  function getFileName(source: any): string {
    return source.fileName || source.extractedData?.className || 'Unknown Source';
  }

  function getSourceDescription(source: any): string {
    const className = source.extractedData?.className;
    const processedAt = new Date(source.processedAt).toLocaleDateString();
    
    if (className) {
      return `${className} - imported ${processedAt}`;
    }
    return `Imported ${processedAt}`;
  }

  function closeDialog() {
    isOpen = false;
    showImportDialog = false;
    errorMessage = undefined;
    successMessage = undefined;
  }

  function openImportDialog() {
    showImportDialog = true;
    errorMessage = undefined;
    successMessage = undefined;
  }

  function closeImportDialog() {
    showImportDialog = false;
    errorMessage = undefined;
    successMessage = undefined;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  }

  function handleFileInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  }

  async function handleFileUpload(file: File) {
    processing = true;
    errorMessage = undefined;
    successMessage = undefined;

    try {
      const fileType = getSourceKind(file);

      const sourceData: CharacterSourceData = {
        type: fileType,
        content: file
      };

      // Update processing message based on file type
      if (fileType === 'pdf') {
        processingMessage = `Extracting text from PDF with Claude AI... (${(file.size / 1024 / 1024).toFixed(1)}MB)`;
      } else if (fileType === 'image') {
        processingMessage = `Analyzing image content with Claude AI... (${(file.size / 1024 / 1024).toFixed(1)}MB)`;
      } else {
        processingMessage = 'Processing character source with AI...';
      }

      const extractedData = await processCharacterSource(sourceData);
      
      if (extractedData) {
        // Store the extracted data for level-up system
        storeCharacterSource(sourceData, extractedData);
        
        successMessage = `Character source processed successfully! Extracted ${extractedData.className || 'Unknown Class'} level progression data.`;
        console.log('Extracted progression data:', extractedData);
        
        // Reload sources to show the new one
        loadSources();
      }
    } catch (error: any) {
      errorMessage = `Failed to process character source: ${error instanceof Error ? error.message : String(error)}`;
      console.error('Processing error:', error);
    } finally {
      processing = false;
    }
  }


  function storeCharacterSource(sourceData: CharacterSourceData, extractedData: any) {
    try {
      // Get existing sources from localStorage
      const existingSources = localStorage.getItem('character_sources');
      let sources = [];
      
      if (existingSources) {
        sources = JSON.parse(existingSources);
      }
      
      // Create new source entry
      const newSource = {
        type: sourceData.type,
        fileName: sourceData.content instanceof File ? sourceData.content.name : 'unknown',
        extractedData: extractedData,
        processedAt: new Date().toISOString(),
        content: sourceData.content instanceof File ? '' : sourceData.content, // Don't store file content
        enabled: true // Default to enabled
      };
      
      // Add to sources array (limit to last 10 sources)
      sources.push(newSource);
      if (sources.length > 10) {
        sources = sources.slice(-10);
      }
      
      // Save back to localStorage
      localStorage.setItem('character_sources', JSON.stringify(sources));
      
      console.log('Character source stored successfully:', newSource);
    } catch (error) {
      console.error('Failed to store character source:', error);
    }
  }

  async function processCharacterSource(sourceData: CharacterSourceData) {
    if (!(sourceData.content instanceof File)) {
      return parseTextToClassData(sourceData.content, 'Text Input');
    }

    const source = await getSource(sourceData.content);

    if (source.kind === 'json') {
      return validateAndNormalizeSchema(JSON.parse(source.text));
    }

    if (source.kind === 'text') {
      return parseTextToClassData(source.text, source.name);
    }

    return postClassProgression(source.text, source.name);
  }

  function validateAndNormalizeSchema(data: any) {
    // Validate that the JSON has the required structure
    if (!data.className || typeof data.className !== 'string') {
      throw new Error('JSON must include a "className" field');
    }
    
    if (!data.levels || !Array.isArray(data.levels)) {
      throw new Error('JSON must include a "levels" array');
    }

    // Normalize the schema to match our expected format
    const normalized = {
      className: data.className,
      hitDie: data.hitDie || 8,
      primaryAbility: data.primaryAbility || [],
      savingThrowProficiencies: data.savingThrowProficiencies || [],
      levels: data.levels.map((level: any) => ({
        level: level.level,
        proficiencyBonus: level.proficiencyBonus || Math.ceil(level.level / 4) + 1,
        features: level.features || [],
        hitDie: level.hitDie || { amount: level.level, die: data.hitDie || 8 },
        abilityScoreImprovement: level.abilityScoreImprovement || level.level % 4 === 0,
        featChoice: level.featChoice || level.level % 4 === 0,
        subclassChoice: level.subclassChoice || level.level === 3,
        additionalChoices: level.additionalChoices || level.choices || []
      }))
    };

    return normalized;
  }

  function parseTextToClassData(content: string, fileName: string) {
    // Extract class name from filename or content
    const className = fileName.replace(/\.(txt|json)$/i, '').replace(/[-_]/g, ' ').trim() || 'Custom Class';
    
    // Basic text parsing - look for level-based content
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const levels: any[] = [];
    
    // Try to find level information
    let currentLevel = 1;
    let currentFeatures: any[] = [];
    
    for (const line of lines) {
      // Look for level indicators
      const levelMatch = line.match(/(?:level|lvl)\s*(\d+)/i);
      if (levelMatch) {
        // Save previous level if we have features
        if (currentFeatures.length > 0 && currentLevel <= 20) {
          levels.push({
            level: currentLevel,
            proficiencyBonus: Math.ceil(currentLevel / 4) + 1,
            features: currentFeatures.map((feature, index) => ({
              id: `text_feature_${currentLevel}_${index}`,
              level: currentLevel,
              source: "class",
              title: feature.split('.')[0].trim(),
              description: feature
            })),
            hitDie: { amount: currentLevel, die: 8 },
            abilityScoreImprovement: currentLevel % 4 === 0,
            featChoice: currentLevel % 4 === 0
          });
        }
        
        currentLevel = parseInt(levelMatch[1]);
        currentFeatures = [];
      } else if (line.length > 10) {
        // Collect potential features
        currentFeatures.push(line);
      }
    }
    
    // Add the last level
    if (currentFeatures.length > 0 && currentLevel <= 20) {
      levels.push({
        level: currentLevel,
        proficiencyBonus: Math.ceil(currentLevel / 4) + 1,
        features: currentFeatures.map((feature, index) => ({
          id: `text_feature_${currentLevel}_${index}`,
          level: currentLevel,
          source: "class",
          title: feature.split('.')[0].trim(),
          description: feature
        })),
        hitDie: { amount: currentLevel, die: 8 },
        abilityScoreImprovement: currentLevel % 4 === 0,
        featChoice: currentLevel % 4 === 0
      });
    }
    
    // If we couldn't parse any levels, create a basic structure
    if (levels.length === 0) {
      levels.push({
        level: 1,
        proficiencyBonus: 2,
        features: [{
          id: 'imported_text',
          level: 1,
          source: "class",
          title: 'Imported Text Content',
          description: content.substring(0, 500) + (content.length > 500 ? '...' : '')
        }],
        hitDie: { amount: 1, die: 8 },
        abilityScoreImprovement: false,
        featChoice: false
      });
    }

    return {
      className,
      hitDie: 8,
      levels
    };
  }

  async function postClassProgression(content: string, fileName: string): Promise<any> {
    const output = await aiService.postPrediction({
      prompt: `Read this D&D class or character material and pull out the level progression.

Material:
${content}

Answer with JSON and nothing else: className, hitDie, primaryAbility, savingThrowProficiencies, and a levels array carrying level, features, abilityScoreImprovement, featChoice and subclassChoice for each level named.`
    });

    const match = output.text.match(/\{[\s\S]*\}/);

    if (match) {
      try {
        return validateAndNormalizeSchema(JSON.parse(match[0]));
      } catch {
        return parseTextToClassData(output.text, fileName);
      }
    }

    return parseTextToClassData(output.text, fileName);
  }
</script>

{#if isOpen && !showImportDialog}
  <BaseDialog bind:isOpen title="Character Sources" onClose={closeDialog} width="760px" zIndex={9999}>
    <div class="content">
      <div class="crest">
        <Ornament name="crest" size="md" tone="metal" />
      </div>

      <p class="description">Manage character progression sources for level-up capabilities</p>

      <div class="actions">
        <Button variant="primary" onclick={openImportDialog}>
          <Glyph name="sources" size="sm" />
          Import New Source
        </Button>
        <Button variant="secondary" onclick={buildAndSaveStructuredData}>Rebuild Database</Button>
        <Button variant="secondary" onclick={exportStructuredData}>
          <Glyph name="export" size="sm" />
          Export Database
        </Button>
      </div>

      {#if sources.length === 0}
        <div class="niche">
          <span class="niche-arch">
            <Ornament name="lancet" size="lg" tone="metal" />
          </span>
          <h3 class="niche-title">No Sources Imported</h3>
          <p class="niche-note">Import D&D sourcebooks, class descriptions, or character sheets to unlock level-up capabilities.</p>
          <Button variant="primary" onclick={openImportDialog}>Import Your First Source</Button>
        </div>
      {:else}
        <ul class="sources">
          {#each sources as source, index}
            <li class="source" class:source-dim={!source.enabled}>
              <input
                class="source-toggle"
                type="checkbox"
                id="source-{index}"
                checked={source.enabled}
                aria-label="Use {getFileName(source)}"
                onchange={() => toggleSource(index)}
              />

              <span class="source-rune">
                <Ornament name="rune" size="sm" tone={source.enabled ? 'metal' : 'ink'} />
              </span>

              <div class="source-info">
                <h4 class="source-name">{getFileName(source)}</h4>
                <p class="source-note">{getSourceDescription(source)}</p>
                {#if source.extractedData?.levels}
                  <span class="source-levels">{source.extractedData.levels.length} levels available</span>
                {/if}
              </div>

              <Button variant="danger" size="sm" title="Remove source" onclick={() => removeSource(index)}>
                <Glyph name="close" size="sm" />
              </Button>
            </li>
          {/each}
        </ul>
      {/if}

      <p class="tally">
        <strong>Enabled sources:</strong> {sources.filter(s => s.enabled).length} / {sources.length}
        <span class="tally-sep" aria-hidden="true"><Ornament name="quatrefoil" size="xs" tone="metal" /></span>
        Only enabled sources are used for level-up calculations
      </p>
    </div>
  </BaseDialog>
{/if}

{#if showImportDialog}
  <BaseDialog bind:isOpen={showImportDialog} title="Import Character Source" onClose={closeImportDialog} width="600px" zIndex={9999}>
    <div class="content">
      <div class="crest">
        <Ornament name="crest" size="md" tone="metal" />
      </div>

      <p class="description">Upload character class descriptions, PDFs, or images to extract level progression data</p>

      {#if processing}
        <div class="reading">
          <span class="dnd-spinner"></span>
          <p class="reading-note">{processingMessage}</p>
        </div>
      {:else}
        <div
          class="drop"
          class:drop-live={dragActive}
          role="region"
          aria-label="Character source drop zone"
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          ondrop={handleDrop}
        >
          <h3 class="drop-title">Drop files here or click to browse</h3>
          <Field label="Source file" id="source-file" help="Supports JSON, TXT, PDF, and images">
            <input id="source-file" type="file" accept={SOURCE_ACCEPT} onchange={handleFileInput} />
          </Field>
        </div>
      {/if}

      {#if errorMessage}
        <div class="message message-bad" role="alert">
          <span class="message-mark"><Glyph name="close" size="sm" /></span>
          <p class="message-text">{errorMessage}</p>
        </div>
      {/if}

      {#if successMessage}
        <div class="message message-good" role="status">
          <span class="message-mark"><Ornament name="quatrefoil" size="xs" tone="metal" /></span>
          <p class="message-text">{successMessage}</p>
          <Button variant="secondary" size="sm" onclick={closeImportDialog}>Done</Button>
        </div>
      {/if}

      <div class="formats">
        <h4 class="formats-title">Supported Formats:</h4>
        <ul class="formats-list">
          <li><strong>JSON:</strong> Structured character class data (recommended)</li>
          <li><strong>Text:</strong> Plain text class descriptions with level info</li>
          <li><strong>PDF:</strong> Extract text and process with Claude 4 Sonnet</li>
          <li><strong>Images:</strong> Analyze character sheets with Claude 4 Sonnet</li>
        </ul>
        <div class="formats-note formats-note-schema">
          <h5 class="formats-note-title">JSON Schema Example:</h5>
          <small>Your JSON should include: <code>className</code>, <code>hitDie</code>, and <code>levels[]</code> array with level progression data.</small>
        </div>
        <div class="formats-note formats-note-tip">
          <small><strong>Tip:</strong> For best results, use the JSON format with structured level progression data.</small>
        </div>
      </div>
    </div>
  </BaseDialog>
{/if}

<style>
  .content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .crest {
    display: flex;
    justify-content: center;
    opacity: 0.9;
  }

  .description {
    margin: calc(var(--space-2) * -1) 0 0;
    text-align: center;
    color: var(--ink-dim);
    font-style: italic;
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
  }

  .niche {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-6) var(--space-4);
    text-align: center;
    background:
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--radius-lg);
    box-shadow: var(--rim), inset 0 0 22px 4px var(--shade-hard);
  }

  .niche-arch {
    display: flex;
    opacity: 0.85;
  }

  .niche-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 12px color-mix(in srgb, var(--ember-glow) 60%, transparent);
  }

  .niche-note {
    max-width: 46ch;
    margin: 0 0 var(--space-2);
    color: var(--ink-dim);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .sources {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .source {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    background:
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), inset 0 0 14px 2px var(--shade-hard), var(--shadow-sm);
    transition: box-shadow 0.15s ease, opacity 0.15s ease;
  }

  .source:hover {
    box-shadow: inset 0 0 0 1px var(--keyline), inset 0 0 0 2px var(--metal-bright), inset 0 0 0 3px var(--keyline), inset 0 0 14px 2px var(--shade-hard), var(--shadow-sm);
  }

  .source-dim {
    opacity: 0.55;
  }

  .source-toggle {
    flex: none;
    width: var(--space-5);
    height: var(--space-5);
    margin: 0;
    appearance: none;
    background: linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    box-shadow: var(--bevel-down), inset 0 var(--border-width) var(--space-2) var(--shade-hard);
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .source-toggle:hover {
    border-color: var(--metal);
  }

  .source-toggle:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .source-toggle:checked {
    border-color: var(--metal);
    background: radial-gradient(circle at 50% 50%, var(--ember) 0%, var(--ember) 32%, transparent 38%),
      linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: inset 0 var(--border-width) var(--space-2) var(--shade-hard), var(--glow-ember);
  }

  .source-rune {
    display: flex;
    flex: none;
  }

  .source-info {
    flex: 1;
    min-width: 0;
  }

  .source-name {
    margin: 0 0 var(--space-1);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-note {
    margin: 0;
    color: var(--ink-faint);
    font-size: var(--text-xs);
  }

  .source-levels {
    display: inline-block;
    margin-top: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background: color-mix(in srgb, var(--verdigris) 18%, transparent);
    border: var(--border-hair) solid var(--verdigris-dim);
    border-radius: var(--radius-sm);
    color: var(--verdigris);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
  }

  .tally {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin: 0;
    padding-top: var(--space-4);
    border-top: var(--border-hair) solid var(--metal-dim);
    box-shadow: inset 0 1px 0 var(--keyline);
    color: var(--ink-faint);
    font-size: var(--text-xs);
    text-align: center;
  }

  .tally strong {
    font-family: var(--font-figures);
    color: var(--metal-bright);
  }

  .tally-sep {
    display: flex;
    opacity: 0.7;
  }

  .reading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-7) var(--space-4);
  }

  .reading-note {
    margin: 0;
    color: var(--ink-dim);
    font-size: var(--text-sm);
    text-align: center;
  }

  .drop {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    background:
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border: var(--border-hair) dashed var(--metal-dim);
    border-radius: var(--radius-sm);
    box-shadow: var(--bevel-down), inset 0 0 22px 4px var(--shade-hard);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .drop-live,
  .drop:focus-within {
    border-color: var(--metal-bright);
    border-style: solid;
    box-shadow: var(--bevel-down), inset 0 0 22px 4px var(--shade-hard), inset 0 0 30px -10px var(--ember-glow), var(--glow-metal);
  }

  .drop-title {
    margin: 0;
    text-align: center;
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .drop :global(input[type='file']) {
    cursor: pointer;
  }

  .message {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: var(--border-hair) solid var(--message-rim);
    border-radius: var(--radius-sm);
    background: linear-gradient(180deg, color-mix(in srgb, var(--message-rim) 14%, transparent), transparent), var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
  }

  .message-bad {
    --message-rim: var(--state-bad);
  }

  .message-good {
    --message-rim: var(--state-good);
  }

  .message-mark {
    display: flex;
    flex: none;
    color: var(--message-rim);
  }

  .message-text {
    flex: 1;
    margin: 0;
    color: var(--ink);
    font-size: var(--text-sm);
  }

  .formats {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), inset 0 0 14px 2px var(--shade-hard);
  }

  .formats-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .formats-list {
    margin: 0;
    padding-left: var(--space-5);
    color: var(--ink-dim);
    font-size: var(--text-xs);
    line-height: 1.6;
  }

  .formats-list strong {
    color: var(--ink);
  }

  .formats-note {
    padding: var(--space-3);
    border: var(--border-hair) solid var(--note-rim);
    border-radius: var(--radius-sm);
    background: linear-gradient(180deg, color-mix(in srgb, var(--note-rim) 10%, transparent), transparent), var(--ground-deep);
    box-shadow: var(--bevel-down);
    color: var(--ink-dim);
    font-size: var(--text-xs);
    line-height: 1.5;
  }

  .formats-note-schema {
    --note-rim: var(--verdigris);
  }

  .formats-note-tip {
    --note-rim: var(--state-warn);
  }

  .formats-note-title {
    margin: 0 0 var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    color: var(--verdigris);
  }

  .formats-note strong {
    color: var(--state-warn);
  }

  .formats-note code {
    padding: 0 var(--space-1);
    background: var(--ground-deep);
    border: var(--border-hair) solid var(--metal-dim);
    box-shadow: var(--bevel-down);
    border-radius: var(--radius-sm);
    color: var(--metal-bright);
    font-family: var(--font-mono);
  }

  @media (max-width: 640px) {
    .content {
      padding: var(--space-4);
    }

    .source {
      flex-wrap: wrap;
    }
  }
</style>
