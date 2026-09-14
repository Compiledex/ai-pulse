/**
 * The hero background: a slowly drifting network of nodes. Nearby nodes are
 * linked, and "signals" travel along the links — the pulse in AI Pulse.
 * Nodes near the pointer part around it and link up to it.
 */

export const DEFAULT_PALETTE = ['167,139,250', '34,211,238', '244,114,182'];

/**
 * Starts the animation and returns `{ setPalette }`, which recolours the
 * network (e.g. to the brand colour of the AI in focus). Colours are "r,g,b".
 */
export function startNeural(canvas) {
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let nodes = [];
  let signals = [];
  let running = true;
  let frame = 0;
  let palette = DEFAULT_PALETTE;
  const pick = () => palette[Math.floor(Math.random() * palette.length)];
  const pointer = { x: -9999, y: -9999, active: false };

  const linkDistance = () => Math.min(170, Math.max(110, width / 9));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.round(Math.min(110, Math.max(36, (width * height) / 14000)));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.6 + 0.8,
      c: pick(),
      glow: 0,
    }));
    signals = [];
  }

  function spawnSignal() {
    const a = nodes[Math.floor(Math.random() * nodes.length)];
    const max = linkDistance();
    const near = nodes.filter((b) => b !== a && Math.hypot(a.x - b.x, a.y - b.y) < max);
    if (!near.length) return;
    const b = near[Math.floor(Math.random() * near.length)];
    signals.push({ a, b, t: 0, speed: 0.012 + Math.random() * 0.018, c: a.c, hops: 2 + Math.floor(Math.random() * 4) });
  }

  function step() {
    const max = linkDistance();
    ctx.clearRect(0, 0, width, height);

    for (const n of nodes) {
      if (!reduced) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -20) n.x = width + 20;
        if (n.x > width + 20) n.x = -20;
        if (n.y < -20) n.y = height + 20;
        if (n.y > height + 20) n.y = -20;

        if (pointer.active) {
          const dx = pointer.x - n.x;
          const dy = pointer.y - n.y;
          const d = Math.hypot(dx, dy);
          // A soft push away from the cursor — attraction would clump nodes.
          if (d < 140 && d > 1) {
            const force = (1 - d / 140) * 1.4;
            n.x -= (dx / d) * force;
            n.y -= (dy / d) * force;
          }
        }
      }
      n.glow *= 0.94;
    }

    // Links
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < max) {
          const alpha = (1 - d / max) * 0.22;
          ctx.strokeStyle = `rgba(${a.c},${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Pointer links
    if (pointer.active) {
      for (const n of nodes) {
        const d = Math.hypot(pointer.x - n.x, pointer.y - n.y);
        if (d < 180) {
          ctx.strokeStyle = `rgba(${n.c},${(1 - d / 180) * 0.45})`;
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(n.x, n.y);
          ctx.stroke();
        }
      }
    }

    // Signals travelling along links, hopping onward when they arrive
    if (!reduced && frame % 14 === 0 && signals.length < 26) spawnSignal();
    signals = signals.filter((s) => {
      s.t += s.speed;
      if (s.t >= 1) {
        s.b.glow = 1;
        if (--s.hops <= 0) return false;
        const near = nodes.filter((n) => n !== s.b && n !== s.a && Math.hypot(n.x - s.b.x, n.y - s.b.y) < max);
        if (!near.length) return false;
        s.a = s.b;
        s.b = near[Math.floor(Math.random() * near.length)];
        s.t = 0;
      }
      if (Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y) > max * 1.3) return false;

      const x = s.a.x + (s.b.x - s.a.x) * s.t;
      const y = s.a.y + (s.b.y - s.a.y) * s.t;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 10);
      g.addColorStop(0, `rgba(${s.c},0.95)`);
      g.addColorStop(1, `rgba(${s.c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });

    // Nodes
    for (const n of nodes) {
      ctx.fillStyle = `rgba(${n.c},${0.55 + n.glow * 0.45})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + n.glow * 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (n.glow > 0.05) {
        ctx.fillStyle = `rgba(${n.c},${n.glow * 0.25})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 10 * n.glow + 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    frame++;
  }

  function loop() {
    if (!running) return;
    step();
    requestAnimationFrame(loop);
  }

  resize();
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); if (reduced) step(); }, 150);
  });

  const host = canvas.parentElement;
  host.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.active = e.pointerType === 'mouse';
  });
  host.addEventListener('pointerleave', () => { pointer.active = false; });

  const controller = {
    setPalette(colors) {
      palette = colors?.length ? colors : DEFAULT_PALETTE;
      for (const n of nodes) {
        n.c = pick();
        n.glow = Math.random(); // a brief shimmer as the network changes colour
      }
      signals = [];
      if (reduced) step();
    },
  };

  if (reduced) {
    step(); // one still frame
    return controller;
  }

  // Only animate while the hero is on screen and the tab is visible.
  new IntersectionObserver(([entry]) => {
    const shouldRun = entry.isIntersecting && !document.hidden;
    if (shouldRun && !running) { running = true; loop(); }
    if (!shouldRun) running = false;
  }).observe(canvas);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running && canvas.getBoundingClientRect().bottom > 0) { running = true; loop(); }
  });

  loop();
  return controller;
}
