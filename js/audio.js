const SFX = (() => {
  let ctx = null, master, musicBus, sfxBus, noiseBuf;
  let enabled = true;
  let musicTimer = null, song = null, songStep = 0, nextTime = 0;
  let lowHpTimer = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.2; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  const ready = () => ctx && enabled;

  function tone(freq, t, dur, { type = 'square', vol = 0.25, slide = null, bus = sfxBus, attack = 0.005, vibrato = 0 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    if (vibrato) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 18; lg.gain.value = vibrato;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(t, dur, { vol = 0.3, freq = 3000, q = 0.8, type = 'lowpass', sweep = null, bus = sfxBus } = {}) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  const N = (name) => {
    const m = name.match(/^([A-G])(#?)(\d)$/);
    const idx = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
    return 440 * 2 ** ((idx + (parseInt(m[3]) + 1) * 12 - 69) / 12);
  };

  // Original chiptune battle loop. 16th-note steps.
  function buildBattleSong() {
    const lead = [
      ['E5', 2], ['A5', 2], ['C6', 2], ['B5', 2], ['A5', 4], ['E5', 2], ['G5', 2],
      ['F5', 2], ['A5', 2], ['C6', 4], ['D6', 2], ['C6', 2], ['A5', 4],
      ['G5', 2], ['B5', 2], ['D6', 4], ['E6', 2], ['D6', 2], ['B5', 2], ['G5', 2],
      ['G#5', 4], ['B5', 4], ['E6', 6], [null, 2],
      ['D6', 2], ['C6', 2], ['A5', 4], ['F5', 2], ['A5', 2], ['D6', 4],
      ['C6', 2], ['B5', 2], ['A5', 4], ['E5', 4], ['A5', 4],
      ['A5', 2], ['C6', 2], ['F6', 4], ['E6', 2], ['D6', 2], ['C6', 4],
      ['B5', 2], ['G#5', 2], ['E5', 4], ['G#5', 2], ['B5', 2], ['D6', 4],
    ];
    const roots = ['A2', 'F2', 'G2', 'E2', 'D2', 'A2', 'F2', 'E2'];
    const steps = [];
    for (let i = 0; i < 128; i++) steps.push({ lead: null, bass: null, drum: null });
    let p = 0;
    for (const [n, len] of lead) { if (n) steps[p].lead = [N(n), len]; p += len; }
    for (let bar = 0; bar < 8; bar++) {
      const r = N(roots[bar]);
      for (let e = 0; e < 8; e++) steps[bar * 16 + e * 2].bass = [e % 2 ? r * 2 : r, 2];
      for (let s = 0; s < 16; s++) {
        const st = steps[bar * 16 + s];
        if (s % 8 === 0) st.drum = 'kick';
        else if (s % 8 === 4) st.drum = 'snare';
        else if (s % 2 === 0) st.drum = 'hat';
      }
    }
    return { steps, stepDur: 60 / 158 / 4, loop: true };
  }

  function buildVictorySong() {
    const seq = [['C5', 2], ['E5', 2], ['G5', 2], ['C6', 6], ['A5', 2], ['B5', 2], ['C6', 2], ['D6', 2], ['E6', 8], [null, 4],
      ['G5', 2], ['C6', 2], ['E6', 2], ['G6', 6], ['F6', 2], ['E6', 2], ['D6', 2], ['E6', 2], ['C6', 12], [null, 8]];
    const roots = ['C3', 'C3', 'F2', 'G2', 'C3', 'A2', 'F2', 'G2', 'C3', 'C3'];
    const total = seq.reduce((a, s) => a + s[1], 0);
    const steps = [];
    for (let i = 0; i < total; i++) steps.push({ lead: null, bass: null, drum: null });
    let p = 0;
    for (const [n, len] of seq) { if (n) steps[p].lead = [N(n), len]; p += len; }
    for (let i = 0; i < total; i += 4) steps[i].bass = [N(roots[Math.floor(i / 8) % roots.length]), 4];
    return { steps, stepDur: 60 / 132 / 4, loop: true };
  }

  // Original easygoing town loop (not a transcription of any game track).
  function buildTownSong() {
    const lead = [
      ['G4', 2], ['C5', 2], ['E5', 2], ['G5', 4], ['E5', 2], ['D5', 2], ['C5', 2],
      ['D5', 2], ['E5', 2], ['F5', 4], ['E5', 2], ['D5', 4], [null, 2],
      ['A4', 2], ['D5', 2], ['F5', 2], ['A5', 4], ['G5', 2], ['F5', 2], ['E5', 2],
      ['D5', 2], ['E5', 2], ['C5', 6], [null, 4],
      ['E5', 2], ['G5', 2], ['C6', 4], ['B5', 2], ['A5', 2], ['G5', 4],
      ['F5', 2], ['A5', 2], ['G5', 4], ['E5', 2], ['C5', 4], [null, 2],
      ['D5', 2], ['F5', 2], ['E5', 2], ['D5', 2], ['C5', 2], ['B4', 2], ['A4', 2], ['B4', 2],
      ['C5', 8], [null, 8],
    ];
    const roots = ['C3', 'F2', 'D3', 'G2', 'C3', 'F2', 'G2', 'C3'];
    const steps = [];
    for (let i = 0; i < 128; i++) steps.push({ lead: null, bass: null, drum: null });
    let p = 0;
    for (const [n, len] of lead) { if (n && p < 128) steps[p].lead = [N(n), len]; p += len; }
    for (let bar = 0; bar < 8; bar++) {
      const r = N(roots[bar]);
      for (let e = 0; e < 4; e++) steps[bar * 16 + e * 4].bass = [e % 2 ? r * 1.5 : r, 3];
      for (let s = 0; s < 16; s += 4) steps[bar * 16 + s].drum = s % 8 === 0 ? 'kick' : 'hat';
    }
    return { steps, stepDur: 60 / 112 / 4, loop: true, soft: true };
  }

  function scheduleMusic() {
    if (!song) return;
    while (nextTime < ctx.currentTime + 0.15) {
      const st = song.steps[songStep];
      const d = song.stepDur;
      if (enabled) {
        if (st.lead) {
          tone(st.lead[0], nextTime, st.lead[1] * d * 0.95, { type: song.soft ? 'triangle' : 'square', vol: song.soft ? 0.3 : 0.16, bus: musicBus, vibrato: st.lead[1] >= 4 ? 4 : 0 });
          tone(st.lead[0] / 2, nextTime, st.lead[1] * d * 0.9, { type: 'square', vol: 0.05, bus: musicBus });
        }
        if (st.bass) tone(st.bass[0], nextTime, st.bass[1] * d * 0.9, { type: 'triangle', vol: 0.45, bus: musicBus });
        if (st.drum === 'kick') tone(150, nextTime, 0.12, { type: 'sine', vol: 0.6, slide: 40, bus: musicBus });
        if (st.drum === 'snare') noise(nextTime, 0.12, { vol: 0.35, freq: 1800, type: 'bandpass', bus: musicBus });
        if (st.drum === 'hat') noise(nextTime, 0.03, { vol: 0.12, freq: 8000, type: 'highpass', bus: musicBus });
      }
      nextTime += d;
      songStep++;
      if (songStep >= song.steps.length) { if (song.loop) songStep = 0; else { song = null; return; } }
    }
  }

  function playMusic(which) {
    if (!ctx) return;
    stopMusic();
    if (which === 'victory') song = buildVictorySong();
    else if (which === 'town') song = buildTownSong();
    else if (which === 'wild') { song = buildBattleSong(); song.stepDur = 60 / 172 / 4; song.steps.forEach(s => { if (s.lead) s.lead = [s.lead[0] * 2 ** (2 / 12), s.lead[1]]; }); }
    else song = buildBattleSong();
    songStep = 0; nextTime = ctx.currentTime + 0.05;
    musicTimer = setInterval(scheduleMusic, 25);
  }
  function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null; song = null; }

  function play(name, arg) {
    if (!ready()) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'blip': tone(1318, t, 0.05, { vol: 0.15 }); break;
      case 'select': tone(988, t, 0.05, { vol: 0.18 }); tone(1480, t + 0.05, 0.08, { vol: 0.18 }); break;
      case 'back': tone(740, t, 0.06, { vol: 0.15 }); break;
      case 'error': tone(220, t, 0.18, { vol: 0.2, type: 'sawtooth' }); break;
      case 'hit': noise(t, 0.18, { vol: 0.6, freq: 2500, sweep: 300 }); tone(180, t, 0.12, { type: 'square', vol: 0.3, slide: 60 }); break;
      case 'hitSuper': noise(t, 0.28, { vol: 0.8, freq: 4000, sweep: 200 }); tone(260, t, 0.1, { vol: 0.35, slide: 80 }); noise(t + 0.12, 0.2, { vol: 0.6, freq: 3000, sweep: 200 }); break;
      case 'hitWeak': noise(t, 0.12, { vol: 0.35, freq: 1200, sweep: 300 }); break;
      case 'ball': tone(400, t, 0.35, { type: 'square', vol: 0.12, slide: 1600 }); break;
      case 'pop': noise(t, 0.25, { vol: 0.5, freq: 6000, type: 'highpass' }); tone(1200, t, 0.15, { type: 'sine', vol: 0.3, slide: 300 }); break;
      case 'recall': tone(1400, t, 0.4, { type: 'sine', vol: 0.2, slide: 300 }); break;
      case 'faint': tone(700, t, 0.7, { type: 'square', vol: 0.2, slide: 90 }); break;
      case 'statUp': [0, 1, 2, 3, 4].forEach(i => tone(600 * 2 ** (i / 5), t + i * 0.06, 0.1, { type: 'square', vol: 0.15 })); break;
      case 'statDown': [0, 1, 2, 3, 4].forEach(i => tone(1200 * 2 ** (-i / 5), t + i * 0.06, 0.1, { type: 'square', vol: 0.15 })); break;
      case 'heal': [0, 4, 7, 12, 16, 19].forEach((s, i) => tone(660 * 2 ** (s / 12), t + i * 0.07, 0.18, { type: 'triangle', vol: 0.25 })); break;
      case 'lowhp': tone(990, t, 0.08, { vol: 0.1 }); tone(990, t + 0.13, 0.08, { vol: 0.1 }); break;
      case 'exp': tone(1200 + Math.random() * 100, t, 0.03, { vol: 0.06, type: 'triangle' }); break;
      case 'levelup': [0, 4, 7, 12].forEach((s, i) => tone(523 * 2 ** (s / 12), t + i * 0.1, 0.25, { type: 'square', vol: 0.18 })); break;
      case 'status': tone(300, t, 0.3, { type: 'sawtooth', vol: 0.15, slide: 600, vibrato: 30 }); break;
      case 'cry': cry(arg); break;
      case 'move': moveSound(arg); break;
    }
  }

  function cry(seed = 1, pitch = 1) {
    if (!ready()) return;
    const t = ctx.currentTime;
    const rnd = (k) => { const x = Math.sin(seed * 97.13 + k * 13.7) * 43758.5453; return x - Math.floor(x); };
    const base = (220 + rnd(1) * 500) * pitch;
    const dur = 0.35 + rnd(2) * 0.4;
    tone(base, t, dur * 0.5, { type: 'sawtooth', vol: 0.18, slide: base * (1.3 + rnd(3)), vibrato: 20 + rnd(4) * 40 });
    tone(base * 1.4, t + dur * 0.45, dur * 0.6, { type: 'square', vol: 0.12, slide: base * (0.4 + rnd(5) * 0.4), vibrato: 30 });
    noise(t, dur, { vol: 0.06, freq: base * 4, type: 'bandpass', q: 3 });
  }

  function moveSound(type) {
    const t = ctx.currentTime;
    switch (type) {
      case 'FIRE': noise(t, 0.8, { vol: 0.5, freq: 400, sweep: 2500 }); noise(t + 0.3, 0.6, { vol: 0.3, freq: 1500, sweep: 300 }); break;
      case 'WATER': for (let i = 0; i < 10; i++) tone(300 + Math.random() * 700, t + i * 0.06, 0.08, { type: 'sine', vol: 0.2, slide: 1200 }); noise(t, 0.7, { vol: 0.25, freq: 900 }); break;
      case 'ELECTRIC': for (let i = 0; i < 8; i++) tone(80 + Math.random() * 60, t + i * 0.07, 0.07, { type: 'sawtooth', vol: 0.35 }); noise(t, 0.6, { vol: 0.4, freq: 5000, type: 'highpass' }); break;
      case 'ICE': for (let i = 0; i < 8; i++) tone(1800 + Math.random() * 1500, t + i * 0.05, 0.15, { type: 'sine', vol: 0.15 }); break;
      case 'GRASS': for (let i = 0; i < 6; i++) noise(t + i * 0.08, 0.1, { vol: 0.3, freq: 3000, type: 'bandpass', q: 4 }); break;
      case 'PSYCHIC': tone(300, t, 0.8, { type: 'sine', vol: 0.3, slide: 900, vibrato: 60 }); tone(450, t, 0.8, { type: 'sine', vol: 0.2, slide: 1200, vibrato: 60 }); break;
      case 'GROUND': noise(t, 1.0, { vol: 0.9, freq: 200, q: 2 }); tone(55, t, 1.0, { type: 'sine', vol: 0.6, vibrato: 8 }); break;
      case 'ROCK': for (let i = 0; i < 5; i++) noise(t + i * 0.1, 0.15, { vol: 0.5, freq: 600 }); break;
      case 'GHOST': case 'DARK': tone(120, t, 0.8, { type: 'sawtooth', vol: 0.25, slide: 60, vibrato: 15 }); break;
      case 'DRAGON': tone(150, t, 0.7, { type: 'sawtooth', vol: 0.3, slide: 500, vibrato: 25 }); noise(t, 0.6, { vol: 0.3, freq: 800 }); break;
      case 'POISON': for (let i = 0; i < 6; i++) tone(200 + Math.random() * 200, t + i * 0.08, 0.1, { type: 'sine', vol: 0.3, slide: 80 }); break;
      case 'FLYING': noise(t, 0.4, { vol: 0.4, freq: 4000, sweep: 800, type: 'bandpass' }); break;
      case 'BUG': noise(t, 0.3, { vol: 0.4, freq: 2000, type: 'bandpass', q: 6 }); break;
      case 'BEAM': tone(200, t, 1.1, { type: 'sawtooth', vol: 0.3, slide: 900 }); noise(t, 1.1, { vol: 0.4, freq: 1000, sweep: 5000 }); break;
      default: noise(t, 0.15, { vol: 0.3, freq: 2000 });
    }
  }

  function setLowHp(on) {
    if (on && !lowHpTimer) lowHpTimer = setInterval(() => play('lowhp'), 520);
    if (!on && lowHpTimer) { clearInterval(lowHpTimer); lowHpTimer = null; }
  }

  function toggle() {
    enabled = !enabled;
    if (master) master.gain.value = enabled ? 0.55 : 0;
    return enabled;
  }

  function bump() {
    if (!ready()) return;
    tone(90, ctx.currentTime, 0.08, { type: 'square', vol: 0.12, slide: 60 });
  }
  function step(grass) {
    if (!ready() || !grass) return;
    noise(ctx.currentTime, 0.08, { vol: 0.12, freq: 3500, type: 'bandpass', q: 2 });
  }

  return { init, play, playMusic, stopMusic, setLowHp, toggle, cry, bump, step, isOn: () => enabled };
})();
