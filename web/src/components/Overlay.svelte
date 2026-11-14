<script lang="ts">
  import { onMount } from 'svelte';
  
  // Canvas-based effects (damage, particles, animations)
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let damageTexts: DamageText[] = [];
  let confetti: ConfettiParticle[] = [];
  let levelUpParticles: LevelUpParticle[] = [];
  let animationId: number;
  
  // DOM-based text displays (funny text, notifications)
  let displayTexts = $state<TextDisplay[]>([]);
  let textId = 0;
  
  // Types for canvas-based effects
  interface DamageText {
    id: string;
    text: string;
    x: number;
    y: number;
    startY: number;
    opacity: number;
    scale: number;
    color: string;
    type: 'damage' | 'heal' | 'critical' | 'miss';
    startTime: number;
    duration: number;
  }
  
  interface ConfettiParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    rotation: number;
    rotationSpeed: number;
    color: string;
    size: number;
    shape: 'square' | 'circle' | 'triangle';
    gravity: number;
    life: number;
    maxLife: number;
  }
  
  interface LevelUpParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    type: 'star' | 'spark' | 'ring' | 'burst';
    life: number;
    maxLife: number;
    rotation: number;
    rotationSpeed: number;
    scale: number;
    pulse: number;
  }
  
  // Types for DOM-based text
  interface TextDisplay {
    id: number;
    text: string;
    category: string;
    opacity: number;
    scale: number;
    x: number;
    y: number;
    rotation: number;
  }
  
  // Canvas functions
  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  
  function createConfetti(x: number, y: number, count: number = 50) {
    const getThemeColor = (varName: string) => {
      return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    };
    
    const primaryColor = getThemeColor('--metal') || 'var(--metal)';
    const secondaryColor = getThemeColor('--ember') || 'var(--state-bad)';
    const accentColor = getThemeColor('--metal-dim') || 'var(--metal-dim)';
    
    const colors = [
      primaryColor,
      secondaryColor, 
      accentColor,
      'var(--verdigris)', 
      'var(--verdigris)', 
      'var(--state-good)', 
      'var(--ember-core)', 
      'var(--metal-bright)', 
      'var(--verdigris)'
    ];
    
    for (let i = 0; i < count; i++) {
      confetti.push({
        x: x + (Math.random() - 0.5) * 100,
        y: y + (Math.random() - 0.5) * 50,
        vx: (Math.random() - 0.5) * 10,
        vy: Math.random() * -8 - 4,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        shape: ['square', 'circle', 'triangle'][Math.floor(Math.random() * 3)] as 'square' | 'circle' | 'triangle',
        gravity: 0.3,
        life: 1,
        maxLife: Math.random() * 60 + 60
      });
    }
  }
  
  function createLevelUpAnimation(level: number) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    const getThemeColor = (varName: string, fallback: string) => {
      return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
    };
    
    const primaryColor = getThemeColor('--metal', 'var(--metal)');
    const secondaryColor = getThemeColor('--ember', 'var(--ember)');
    
    const colors = [primaryColor, secondaryColor, 'var(--state-good)', 'var(--ember-core)', 'var(--metal-bright)', 'var(--verdigris)'];
    
    // Ring explosion from center
    for (let i = 0; i < 50; i++) {
      const angle = (i / 50) * Math.PI * 2;
      const speed = 4 + Math.random() * 3;
      levelUpParticles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 8 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        type: 'ring',
        life: 180,
        maxLife: 180,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 8,
        scale: 1,
        pulse: 0
      });
    }
    
    // Upward burst 
    for (let i = 0; i < 80; i++) {
      const angle = -Math.PI/2 + (Math.random() - 0.5) * Math.PI/3;
      const speed = 6 + Math.random() * 8;
      levelUpParticles.push({
        x: centerX + (Math.random() - 0.5) * 200,
        y: centerY + 100,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 6 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        type: 'star',
        life: 220,
        maxLife: 220,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        scale: 0.5 + Math.random() * 0.5,
        pulse: Math.random() * Math.PI * 2
      });
    }
    
    // Sparks from edges
    for (let i = 0; i < 60; i++) {
      const side = Math.floor(Math.random() * 4);
      let startX = 0;
      let startY = 0;
      
      switch(side) {
        case 0: // Top
          startX = Math.random() * window.innerWidth;
          startY = 0;
          break;
        case 1: // Right  
          startX = window.innerWidth;
          startY = Math.random() * window.innerHeight;
          break;
        case 2: // Bottom
          startX = Math.random() * window.innerWidth;
          startY = window.innerHeight;
          break;
        case 3: // Left
          startX = 0;
          startY = Math.random() * window.innerHeight;
          break;
      }
      
      const dx = centerX - startX;
      const dy = centerY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const speed = 3 + Math.random() * 4;
      
      levelUpParticles.push({
        x: startX,
        y: startY,
        vx: (dx / distance) * speed,
        vy: (dy / distance) * speed,
        size: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        type: 'spark',
        life: Math.floor(distance / speed) + 60,
        maxLife: Math.floor(distance / speed) + 60,
        rotation: Math.atan2(dy, dx),
        rotationSpeed: 0,
        scale: 1,
        pulse: 0
      });
    }
    
    // Central burst with delay
    setTimeout(() => {
      for (let i = 0; i < 100; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 8 + Math.random() * 12;
        levelUpParticles.push({
          x: centerX,
          y: centerY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 10 + Math.random() * 8,
          color: colors[Math.floor(Math.random() * colors.length)],
          type: 'burst',
          life: 300,
          maxLife: 300,
          rotation: 0,
          rotationSpeed: (Math.random() - 0.5) * 15,
          scale: 1.5,
          pulse: 0
        });
      }
    }, 500);
    
    setTimeout(() => {
      createConfetti(centerX, centerY, 200);
    }, 200);
    
    addDamageText(level, 'critical', centerX, centerY - 100);
  }
  
  function addDamageText(damage: number, type: 'damage' | 'heal' | 'critical' | 'miss', x?: number, y?: number) {
    const getThemeColor = (varName: string, fallback: string) => {
      return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
    };
    
    const colors = {
      damage: getThemeColor('--ember', 'var(--state-bad)'),
      heal: 'var(--state-good)',
      critical: getThemeColor('--metal', 'var(--metal)'),
      miss: 'var(--ink-dim)'
    };
    
    const targetX = x ?? window.innerWidth / 2 + (Math.random() - 0.5) * 200;
    const targetY = y ?? window.innerHeight / 2 + (Math.random() - 0.5) * 100;
    
    const damageText: DamageText = {
      id: crypto.randomUUID(),
      text: type === 'miss' ? 'MISS' : type === 'critical' ? `${damage}!` : damage.toString(),
      x: targetX,
      y: targetY,
      startY: targetY,
      opacity: 1,
      scale: type === 'critical' ? 1.5 : 1,
      color: colors[type],
      type,
      startTime: Date.now(),
      duration: type === 'critical' ? 3000 : 2000
    };
    
    damageTexts.push(damageText);
    
    if (type === 'critical') {
      createConfetti(targetX, targetY, 25);
    } else if (type === 'damage') {
      createConfetti(targetX, targetY, 8);
    } else if (type === 'heal') {
      createConfetti(targetX, targetY, 12);
    }
  }
  
  // DOM text functions
  function showText(text: string, category: string, x?: number, y?: number) {
    let posX, posY;
    if (x !== undefined && y !== undefined) {
      posX = Math.max(10, Math.min(90, (x / window.innerWidth) * 100 + (Math.random() - 0.5) * 10));
      posY = Math.max(10, Math.min(90, (y / window.innerHeight) * 100 + (Math.random() - 0.5) * 10));
    } else {
      posX = Math.random() * 60 + 20;
      posY = Math.random() * 40 + 30;
    }

    const newText: TextDisplay = {
      id: textId++,
      text,
      category,
      opacity: 0,
      scale: 0.3,
      x: posX,
      y: posY,
      rotation: (Math.random() - 0.5) * 20
    };
    
    displayTexts.push(newText);
    
    // Animate in with bounce effect
    setTimeout(() => {
      const textElement = displayTexts.find(t => t.id === newText.id);
      if (textElement) {
        textElement.opacity = 1;
        textElement.scale = 1.2;
      }
    }, 50);
    
    setTimeout(() => {
      const textElement = displayTexts.find(t => t.id === newText.id);
      if (textElement) {
        textElement.scale = 1;
      }
    }, 200);
    
    // Float upward animation
    setTimeout(() => {
      const textElement = displayTexts.find(t => t.id === newText.id);
      if (textElement) {
        textElement.y -= 10;
        textElement.rotation += (Math.random() - 0.5) * 10;
      }
    }, 1000);
    
    // Animate out
    setTimeout(() => {
      const textElement = displayTexts.find(t => t.id === newText.id);
      if (textElement) {
        textElement.opacity = 0;
        textElement.scale = 0.8;
        textElement.y -= 5;
      }
    }, 2500);
    
    // Remove from array
    setTimeout(() => {
      displayTexts = displayTexts.filter(t => t.id !== newText.id);
    }, 3000);
  }
  
  // Canvas drawing functions
  function drawDamageText(text: DamageText) {
    if (!ctx) return;
    
    const elapsed = Date.now() - text.startTime;
    const progress = elapsed / text.duration;
    
    if (progress >= 1) {
      damageTexts = damageTexts.filter(t => t.id !== text.id);
      return;
    }
    
    const easeOut = 1 - Math.pow(1 - progress, 3);
    
    text.y = text.startY - (easeOut * 100);
    text.opacity = 1 - Math.pow(progress, 2);
    text.scale = text.type === 'critical' 
      ? 1.5 + Math.sin(elapsed * 0.01) * 0.2 
      : 1 + (1 - progress) * 0.3;
    
    ctx.save();
    ctx.globalAlpha = text.opacity;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const fontSize = (text.type === 'critical' ? 48 : 36) * text.scale;
    ctx.font = `bold ${fontSize}px ${getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'serif'}`;
    
    ctx.strokeStyle = 'var(--ground-deep)';
    ctx.lineWidth = 4;
    ctx.strokeText(text.text, text.x, text.y);
    
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, text.x, text.y);
    
    if (text.type === 'critical') {
      ctx.shadowColor = text.color;
      ctx.shadowBlur = 20;
      ctx.fillText(text.text, text.x, text.y);
      ctx.shadowBlur = 0;
    }
    
    ctx.restore();
  }
  
  function drawConfettiParticle(particle: ConfettiParticle) {
    if (!ctx) return;
    
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += particle.gravity;
    particle.rotation += particle.rotationSpeed;
    particle.life--;
    
    if (particle.life <= 0) {
      confetti = confetti.filter(p => p !== particle);
      return;
    }
    
    const alpha = particle.life / particle.maxLife;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation * Math.PI / 180);
    ctx.fillStyle = particle.color;
    
    switch (particle.shape) {
      case 'square':
        ctx.fillRect(-particle.size/2, -particle.size/2, particle.size, particle.size);
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(0, 0, particle.size/2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(0, -particle.size/2);
        ctx.lineTo(-particle.size/2, particle.size/2);
        ctx.lineTo(particle.size/2, particle.size/2);
        ctx.closePath();
        ctx.fill();
        break;
    }
    
    ctx.restore();
  }
  
  function drawLevelUpParticle(particle: LevelUpParticle) {
    if (!ctx) return;
    
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.rotation += particle.rotationSpeed;
    particle.pulse += 0.2;
    particle.life--;
    
    if (particle.life <= 0) {
      levelUpParticles = levelUpParticles.filter(p => p !== particle);
      return;
    }
    
    const alpha = particle.life / particle.maxLife;
    const pulseScale = 1 + Math.sin(particle.pulse) * 0.3;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation * Math.PI / 180);
    ctx.scale(particle.scale * pulseScale, particle.scale * pulseScale);
    
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = particle.size;
    ctx.fillStyle = particle.color;
    
    switch (particle.type) {
      case 'star':
        // Draw 5-pointed star
        ctx.beginPath();
        const spikes = 5;
        const outerRadius = particle.size;
        const innerRadius = particle.size * 0.4;
        for (let i = 0; i < spikes * 2; i++) {
          const radius = i % 2 === 0 ? outerRadius : innerRadius;
          const angle = (i / (spikes * 2)) * Math.PI * 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        break;
        
      case 'ring':
        ctx.beginPath();
        ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = particle.color;
        ctx.stroke();
        break;
        
      case 'spark':
        ctx.beginPath();
        ctx.moveTo(0, -particle.size);
        ctx.lineTo(particle.size/2, 0);
        ctx.lineTo(0, particle.size);
        ctx.lineTo(-particle.size/2, 0);
        ctx.closePath();
        ctx.fill();
        break;
        
      case 'burst':
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const length = particle.size + Math.sin(particle.pulse * 2) * particle.size * 0.5;
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = particle.color;
        ctx.stroke();
        break;
    }
    
    ctx.restore();
  }
  
  function animate() {
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    damageTexts.forEach(drawDamageText);
    confetti.forEach(drawConfettiParticle);
    levelUpParticles.forEach(drawLevelUpParticle);
    
    animationId = requestAnimationFrame(animate);
  }
  
  onMount(() => {
    if (!canvas) return;
    
    ctx = canvas.getContext('2d')!;
    resizeCanvas();
    animate();
    
    // Event listeners for canvas-based effects
    const handleDamageEvent = (event: CustomEvent) => {
      const { damage, type, x, y } = event.detail;
      addDamageText(damage, type, x, y);
    };
    
    const handleLevelUpEvent = (event: CustomEvent) => {
      const { level } = event.detail;
      createLevelUpAnimation(level);
    };
    
    // Event listeners for DOM-based text
    const handleFunnyText = (event: CustomEvent) => {
      const { text, category, x, y } = event.detail;
      showText(text, category, x, y);
    };
    
    window.addEventListener('showDamage', handleDamageEvent as EventListener);
    window.addEventListener('showLevelUpAnimation', handleLevelUpEvent as EventListener);
    window.addEventListener('showFunnyText', handleFunnyText as EventListener);
    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      window.removeEventListener('showDamage', handleDamageEvent as EventListener);
      window.removeEventListener('showLevelUpAnimation', handleLevelUpEvent as EventListener);
      window.removeEventListener('showFunnyText', handleFunnyText as EventListener);
      window.removeEventListener('resize', resizeCanvas);
    };
  });
