// requestAnimationFrame with a timer fallback so animations still progress when rAF is throttled.
function nextFrame(cb) {
  let done = false;
  const run = () => { if (done) return; done = true; cb(performance.now()); };
  requestAnimationFrame(run);
  setTimeout(run, 40);
}

const FX = (() => {
  let cv, g, W = 1280, H = 720;
  const parts = [];
  const effects = [];
  const dust = [];
  const rain = [];
  let weather = null;
  let last = performance.now();

  const R = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  function init(canvas) {
    cv = canvas; g = cv.getContext('2d');
    for (let i = 0; i < 70; i++) dust.push(newDust(true));
    nextFrame(loop);
  }

  function newDust(anywhere) {
    // dust floats inside the sun beams coming from the upper-left windows
    const beam = Math.random() < 0.5 ? 0 : 1;
    const t = Math.random();
    const x0 = beam ? 470 : 230, y0 = 40;
    return {
      x: x0 + t * 380 + R(-60, 60), y: anywhere ? y0 + t * 360 + R(-30, 30) : y0 + t * 360,
      vx: R(-4, 6), vy: R(-3, 4), s: R(0.8, 2.4), a: R(0.15, 0.6), ph: R(0, 6.28),
    };
  }

  function add(p) {
    parts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, life: 1, age: 0, size: 4, grow: 0,
      color: '#fff', shape: 'circle', rot: 0, vr: 0, glow: true, drag: 1, alpha: 1, fade: true }, p));
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    g.clearRect(0, 0, W, H);

    // ambient dust in light rays
    g.globalCompositeOperation = 'lighter';
    for (const d of dust) {
      d.ph += dt; d.x += (d.vx + Math.sin(d.ph) * 3) * dt; d.y += (d.vy + Math.cos(d.ph * 0.7) * 2) * dt;
      const tw = 0.5 + 0.5 * Math.sin(d.ph * 2);
      g.fillStyle = `rgba(255,236,190,${d.a * tw})`;
      g.beginPath(); g.arc(d.x, d.y, d.s, 0, 7); g.fill();
      if (d.y > 470 || d.x > 1000 || d.x < 100 || d.y < 0) Object.assign(d, newDust(false));
    }
    g.globalCompositeOperation = 'source-over';

    // weather
    if (weather === 'rain') {
      while (rain.length < 220) rain.push({ x: R(-200, W), y: R(-H, 0), v: R(900, 1300) });
      g.strokeStyle = 'rgba(170,200,255,0.55)'; g.lineWidth = 1.5;
      g.beginPath();
      for (const r of rain) {
        r.y += r.v * dt; r.x += r.v * 0.25 * dt;
        if (r.y > H) { r.y = R(-100, 0); r.x = R(-200, W); }
        g.moveTo(r.x, r.y); g.lineTo(r.x - 5, r.y - 20);
      }
      g.stroke();
      g.fillStyle = 'rgba(40,60,110,0.12)'; g.fillRect(0, 0, W, H);
    } else if (weather === 'sun') {
      const gr = g.createRadialGradient(160, 40, 20, 160, 40, 900);
      gr.addColorStop(0, 'rgba(255,240,170,0.35)'); gr.addColorStop(1, 'rgba(255,170,60,0.05)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    } else if (weather === 'sand' || weather === 'hail') {
      const sand = weather === 'sand';
      while (rain.length < (sand ? 160 : 120)) rain.push({ x: R(-200, W), y: R(-H, H), v: sand ? R(500, 800) : R(250, 400), s: R(1, 3) });
      g.fillStyle = sand ? 'rgba(220,180,110,0.75)' : 'rgba(240,250,255,0.9)';
      for (const r of rain) {
        if (sand) { r.x += r.v * dt; r.y += r.v * 0.08 * dt; } else { r.y += r.v * dt; r.x += r.v * 0.2 * dt; }
        if (r.x > W + 20 || r.y > H) { r.x = sand ? R(-300, -10) : R(-100, W); r.y = sand ? R(0, H) : R(-80, 0); }
        if (sand) g.fillRect(r.x, r.y, 10 * r.s, r.s); else { g.beginPath(); g.arc(r.x, r.y, r.s + 1, 0, 7); g.fill(); }
      }
      g.fillStyle = sand ? 'rgba(160,110,40,0.14)' : 'rgba(200,220,255,0.12)'; g.fillRect(0, 0, W, H);
    }

    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.t += dt;
      if (e.update) e.update(e, dt);
      if (e.draw) e.draw(e, g);
      if (e.t >= e.dur) { effects.splice(i, 1); e.done && e.done(); }
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      if (p.target) {
        const k = p.age / p.life;
        const e = k * k * (3 - 2 * k);
        p.x = lerp(p.sx, p.target.x, e) + Math.sin(k * Math.PI) * (p.arcX || 0);
        p.y = lerp(p.sy, p.target.y, e) - Math.sin(k * Math.PI) * (p.arc || 0);
      } else {
        p.vx += p.ax * dt; p.vy += p.ay * dt;
        p.vx *= p.drag; p.vy *= p.drag;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      p.rot += p.vr * dt;
      const k = p.age / p.life;
      const a = p.fade ? p.alpha * (1 - k) : p.alpha;
      const s = Math.max(0.1, p.size + p.grow * p.age);
      drawPart(p, a, s);
    }
    nextFrame(loop);
  }

  function drawPart(p, a, s) {
    g.save();
    g.globalAlpha = Math.max(0, a);
    g.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
    g.translate(p.x, p.y); g.rotate(p.rot);
    g.fillStyle = p.color; g.strokeStyle = p.color;
    switch (p.shape) {
      case 'circle': {
        if (p.glow) {
          const gr = g.createRadialGradient(0, 0, 0, 0, 0, s);
          gr.addColorStop(0, p.core || '#fff'); gr.addColorStop(0.35, p.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
        }
        g.beginPath(); g.arc(0, 0, s, 0, 7); g.fill(); break;
      }
      case 'solid': g.beginPath(); g.arc(0, 0, s, 0, 7); g.fill(); break;
      case 'bubble': g.lineWidth = 2; g.beginPath(); g.arc(0, 0, s, 0, 7); g.stroke();
        g.globalAlpha *= 0.6; g.fillStyle = '#fff'; g.beginPath(); g.arc(-s * 0.35, -s * 0.35, s * 0.25, 0, 7); g.fill(); break;
      case 'leaf': g.beginPath(); g.ellipse(0, 0, s * 1.6, s * 0.6, 0, 0, 7); g.fill();
        g.strokeStyle = '#1d5a1d'; g.lineWidth = 1; g.beginPath(); g.moveTo(-s * 1.5, 0); g.lineTo(s * 1.5, 0); g.stroke(); break;
      case 'shard': g.beginPath(); g.moveTo(0, -s * 1.6); g.lineTo(s * 0.6, 0); g.lineTo(0, s * 1.6); g.lineTo(-s * 0.6, 0); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.moveTo(0, -s * 1.4); g.lineTo(s * 0.25, 0); g.lineTo(0, s * 0.4); g.fill(); break;
      case 'rock': g.fillStyle = p.color; g.beginPath();
        for (let i = 0; i < 7; i++) { const an = i / 7 * 6.28, rr = s * (0.75 + ((i * 37) % 10) / 30); g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
        g.closePath(); g.fill(); g.strokeStyle = '#3b2e1e'; g.lineWidth = 2; g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(-s * 0.3, -s * 0.3, s * 0.3, 0, 7); g.fill(); break;
      case 'ring': g.lineWidth = p.lw || 4; g.beginPath(); g.arc(0, 0, s, 0, 7); g.stroke(); break;
      case 'ellipseRing': g.lineWidth = p.lw || 4; g.beginPath(); g.ellipse(0, 0, s, s * 0.35, 0, 0, 7); g.stroke(); break;
      case 'star': g.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.4 : s; const an = i / 10 * 6.28 - 1.57; g.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
        g.closePath(); g.fill(); break;
      case 'text': g.font = `${Math.round(s)}px "PressStart2P"`; g.textAlign = 'center'; g.fillText(p.text, 0, 0);
        g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.strokeText(p.text, 0, 0); break;
      case 'arrow': g.beginPath(); const d = p.dir || -1;
        g.moveTo(0, s * d); g.lineTo(s * 0.7, 0); g.lineTo(s * 0.3, 0); g.lineTo(s * 0.3, -s * d); g.lineTo(-s * 0.3, -s * d); g.lineTo(-s * 0.3, 0); g.lineTo(-s * 0.7, 0);
        g.closePath(); g.fill(); break;
      case 'streak': g.lineWidth = p.lw || 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke(); break;
      case 'note': g.font = `${Math.round(s)}px sans-serif`; g.fillText('♪', 0, 0); break;
    }
    g.restore();
  }

  function effect(dur, update, draw) {
    return new Promise(res => effects.push({ t: 0, dur, update, draw, done: res, data: {} }));
  }

  // ---------- helpers ----------
  function burst(at, n, opt) {
    for (let i = 0; i < n; i++) {
      const an = R(0, 6.28), sp = R(opt.minSp || 60, opt.maxSp || 320);
      add(Object.assign({ x: at.x + R(-10, 10), y: at.y + R(-10, 10), vx: Math.cos(an) * sp, vy: Math.sin(an) * sp,
        life: R(0.3, 0.7), size: R(4, 12), drag: 0.93 }, opt, { x: at.x + R(-(opt.spread || 10), opt.spread || 10), y: at.y + R(-(opt.spread || 10), opt.spread || 10) }));
    }
  }
  function stream(from, to, dur, rate, mk) {
    return effect(dur, (e, dt) => {
      e.data.acc = (e.data.acc || 0) + dt * rate;
      while (e.data.acc > 1) { e.data.acc--; add(mk(e.t / dur)); }
    });
  }
  function impactStar(at, color = '#fff', size = 60) {
    add({ x: at.x, y: at.y, shape: 'star', color, size, grow: -80, life: 0.3, glow: true, rot: R(0, 1) });
    add({ x: at.x, y: at.y, shape: 'circle', color, core: '#fff', size: size * 1.2, grow: 200, life: 0.25 });
  }
  function bolt(g2, x1, y1, x2, y2, disp, color, width) {
    const pts = [[x1, y1]];
    const segs = 10;
    for (let i = 1; i < segs; i++) {
      const k = i / segs;
      pts.push([lerp(x1, x2, k) + R(-disp, disp), lerp(y1, y2, k) + R(-disp * 0.3, disp * 0.3)]);
    }
    pts.push([x2, y2]);
    g2.save(); g2.globalCompositeOperation = 'lighter';
    for (const [w, c] of [[width * 4, 'rgba(255,230,80,0.25)'], [width * 2, color], [width * 0.7, '#fff']]) {
      g2.strokeStyle = c; g2.lineWidth = w; g2.lineJoin = 'round'; g2.beginPath();
      pts.forEach(([x, y], i) => i ? g2.lineTo(x, y) : g2.moveTo(x, y)); g2.stroke();
    }
    g2.restore();
  }

  function flash(color = '#fff', dur = 0.25, max = 0.8) {
    return effect(dur, null, (e, g2) => {
      g2.save(); g2.globalAlpha = max * (1 - e.t / dur); g2.fillStyle = color; g2.fillRect(0, 0, W, H); g2.restore();
    });
  }
  function darken(dur, max = 0.5, color = '#000') {
    return effect(dur, null, (e, g2) => {
      const k = e.t / dur; const a = max * Math.min(1, Math.min(k * 4, (1 - k) * 4));
      g2.save(); g2.globalAlpha = a; g2.fillStyle = color; g2.fillRect(0, 0, W, H); g2.restore();
    });
  }

  function shake(el, intensity = 8, ms = 400) {
    const start = performance.now();
    return new Promise(res => {
      const f = (now) => {
        const k = (now - start) / ms;
        if (k >= 1) { el.style.translate = ''; res(); return; }
        const a = intensity * (1 - k);
        el.style.translate = `${R(-a, a)}px ${R(-a * 0.6, a * 0.6)}px`;
        nextFrame(f);
      };
      nextFrame(f);
    });
  }

  // ---------- move animations ----------
  // from/to = {x, y} centers of the user and target sprites. Resolves when visuals finish.
  async function play(name, from, to, ctx = {}) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const ang = Math.atan2(dy, dx);
    switch (name) {
      case 'fire': {
        await stream(from, to, 0.75, 140, () => ({ sx: from.x + R(-8, 8), sy: from.y + R(-8, 8), target: { x: to.x + R(-25, 25), y: to.y + R(-25, 25) },
          arc: R(-30, 30), life: R(0.35, 0.5), size: R(16, 28), grow: 14, color: Math.random() < 0.5 ? '#ff7a1a' : '#ffc23a', core: '#fff6c0' }));
        burst(to, 40, { color: '#ff6a00', core: '#ffe08a', size: 16, grow: -10, ay: -300, maxSp: 250 });
        await wait(350); break;
      }
      case 'firepunch': {
        for (let i = 0; i < 3; i++) { impactStar({ x: to.x + R(-20, 20), y: to.y + R(-20, 20) }, '#ffae3a', 50); burst(to, 14, { color: '#ff5a00', core: '#ffe08a', ay: -300, size: 12 }); await wait(140); }
        await wait(250); break;
      }
      case 'wisp': {
        const orbs = [0, 1, 2].map(i => i * 2.09);
        await effect(1.1, (e) => {
          const k = e.t / 1.1;
          orbs.forEach(o => {
            const x = lerp(from.x, to.x, Math.min(1, k * 1.2)) + Math.cos(o + e.t * 6) * 40 * (1 - k);
            const y = lerp(from.y, to.y, Math.min(1, k * 1.2)) + Math.sin(o + e.t * 6) * 25 * (1 - k);
            add({ x, y, color: '#6a7cff', core: '#e0e8ff', size: 14, life: 0.25, grow: -30 });
          });
        });
        burst(to, 25, { color: '#5a6aff', core: '#fff', ay: -200 });
        await wait(250); break;
      }
      case 'surf': {
        const dir = Math.sign(dx) || 1;
        await effect(1.0, (e) => {
          const k = e.t / 1.0;
          const wx = lerp(from.x - dir * 200, to.x + dir * 250, k);
          for (let i = 0; i < 4; i++) {
            const yy = lerp(from.y, to.y, k) + R(-70, 70);
            add({ x: wx + R(-30, 30), y: yy, vx: dir * 200, vy: R(-80, -20), ay: 300, life: 0.45, size: R(8, 18), color: '#4aa0ff', core: '#e6f6ff' });
          }
          if (Math.random() < 0.5) add({ x: wx, y: lerp(from.y, to.y, k) + R(-60, 60), shape: 'bubble', color: '#bfe6ff', size: R(4, 9), vy: -80, life: 0.6, glow: false });
        }, (e, g2) => {
          const k = e.t / 1.0;
          const wx = lerp(from.x - dir * 200, to.x + dir * 250, k);
          g2.save(); g2.globalAlpha = 0.35 * Math.sin(k * Math.PI);
          const gr = g2.createLinearGradient(wx - 160, 0, wx + 160, 0);
          gr.addColorStop(0, 'rgba(40,120,255,0)'); gr.addColorStop(0.5, 'rgba(90,170,255,1)'); gr.addColorStop(1, 'rgba(40,120,255,0)');
          g2.fillStyle = gr; g2.fillRect(wx - 160, Math.min(from.y, to.y) - 140, 320, Math.abs(dy) + 280); g2.restore();
        });
        break;
      }
      case 'hydropump': {
        await effect(0.9, (e) => {
          for (let i = 0; i < 6; i++) {
            const sp = R(900, 1300), j = R(-0.06, 0.06);
            add({ x: from.x, y: from.y, vx: Math.cos(ang + j) * sp, vy: Math.sin(ang + j) * sp, life: Math.hypot(dx, dy) / sp, size: R(10, 20), color: '#3a8cff', core: '#dff2ff' });
          }
        });
        burst(to, 40, { color: '#4aa0ff', core: '#fff', ay: 500, maxSp: 400 });
        await wait(300); break;
      }
      case 'thunder': {
        await effect(0.8, (e) => {}, (e, g2) => {
          if (Math.floor(e.t * 20) % 2 === 0) {
            bolt(g2, to.x + R(-40, 40), 0, to.x, to.y, 40, '#ffe34a', 5);
            if (Math.random() < 0.4) bolt(g2, from.x, from.y, to.x, to.y, 30, '#fff27a', 3);
          }
          g2.save(); g2.globalAlpha = 0.18 * Math.random(); g2.fillStyle = '#fff6a0'; g2.fillRect(0, 0, W, H); g2.restore();
        });
        burst(to, 30, { color: '#ffe34a', core: '#fff', shape: 'circle', size: 8, maxSp: 500 });
        await wait(250); break;
      }
      case 'twave': {
        await effect(0.9, null, (e, g2) => {
          for (let i = 0; i < 3; i++) {
            const ox = to.x + Math.cos(e.t * 12 + i * 2) * 40, oy = to.y + Math.sin(e.t * 9 + i * 2) * 40;
            bolt(g2, ox, oy, to.x + R(-40, 40), to.y + R(-40, 40), 15, '#ffe34a', 2);
          }
        });
        break;
      }
      case 'icebeam': {
        await effect(0.9, (e) => {
          for (let i = 0; i < 3; i++) {
            const k = Math.random();
            add({ x: lerp(from.x, to.x, k) + R(-8, 8), y: lerp(from.y, to.y, k) + R(-8, 8), shape: 'shard', color: '#aef4ff', size: R(4, 9), rot: R(0, 6), vr: R(-6, 6), life: 0.4, glow: true });
          }
        }, (e, g2) => {
          g2.save(); g2.globalCompositeOperation = 'lighter';
          const a = Math.sin(e.t / 0.9 * Math.PI);
          for (const [w, c] of [[26, `rgba(120,220,255,${0.25 * a})`], [12, `rgba(180,240,255,${0.7 * a})`], [4, `rgba(255,255,255,${a})`]]) {
            g2.strokeStyle = c; g2.lineWidth = w; g2.lineCap = 'round'; g2.beginPath(); g2.moveTo(from.x, from.y); g2.lineTo(to.x, to.y); g2.stroke();
          }
          g2.restore();
        });
        for (let i = 0; i < 18; i++) add({ x: to.x + R(-40, 40), y: to.y + R(-40, 40), shape: 'shard', color: '#c8f8ff', size: R(8, 16), rot: R(0, 6), life: 0.7, grow: -6 });
        await wait(400); break;
      }
      case 'leaves': {
        for (let i = 0; i < 12; i++) {
          add({ sx: from.x + R(-30, 30), sy: from.y + R(-30, 30), target: { x: to.x + R(-30, 30), y: to.y + R(-30, 30) }, arc: R(-80, 80), arcX: R(-40, 40),
            shape: 'leaf', color: i % 2 ? '#5fd35f' : '#3fae3f', size: R(6, 9), vr: R(-14, 14), life: 0.55 + i * 0.03, glow: false, fade: false });
        }
        await wait(800);
        burst(to, 16, { shape: 'leaf', color: '#6fe06f', glow: false, vr: 10, size: 6 });
        await wait(250); break;
      }
      case 'drain': {
        impactStar(to, '#9dff7a', 40);
        await wait(200);
        for (let i = 0; i < 16; i++) add({ sx: to.x + R(-30, 30), sy: to.y + R(-30, 30), target: { x: from.x, y: from.y }, arc: R(-60, 60), color: '#7dff5a', core: '#f0ffe0', size: 10, life: 0.6 + i * 0.03 });
        await wait(900); break;
      }
      case 'seed': {
        for (let i = 0; i < 3; i++) add({ sx: from.x, sy: from.y, target: { x: to.x + R(-20, 20), y: to.y + 20 }, arc: 120, shape: 'solid', color: '#8a5a2a', size: 6, life: 0.6, glow: false, fade: false });
        await wait(650);
        for (let i = 0; i < 12; i++) add({ x: to.x + R(-40, 40), y: to.y + R(-10, 40), vy: -60, shape: 'leaf', color: '#4fc04f', size: 5, vr: 3, life: 0.7, glow: false });
        await wait(300); break;
      }
      case 'powder_sleep': case 'powder_par': {
        const c = name === 'powder_sleep' ? '#8fd0ff' : '#ffe86a';
        await effect(1.0, () => {
          for (let i = 0; i < 3; i++) add({ x: to.x + R(-70, 70), y: to.y - 90 + R(-20, 10), vy: R(40, 90), vx: R(-15, 15), color: c, core: '#fff', size: R(3, 6), life: 0.9 });
        });
        break;
      }
      case 'sludge': {
        for (let i = 0; i < 6; i++) add({ sx: from.x, sy: from.y, target: { x: to.x + R(-25, 25), y: to.y + R(-25, 25) }, arc: R(60, 140), shape: 'solid', color: '#a040c0', size: R(9, 15), life: 0.5 + i * 0.05, glow: false, fade: false });
        await wait(800);
        burst(to, 24, { shape: 'bubble', color: '#e0a0ff', glow: false, vy: -40, ay: -80, size: 8 });
        burst(to, 20, { color: '#b040e0', core: '#ffd0ff', size: 12 });
        await wait(300); break;
      }
      case 'psychic': {
        const stage = document.getElementById('stage');
        stage.classList.add('psywave');
        for (let i = 0; i < 6; i++) { add({ x: to.x, y: to.y, shape: 'ring', color: '#ff7ad0', lw: 5, size: 10, grow: 220, life: 0.7 }); await wait(120); }
        await wait(400);
        stage.classList.remove('psywave'); break;
      }
      case 'calmmind': case 'rest': case 'heal': case 'swords': case 'dragondance': case 'doubleteam': {
        const col = { calmmind: '#ff8ae0', rest: '#b0c8ff', heal: '#7dff9a', swords: '#e6e6ff', dragondance: '#b07aff', doubleteam: '#ffffff' }[name];
        await effect(0.9, () => {
          for (let i = 0; i < 2; i++) add({ x: from.x + R(-60, 60), y: from.y + R(0, 60), vy: R(-160, -80), color: col, core: '#fff', size: R(5, 10), life: 0.7 });
          if (name === 'swords' && Math.random() < 0.3) add({ x: from.x + R(-50, 50), y: from.y - 60, shape: 'streak', rot: R(0, 3), color: '#fff', size: 30, life: 0.3 });
          if (name === 'dragondance' && Math.random() < 0.5) add({ x: from.x + Math.cos(performance.now() / 80) * 70, y: from.y + Math.sin(performance.now() / 80) * 30, color: '#7a3aff', core: '#e0c0ff', size: 14, life: 0.4 });
        });
        break;
      }
      case 'protect': {
        await effect(0.8, null, (e, g2) => {
          const a = Math.sin(e.t / 0.8 * Math.PI);
          g2.save(); g2.globalCompositeOperation = 'lighter';
          g2.strokeStyle = `rgba(120,255,220,${a})`; g2.fillStyle = `rgba(80,220,255,${0.18 * a})`; g2.lineWidth = 4;
          g2.beginPath();
          for (let i = 0; i < 6; i++) { const an = i / 6 * 6.28 + e.t; g2.lineTo(from.x + Math.cos(an) * 100, from.y + Math.sin(an) * 100); }
          g2.closePath(); g2.fill(); g2.stroke(); g2.restore();
        });
        break;
      }
      case 'raindance': {
        await darken(1.0, 0.45, '#10204a');
        break;
      }
      case 'slam': case 'tackle': case 'quick': case 'egg': {
        if (name === 'egg') { add({ sx: from.x, sy: from.y, target: to, arc: 150, shape: 'solid', color: '#fff4d8', size: 14, life: 0.5, glow: false, fade: false }); await wait(520); }
        impactStar(to, '#fff6c8', name === 'quick' ? 40 : 70);
        burst(to, 18, { color: '#ffffff', core: '#fff', shape: 'star', size: 8, glow: true, maxSp: 380 });
        await wait(300); break;
      }
      case 'slash': case 'dragonclaw': {
        const col = name === 'slash' ? '#ffffff' : '#9a6aff';
        for (let i = 0; i < 3; i++) {
          const off = (i - 1) * 26;
          await effect(0.1, null, (e, g2) => {
            const k = e.t / 0.1;
            g2.save(); g2.globalCompositeOperation = 'lighter'; g2.strokeStyle = col; g2.lineWidth = 7; g2.lineCap = 'round';
            g2.beginPath(); g2.moveTo(to.x - 60 + off, to.y - 60); g2.lineTo(lerp(to.x - 60 + off, to.x + 60 + off, k), lerp(to.y - 60, to.y + 60, k)); g2.stroke();
            g2.lineWidth = 2; g2.strokeStyle = '#fff'; g2.stroke(); g2.restore();
          });
        }
        burst(to, 14, { color: col, core: '#fff', size: 8 });
        await wait(250); break;
      }
      case 'horn': {
        impactStar(to, '#c8ff5a', 80); burst(to, 20, { color: '#b8e040', core: '#fff' });
        await wait(350); break;
      }
      case 'bite': {
        await effect(0.45, null, (e, g2) => {
          const k = Math.min(1, e.t / 0.3);
          g2.save(); g2.fillStyle = '#1a1020'; g2.strokeStyle = '#fff';
          for (const s of [-1, 1]) {
            const y = to.y + s * lerp(80, 8, k);
            g2.beginPath(); g2.moveTo(to.x - 70, y);
            for (let i = 0; i <= 6; i++) g2.lineTo(to.x - 70 + i * 23.3, y + (i % 2 ? -s * 18 : 0));
            g2.lineTo(to.x + 70, y + s * 30); g2.lineTo(to.x - 70, y + s * 30); g2.closePath(); g2.fill();
          }
          g2.restore();
        });
        impactStar(to, '#b070ff', 50);
        await wait(250); break;
      }
      case 'quake': {
        const stage = document.getElementById('stage');
        const p = shake(stage, 16, 1100);
        await effect(1.1, () => {
          for (let i = 0; i < 3; i++) add({ x: to.x + R(-150, 150), y: to.y + 60 + R(-20, 20), vy: R(-200, -60), vx: R(-40, 40), ay: 300, shape: 'rock', color: '#9a7a4a', size: R(3, 8), life: 0.7, glow: false, vr: 5 });
          if (Math.random() < 0.3) add({ x: to.x + R(-180, 180), y: to.y + 70, color: 'rgba(200,170,120,0.6)', core: 'rgba(230,210,170,0.6)', size: 30, grow: 60, life: 0.8, glow: false, shape: 'solid', alpha: 0.35 });
        });
        await p; break;
      }
      case 'rocks': {
        for (let i = 0; i < 7; i++) {
          const tx = to.x + R(-60, 60);
          add({ x: tx, y: -40, vy: R(700, 900), ay: 900, shape: 'rock', color: '#a89060', size: R(14, 24), vr: R(-4, 4), life: (to.y + 40) / 900, glow: false, fade: false });
          await wait(90);
        }
        await wait(300);
        shake(document.getElementById('stage'), 8, 300);
        burst(to, 20, { shape: 'rock', color: '#8a7650', glow: false, ay: 700, size: 6 });
        await wait(300); break;
      }
      case 'sand': {
        for (let i = 0; i < 30; i++) add({ sx: from.x + R(-20, 20), sy: from.y + 50, target: { x: to.x + R(-40, 40), y: to.y + R(-30, 30) }, arc: R(20, 80), shape: 'solid', color: '#d8b878', size: R(2, 5), life: 0.5 + R(0, 0.3), glow: false });
        await wait(800); break;
      }
      case 'shadowball': {
        await effect(0.7, (e) => {
          const k = e.t / 0.7;
          const x = lerp(from.x, to.x, k), y = lerp(from.y, to.y, k) - Math.sin(k * Math.PI) * 40;
          add({ x, y, color: '#6a3a9a', core: '#1a0a2a', size: 30, life: 0.2, glow: false, shape: 'solid', alpha: 0.9 });
          add({ x: x + R(-20, 20), y: y + R(-20, 20), color: '#a060ff', core: '#fff', size: 8, life: 0.4 });
        });
        burst(to, 30, { color: '#7a3aca', core: '#e0b0ff', size: 14 });
        await flash('#200030', 0.3, 0.5); break;
      }
      case 'confuseray': {
        await effect(1.0, (e) => {
          const k = e.t / 1.0;
          const x = lerp(from.x, to.x, k) + Math.sin(e.t * 20) * 20, y = lerp(from.y, to.y, k) + Math.cos(e.t * 16) * 20;
          add({ x, y, color: '#ffe24a', core: '#fff', size: 18, life: 0.2 });
        });
        break;
      }
      case 'hyperbeam': {
        await darken(0.3, 0.5);
        await effect(0.9, (e) => {
          if (Math.random() < 0.6) burst(to, 3, { color: '#ffb040', core: '#fff', size: 10, maxSp: 400 });
        }, (e, g2) => {
          const a = Math.sin(e.t / 0.9 * Math.PI);
          g2.save(); g2.globalCompositeOperation = 'lighter'; g2.lineCap = 'round';
          for (const [w, c] of [[70, `rgba(255,120,40,${0.3 * a})`], [40, `rgba(255,190,80,${0.7 * a})`], [16, `rgba(255,255,255,${a})`]]) {
            g2.strokeStyle = c; g2.lineWidth = w * (0.8 + Math.random() * 0.3); g2.beginPath(); g2.moveTo(from.x, from.y); g2.lineTo(to.x, to.y); g2.stroke();
          }
          g2.restore();
        });
        shake(document.getElementById('stage'), 10, 400);
        await flash('#fff', 0.3, 0.9); break;
      }
      // --- status visuals ---
      case 'sleepZ': {
        for (let i = 0; i < 3; i++) { add({ x: from.x + 30 + i * 12, y: from.y - 40, vy: -50, vx: 20, shape: 'text', text: 'Z', color: '#e8f0ff', size: 16 + i * 6, life: 1.1, glow: false }); await wait(250); }
        await wait(400); break;
      }
      case 'parSpark': {
        await effect(0.6, null, (e, g2) => { if (Math.random() < 0.5) bolt(g2, from.x + R(-50, 50), from.y + R(-50, 50), from.x + R(-50, 50), from.y + R(-50, 50), 10, '#ffe34a', 2); });
        break;
      }
      case 'burnFlame': {
        await effect(0.6, () => add({ x: from.x + R(-40, 40), y: from.y + R(0, 40), vy: R(-160, -80), color: '#ff5a1a', core: '#ffe08a', size: R(8, 14), life: 0.5 }));
        break;
      }
      case 'poisonBubble': {
        await effect(0.6, () => { if (Math.random() < 0.5) add({ x: from.x + R(-40, 40), y: from.y + R(0, 40), vy: R(-100, -40), shape: 'bubble', color: '#d080ff', size: R(4, 9), life: 0.6, glow: false }); });
        break;
      }
      case 'freezeIce': {
        for (let i = 0; i < 10; i++) add({ x: from.x + R(-50, 50), y: from.y + R(-40, 50), shape: 'shard', color: '#c8f8ff', size: R(6, 12), rot: R(0, 6), life: 0.7 });
        await wait(500); break;
      }
      case 'confused': {
        await effect(0.8, (e) => {
          for (let i = 0; i < 3; i++) {
            const an = e.t * 8 + i * 2.09;
            add({ x: from.x + Math.cos(an) * 45, y: from.y - 70 + Math.sin(an) * 12, shape: 'star', color: '#ffe24a', size: 7, life: 0.08, glow: false });
          }
        });
        break;
      }
      case 'leech': {
        for (let i = 0; i < 10; i++) add({ sx: from.x + R(-20, 20), sy: from.y + R(-20, 20), target: { x: to.x, y: to.y }, arc: R(-60, 60), color: '#7dff5a', core: '#f0ffe0', size: 8, life: 0.6 + i * 0.04 });
        await wait(900); break;
      }
      case 'statUp': case 'statDown': {
        const up = name === 'statUp';
        await effect(0.8, () => {
          if (Math.random() < 0.6) add({ x: from.x + R(-55, 55), y: from.y + (up ? 60 : -60), vy: up ? -200 : 200, shape: 'arrow', dir: up ? -1 : 1,
            color: up ? 'rgba(255,120,80,0.9)' : 'rgba(90,150,255,0.9)', size: R(10, 16), life: 0.55, glow: false });
        }, (e, g2) => {
          g2.save(); g2.globalCompositeOperation = 'lighter'; g2.globalAlpha = 0.25 * Math.sin(e.t / 0.8 * Math.PI);
          const gr = g2.createRadialGradient(from.x, from.y, 10, from.x, from.y, 110);
          gr.addColorStop(0, up ? '#ff6040' : '#4080ff'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g2.fillStyle = gr; g2.fillRect(from.x - 120, from.y - 120, 240, 240); g2.restore();
        });
        break;
      }
      case 'sendout': {
        add({ x: from.x, y: from.y, shape: 'circle', color: '#ffffff', core: '#fff', size: 30, grow: 400, life: 0.35 });
        for (let i = 0; i < 12; i++) { const an = i / 12 * 6.28; add({ x: from.x, y: from.y, vx: Math.cos(an) * 260, vy: Math.sin(an) * 260, shape: 'star', color: '#fff8c0', size: 8, life: 0.45, drag: 0.92 }); }
        break;
      }
      // --- generic, colored by move type ---
      case 'fireblast': {
        await stream(from, to, 0.6, 160, () => ({ sx: from.x, sy: from.y, target: { x: to.x + R(-15, 15), y: to.y + R(-15, 15) }, arc: R(-20, 20),
          life: 0.4, size: R(18, 30), grow: 20, color: '#ff6a1a', core: '#fff3b0' }));
        for (let i = 0; i < 5; i++) { const an = -1.57 + (i - 2) * 1.1; add({ x: to.x, y: to.y, vx: Math.cos(an) * 260, vy: Math.sin(an) * 260, size: 22, life: 0.5, drag: 0.9, color: '#ff5a00', core: '#ffe08a' }); }
        burst(to, 50, { color: '#ff7a1a', core: '#fff0a0', size: 18, grow: -12, ay: -250, maxSp: 360 });
        shake(document.getElementById('stage'), 8, 350);
        await wait(450); break;
      }
      case 'orb': {
        const col = TYPE_FX[ctx.type] || TYPE_FX.NORMAL;
        await effect(0.55, (e) => {
          const k = e.t / 0.55;
          const x = lerp(from.x, to.x, k), y = lerp(from.y, to.y, k) - Math.sin(k * Math.PI) * 30;
          add({ x, y, color: col[0], core: col[1], size: 26, life: 0.15 });
          add({ x: x + R(-14, 14), y: y + R(-14, 14), color: col[0], core: '#fff', size: 7, life: 0.35 });
        });
        impactStar(to, col[0], 70);
        burst(to, 28, { color: col[0], core: col[1], size: 12 });
        await wait(300); break;
      }
      case 'beam': {
        const col = TYPE_FX[ctx.type] || TYPE_FX.NORMAL;
        await effect(0.7, (e) => { if (Math.random() < 0.5) burst(to, 2, { color: col[0], core: '#fff', size: 8, maxSp: 300 }); }, (e, g2) => {
          const a = Math.sin(e.t / 0.7 * Math.PI);
          g2.save(); g2.globalCompositeOperation = 'lighter'; g2.lineCap = 'round';
          for (const [w, c, al] of [[30, col[0], 0.3], [14, col[0], 0.8], [5, '#ffffff', 1]]) {
            g2.globalAlpha = al * a; g2.strokeStyle = c; g2.lineWidth = w * (0.85 + Math.random() * 0.3);
            g2.beginPath(); g2.moveTo(from.x, from.y); g2.lineTo(to.x, to.y); g2.stroke();
          }
          g2.restore();
        });
        impactStar(to, col[0], 60);
        await wait(250); break;
      }
      case 'punch': {
        const col = TYPE_FX[ctx.type] || TYPE_FX.NORMAL;
        for (let i = 0; i < 2; i++) { impactStar({ x: to.x + R(-25, 25), y: to.y + R(-25, 25) }, col[0], 60); burst(to, 14, { color: col[0], core: col[1], size: 10 }); await wait(160); }
        shake(document.getElementById('stage'), 6, 250);
        await wait(250); break;
      }
      case 'gust': {
        await effect(0.8, (e) => {
          for (let i = 0; i < 3; i++) {
            const k = Math.random();
            add({ x: lerp(from.x, to.x, k) + R(-30, 30), y: lerp(from.y, to.y, k) + R(-40, 40), shape: 'streak', rot: ang + R(-0.2, 0.2),
              color: 'rgba(230,240,255,0.9)', size: R(14, 30), lw: 3, life: 0.3, glow: true });
          }
        });
        for (let i = 0; i < 3; i++) add({ x: to.x, y: to.y, shape: 'ellipseRing', color: '#e8f0ff', size: 20 + i * 12, grow: 120, lw: 3, life: 0.5 });
        await wait(300); break;
      }
      case 'fairy': case 'star': {
        const col = name === 'fairy' ? ['#ff9ad8', '#fff0fa'] : ['#fff6a0', '#ffffff'];
        await effect(0.7, () => {
          for (let i = 0; i < 3; i++) add({ sx: from.x + R(-30, 30), sy: from.y + R(-30, 30), target: { x: to.x + R(-40, 40), y: to.y + R(-40, 40) },
            arc: R(-60, 60), shape: 'star', color: col[0], size: R(6, 12), vr: 6, life: 0.5 });
        });
        burst(to, 30, { shape: 'star', color: col[0], core: col[1], size: 9 });
        await flash(col[0], 0.25, 0.35); break;
      }
      case 'rings': case 'sing': {
        const col = name === 'sing' ? '#b0ffd0' : (TYPE_FX[ctx.type] || TYPE_FX.NORMAL)[0];
        for (let i = 0; i < 5; i++) {
          if (name === 'sing') add({ sx: from.x, sy: from.y - 30, target: { x: to.x + R(-40, 40), y: to.y + R(-40, 20) }, arc: R(20, 70), shape: 'note', color: col, size: 26, life: 0.9, glow: false });
          else add({ sx: from.x, sy: from.y, target: to, shape: 'ring', color: col, lw: 4, size: 14, grow: 60, life: 0.55 });
          await wait(110);
        }
        await wait(450); break;
      }
      case 'meteor': {
        for (let i = 0; i < 6; i++) {
          const tx = to.x + R(-80, 80);
          add({ x: tx - 200, y: -60, vx: 500, vy: 900, shape: 'circle', color: '#9a5aff', core: '#fff', size: 22, life: (to.y + 60) / 900, fade: false });
          await wait(80);
        }
        await wait(350);
        shake(document.getElementById('stage'), 12, 500);
        burst(to, 50, { color: '#a060ff', core: '#ffe0ff', size: 16, maxSp: 450 });
        await flash('#c090ff', 0.3, 0.6); break;
      }
      case 'sunnyday': {
        await effect(1.0, null, (e, g2) => {
          const a = Math.sin(e.t / 1.0 * Math.PI);
          g2.save(); g2.globalCompositeOperation = 'lighter'; g2.globalAlpha = 0.45 * a;
          const gr = g2.createRadialGradient(180, 60, 10, 180, 60, 700);
          gr.addColorStop(0, '#fff2a0'); gr.addColorStop(1, 'rgba(255,160,40,0)');
          g2.fillStyle = gr; g2.fillRect(0, 0, W, H); g2.restore();
        });
        break;
      }
      case 'sandstorm': case 'hailfx': {
        const sand = name === 'sandstorm';
        await effect(1.0, () => {
          for (let i = 0; i < 8; i++) add({ x: R(-100, W), y: R(-50, H * 0.8), vx: sand ? R(500, 800) : R(60, 140), vy: sand ? R(-20, 40) : R(300, 500),
            shape: sand ? 'streak' : 'solid', rot: sand ? 0.05 : 0, color: sand ? '#d8b070' : '#eaf6ff', size: sand ? R(8, 16) : R(2, 4), lw: 2, life: 0.8, glow: false });
        });
        break;
      }
      default: {
        impactStar(to, '#fff', 60);
        await wait(300);
      }
    }
  }

  const TYPE_FX = {
    NORMAL: ['#fff6d8', '#ffffff'], FIRE: ['#ff7a1a', '#ffe08a'], WATER: ['#3a8cff', '#dff2ff'], ELECTRIC: ['#ffe34a', '#ffffff'],
    GRASS: ['#6fe06f', '#f0ffe0'], ICE: ['#aef4ff', '#ffffff'], FIGHTING: ['#ff7050', '#ffe0c0'], POISON: ['#c050e0', '#ffd0ff'],
    GROUND: ['#d8a860', '#fff0c0'], FLYING: ['#c8d8ff', '#ffffff'], PSYCHIC: ['#ff70c0', '#ffe0f0'], BUG: ['#b8e040', '#f8ffd0'],
    ROCK: ['#c8a060', '#fff0d0'], GHOST: ['#8a5ad0', '#e8d0ff'], DRAGON: ['#8a5aff', '#e8d8ff'], DARK: ['#6a4a8a', '#d8c8ff'],
    STEEL: ['#c8d0e8', '#ffffff'], FAIRY: ['#ff9ad8', '#fff0fa'], '???': ['#a0e0c8', '#ffffff'],
  };

  function setWeather(w) { weather = w; if (w !== 'rain') rain.length = 0; }

  return { init, play, shake, flash, setWeather, wait, burst, add };
})();