</script>

<!-- Canvas for particle effects and damage text -->
<canvas 
  bind:this={canvas}
  class="overlay-canvas"
></canvas>

<!-- DOM-based text display container -->
<div class="text-overlay-container">
  {#each displayTexts as textItem (textItem.id)}
    <div 
      class="overlay-text {textItem.category}"
      style="
        opacity: {textItem.opacity}; 
        transform: scale({textItem.scale}) rotate({textItem.rotation}deg);
        left: {textItem.x}%;
        top: {textItem.y}%;
      "
    >
      {textItem.text}
    </div>
  {/each}
</div>

<style>
  .overlay-canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 9999;
  }
  
  .text-overlay-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9998;
    pointer-events: none;
  }
  
  .overlay-text {
    position: absolute;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 1.4em;
    font-weight: 700;
    text-shadow: 
      0 1px 0 var(--shadow-ink),
      0 -1px 0 var(--shadow-ink),
      1px 0 0 var(--shadow-ink),
      -1px 0 0 var(--shadow-ink),
      0 2px 6px var(--shade-hard);
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    transform-origin: center;
    white-space: nowrap;
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    user-select: none;
  }
  
  .overlay-text.criticalHit {
    color: var(--metal-bright);
    text-shadow: 
      0 1px 0 var(--shadow-ink), 0 -1px 0 var(--shadow-ink), 1px 0 0 var(--shadow-ink), -1px 0 0 var(--shadow-ink),
      0 0 10px var(--ember-glow),
      0 0 20px var(--ember),
      0 0 30px var(--ember-glow);
    animation: criticalPulse 0.6s ease-in-out;
  }
  
  .overlay-text.criticalFail {
    color: color-mix(in srgb, var(--state-bad) 70%, var(--ink));
    text-shadow: 
      0 1px 0 var(--shadow-ink), 0 -1px 0 var(--shadow-ink), 1px 0 0 var(--shadow-ink), -1px 0 0 var(--shadow-ink),
      0 0 10px var(--state-bad),
      0 0 20px var(--state-bad);
    animation: shakeFail 0.6s ease-in-out;
  }
  
  .overlay-text.levelUp {
    color: var(--state-good);
    text-shadow: 
      0 1px 0 var(--shadow-ink), 0 -1px 0 var(--shadow-ink), 1px 0 0 var(--shadow-ink), -1px 0 0 var(--shadow-ink),
      0 0 15px var(--state-good),
      0 0 25px var(--state-good),
      0 0 35px var(--state-good);
    animation: levelUpGlow 1.2s ease-in-out;
    font-size: 1.6em;
  }
  
  .overlay-text.healing {
    color: var(--state-good);
    text-shadow: 
      0 1px 0 var(--shadow-ink), 0 -1px 0 var(--shadow-ink), 1px 0 0 var(--shadow-ink), -1px 0 0 var(--shadow-ink),
      0 0 12px var(--state-good),
      0 0 22px var(--state-good);
    animation: healingPulse 0.8s ease-in-out;
  }
  
  .overlay-text.spellCast {
    color: var(--metal-bright);
    text-shadow: 
      0 1px 0 var(--shadow-ink), 0 -1px 0 var(--shadow-ink), 1px 0 0 var(--shadow-ink), -1px 0 0 var(--shadow-ink),
      0 0 12px var(--metal-bright),
      0 0 22px var(--ember-glow),
      0 0 32px var(--ember-glow);
    animation: magicSparkle 1s ease-in-out;
  }
  
  .overlay-text.treasure {
    color: var(--state-warn);
    text-shadow: 
      0 1px 0 var(--shadow-ink), 0 -1px 0 var(--shadow-ink), 1px 0 0 var(--shadow-ink), -1px 0 0 var(--shadow-ink),
      0 0 12px var(--state-warn),
      0 0 22px var(--state-warn),
      0 0 32px var(--state-warn);
    animation: treasureShine 1s ease-in-out;
  }
  
  .overlay-text.inspiration {
    color: var(--ember-core);
    text-shadow: 
      0 1px 0 var(--shadow-ink), 0 -1px 0 var(--shadow-ink), 1px 0 0 var(--shadow-ink), -1px 0 0 var(--shadow-ink),
      0 0 15px var(--ember-core),
      0 0 25px var(--ember-core),
      0 0 35px var(--ember-core);
    animation: inspirationBlast 1.2s ease-in-out;
    font-size: 1.6em;
    font-weight: 800;
  }
  
  @keyframes criticalPulse {
    0%, 100% { transform: scale(1) rotate(0deg); }
    25% { transform: scale(1.15) rotate(1deg); }
    50% { transform: scale(1.2) rotate(-1deg); }
    75% { transform: scale(1.1) rotate(1deg); }
  }
  
  @keyframes shakeFail {
    0%, 100% { transform: translateX(0) rotate(0deg); }
    20% { transform: translateX(-8px) rotate(-2deg); }
    40% { transform: translateX(8px) rotate(2deg); }
    60% { transform: translateX(-6px) rotate(-1deg); }
    80% { transform: translateX(4px) rotate(1deg); }
  }
  
  @keyframes levelUpGlow {
    0% { transform: scale(0.8) rotate(-5deg); filter: brightness(1); }
    25% { transform: scale(1.2) rotate(2deg); filter: brightness(1.3); }
    50% { transform: scale(1.15) rotate(-1deg); filter: brightness(1.5); }
    75% { transform: scale(1.05) rotate(1deg); filter: brightness(1.2); }
    100% { transform: scale(1) rotate(0deg); filter: brightness(1); }
  }
  
  @keyframes healingPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.9; transform: scale(1.08); filter: brightness(1.2); }
  }
  
  @keyframes magicSparkle {
    0% { transform: scale(1) rotate(0deg); filter: brightness(1); }
    25% { transform: scale(1.05) rotate(5deg); filter: brightness(1.25); }
    50% { transform: scale(1.1) rotate(-3deg); filter: brightness(1.45); }
    75% { transform: scale(1.05) rotate(4deg); filter: brightness(1.25); }
    100% { transform: scale(1) rotate(0deg); filter: brightness(1); }
  }
  
  @keyframes treasureShine {
    0%, 100% { transform: scale(1) rotate(0deg); filter: brightness(1); }
    50% { transform: scale(1.12) rotate(2deg); filter: brightness(1.4); }
  }
  
  @keyframes inspirationBlast {
    0% { transform: scale(0.6) rotate(-8deg); filter: brightness(1); }
    25% { transform: scale(1.3) rotate(5deg); filter: brightness(1.4); }
    50% { transform: scale(1.2) rotate(-3deg); filter: brightness(1.6); }
    75% { transform: scale(1.1) rotate(2deg); filter: brightness(1.3); }
    100% { transform: scale(1) rotate(0deg); filter: brightness(1); }
  }
  
  @media (max-width: 768px) {
    .overlay-text {
      font-size: 1.1em;
      letter-spacing: var(--tracking-wide);
    }
    
    .overlay-text.levelUp, .overlay-text.inspiration {
      font-size: 1.3em;
    }
  }
  
  @media (max-width: 480px) {
    .overlay-text {
      font-size: 1em;
    }
    
    .overlay-text.levelUp, .overlay-text.inspiration {
      font-size: 1.2em;
    }
  }
</style>
