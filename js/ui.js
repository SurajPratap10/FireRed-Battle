const $ = (s) => document.querySelector(s);
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------- input ----------------
const Input = (() => {
  let handler = null;
  const held = new Set();
  const map = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', a: 'L', s: 'D', d: 'R', W: 'U', A: 'L', S: 'D', D: 'R',
    z: 'A', Z: 'A', Enter: 'A', ' ': 'A', x: 'B', X: 'B', Escape: 'B', Backspace: 'B', Shift: 'RUN' };
  const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  document.addEventListener('keydown', (e) => {
    if (typing(e)) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'm' || e.key === 'M') { UI.toggleSound(); return; }
    const k = map[e.key];
    if (!k) return;
    e.preventDefault();
    held.add(k);
    if (k === 'RUN') return;
    if (e.repeat && (k === 'A' || k === 'B')) return;
    if (handler) handler(k);
  });
  document.addEventListener('keyup', (e) => { const k = map[e.key]; if (k) held.delete(k); });
  window.addEventListener('blur', () => held.clear());
  return { set: (h) => { handler = h; }, clear: () => { handler = null; }, fire: (k) => handler && handler(k), held, active: () => !!handler, current: () => handler };
})();

// ---------------- UI ----------------
const UI = (() => {
  const POS = {
    foe: { mon: { x: 812, y: 398 }, trainer: { x: 968, y: 362 }, scale: 2.1 },
    player: { mon: { x: 560, y: 508 }, trainer: { x: 405, y: 566 }, scale: 2.6 },
  };
  const el = {};
  let hpState = { player: null, foe: null };

  function init() {
    for (const id of ['stage', 'foeMon', 'playerMon', 'foeTrainer', 'playerTrainer', 'foeBox', 'playerBox', 'textbox', 'text', 'arrow',
      'actionMenu', 'moveMenu', 'moveInfo', 'party', 'bag', 'summary', 'yesno', 'fade', 'title', 'sound', 'foeBalls', 'playerBalls', 'result',
      'bg', 'choice']) el[id] = document.getElementById(id);
    for (const side of ['foe', 'player']) {
      const m = el[side + 'Mon'], t = el[side + 'Trainer'];
      place(m, POS[side].mon); place(t, POS[side].trainer);
    }
    el.foeTrainer.querySelector('img').src = 'assets/trainers/blue-gen3.png';
    el.playerTrainer.querySelector('img').src = 'assets/trainers/red_back.png';
    el.textbox.addEventListener('click', () => Input.fire('A'));
    el.sound.addEventListener('click', toggleSound);
    fitStage();
    window.addEventListener('resize', fitStage);
    window.addEventListener('orientationchange', () => setTimeout(fitStage, 150));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fitStage);
    FX.init(document.getElementById('fx'));
  }

  function fitStage() {
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth, vh = vv ? vv.height : window.innerHeight;
    const portrait = vh > vw * 1.02;
    const mobile = window.matchMedia('(pointer: coarse)').matches || vw < 960;
    const landscape = !portrait;
    let s = Math.min(vw / 1280, vh / 720);
    if (mobile && landscape) {
      const fillW = vw / 1280;
      if (720 * fillW <= vh * 0.99) s = fillW;
    }
    el.stage.style.transform = `translate(-50%, -50%) scale(${s})`;
    document.body.classList.toggle('portrait-ui', portrait);
    document.body.classList.toggle('mobile-ui', mobile);
    document.body.classList.toggle('mobile-landscape', mobile && landscape);
    document.body.classList.toggle('narrow-ui', mobile || vw < 900 || vh < 760 || portrait);
  }

  function place(node, p) {
    node.style.left = p.x + 'px'; node.style.top = p.y + 'px'; node.style.zIndex = Math.round(p.y);
  }

  function toggleSound() {
    const on = SFX.toggle();
    el.sound.textContent = on ? '♪ ON' : '♪ OFF';
  }

  // ------------- text box -------------
  let typing = false;
  function setText(t) { el.text.innerHTML = t.replace(/\n/g, '<br>'); el.arrow.style.display = 'none'; }

  function say(text, { auto = 0, keep = false } = {}) {
    return new Promise((resolve) => {
      el.textbox.classList.remove('hidden');
      el.arrow.style.display = 'none';
      let i = 0, done = false;
      typing = true;
      const html = (n) => text.slice(0, n).replace(/\n/g, '<br>');
      const finish = () => {
        done = true; typing = false;
        el.text.innerHTML = html(text.length);
        if (auto) { Input.clear(); setTimeout(resolve, auto); return; }
        el.arrow.style.display = 'block';
        Input.set((k) => {
          if (k === 'A' || k === 'B') { Input.clear(); el.arrow.style.display = 'none'; SFX.play('blip'); resolve(); }
        });
      };
      Input.set((k) => { if (k === 'A' && !done) { clearInterval(iv); finish(); } });
      const iv = setInterval(() => {
        i += 1;
        el.text.innerHTML = html(i);
        if (i >= text.length) { clearInterval(iv); finish(); }
      }, 18);
    });
  }

  // ------------- sprites -------------
  function spritePath(mon, side) { return spritePathFor(mon.species, side === 'player'); }
  const genderHTML = (g) => g === 'N' ? '' : `<span class="gender ${g === 'F' ? 'f' : 'm'}">${g === 'F' ? '♀' : '♂'}</span>`;

  function loadImg(img, src) {
    return new Promise((res) => {
      img.onload = () => res(); img.onerror = () => res();
      img.src = src;
      if (img.complete && img.naturalWidth) res();
    });
  }

  async function setSprite(side, mon) {
    const actor = el[side + 'Mon'];
    const img = actor.querySelector('img');
    await loadImg(img, spritePath(mon, side));
    const s = POS[side].scale;
    img.style.width = img.naturalWidth * s + 'px';
    img.style.height = img.naturalHeight * s + 'px';
    actor.querySelector('.shadow').style.width = Math.max(90, img.naturalWidth * s * 0.75) + 'px';
    updateStatusVisual(side, mon);
  }

  function monCenter(side) {
    const actor = el[side + 'Mon'];
    const img = actor.querySelector('img');
    const p = POS[side].mon;
    return { x: p.x, y: p.y - (img.offsetHeight || 150) * 0.5 };
  }

  function updateStatusVisual(side, mon) {
    const img = el[side + 'Mon'].querySelector('img');
    img.classList.toggle('frozen', mon && mon.status === 'frz');
    img.classList.toggle('paralyzed', mon && mon.status === 'par');
  }

  function showMon(side, visible) { el[side + 'Mon'].style.visibility = visible ? 'visible' : 'hidden'; }

  function throwBall(side) {
    const from = side === 'player' ? { x: POS.player.trainer.x + 40, y: POS.player.trainer.y - 120 } : { x: POS.foe.trainer.x - 20, y: POS.foe.trainer.y - 110 };
    const to = { x: POS[side].mon.x, y: POS[side].mon.y - 60 };
    const ball = document.createElement('div');
    ball.className = 'pokeball';
    el.stage.appendChild(ball);
    SFX.play('ball');
    const kf = [];
    for (let i = 0; i <= 12; i++) {
      const k = i / 12;
      kf.push({ transform: `translate(${from.x + (to.x - from.x) * k - 14}px, ${from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 140 - 14}px) rotate(${k * 720}deg)` });
    }
    return ball.animate(kf, { duration: 650, easing: 'linear', fill: 'forwards' }).finished.then(() => ball.remove());
  }

  async function sendOut(side, mon) {
    await setSprite(side, mon);
    const actor = el[side + 'Mon'];
    const img = actor.querySelector('img');
    showMon(side, false);
    renderBox(side, mon);
    await throwBall(side);
    SFX.play('pop');
    FX.play('sendout', monCenter(side), monCenter(side));
    showMon(side, true);
    await img.animate([
      { transform: 'scale(0.05)', filter: 'brightness(8) saturate(0)', opacity: 0.6 },
      { transform: 'scale(1.08)', filter: 'brightness(3) saturate(0.4)', opacity: 1, offset: 0.6 },
      { transform: 'scale(1)', filter: 'none', opacity: 1 },
    ], { duration: 450, easing: 'ease-out' }).finished;
    el[side + 'Box'].classList.remove('hidden');
    el[side + 'Box'].animate([{ opacity: 0, transform: `translateX(${side === 'player' ? 60 : -60}px)` }, { opacity: 1, transform: 'none' }], { duration: 300 });
    SFX.play('cry', mon.species.id);
    await wait(350);
  }

  async function recall(side) {
    const img = el[side + 'Mon'].querySelector('img');
    SFX.play('recall');
    await img.animate([
      { transform: 'scale(1)', filter: 'none' },
      { transform: 'scale(1)', filter: 'sepia(1) saturate(6) hue-rotate(-40deg) brightness(1.3)', offset: 0.3 },
      { transform: 'scale(0.05)', filter: 'sepia(1) saturate(6) hue-rotate(-40deg) brightness(2)', opacity: 0.3 },
    ], { duration: 500, easing: 'ease-in' }).finished;
    showMon(side, false);
    el[side + 'Box'].classList.add('hidden');
  }

  async function faint(side, mon) {
    const img = el[side + 'Mon'].querySelector('img');
    SFX.cry(mon.species.id, 0.7);
    await wait(250);
    SFX.play('faint');
    await img.animate([
      { transform: 'translateY(0)', clipPath: 'inset(0 0 0 0)', opacity: 1 },
      { transform: 'translateY(100%)', clipPath: 'inset(0 0 100% 0)', opacity: 0.6 },
    ], { duration: 550, easing: 'ease-in' }).finished;
    showMon(side, false);
    el[side + 'Box'].classList.add('hidden');
  }

  function lunge(side) {
    const img = el[side + 'Mon'].querySelector('img');
    const d = side === 'player' ? [70, -35] : [-60, 30];
    return img.animate([
      { transform: 'translate(0,0)' },
      { transform: `translate(${-d[0] * 0.2}px, ${-d[1] * 0.2}px)`, offset: 0.3 },
      { transform: `translate(${d[0]}px, ${d[1]}px)`, offset: 0.6 },
      { transform: 'translate(0,0)' },
    ], { duration: 380, easing: 'ease-in-out' }).finished;
  }

  function wiggle(side) {
    const img = el[side + 'Mon'].querySelector('img');
    return img.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-12px)' }, { transform: 'translateX(12px)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(0)' }],
      { duration: 400 }).finished;
  }

  function hitBlink(side) {
    const actor = el[side + 'Mon'];
    const img = actor.querySelector('img');
    const kf = [];
    for (let i = 0; i < 8; i++) kf.push({ opacity: i % 2 ? 1 : 0 });
    kf.push({ opacity: 1 });
    img.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(0)' }], { duration: 250 });
    return actor.animate(kf, { duration: 520 }).finished;
  }

  // ------------- HP boxes -------------
  function hpColor(frac) { return frac > 0.5 ? 'green' : frac > 0.2 ? 'yellow' : 'red'; }

  function renderBox(side, mon, hpOverride) {
    const box = el[side + 'Box'];
    box.querySelector('.name').textContent = mon.name;
    const gd = box.querySelector('.gender');
    gd.textContent = mon.gender === 'N' ? '' : mon.gender === 'F' ? '♀' : '♂';
    gd.className = 'gender ' + (mon.gender === 'F' ? 'f' : 'm');
    box.querySelector('.lv').textContent = 'Lv' + mon.level;
    const hp = hpOverride !== undefined ? hpOverride : mon.hp;
    setHpBar(side, mon, hp);
    const st = box.querySelector('.status');
    if (mon.status) { st.textContent = STATUS_LABEL[mon.status]; st.className = 'status ' + mon.status; st.style.display = 'inline-block'; }
    else st.style.display = 'none';
    if (side === 'player') setExpBar(mon);
    updateStatusVisual(side, mon);
  }

  function setHpBar(side, mon, hp) {
    const box = el[side + 'Box'];
    const frac = Math.max(0, hp / mon.maxhp);
    const fill = box.querySelector('.hpfill');
    fill.style.width = (frac * 100) + '%';
    fill.className = 'hpfill ' + hpColor(frac);
    const num = box.querySelector('.hpnum');
    if (num) num.textContent = `${Math.ceil(hp)}/ ${mon.maxhp}`;
    if (side === 'player') SFX.setLowHp(hp > 0 && frac <= 0.2);
  }

  function animateHP(side, mon, from, to) {
    const dur = Math.min(1100, Math.max(350, Math.abs(from - to) / mon.maxhp * 1500));
    return new Promise((res) => {
      const start = performance.now();
      const f = (now) => {
        const k = Math.min(1, (now - start) / dur);
        setHpBar(side, mon, from + (to - from) * k);
        if (k < 1) nextFrame(f); else res();
      };
      nextFrame(f);
    });
  }

  function setExpBar(mon, frac) {
    if (frac === undefined) {
      const lo = expForLevel(mon.species.growth, mon.level), hi = expForLevel(mon.species.growth, mon.level + 1);
      frac = mon.level >= 100 ? 0 : (mon.exp - lo) / (hi - lo);
    }
    el.playerBox.querySelector('.expfill').style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
  }

  function animateExp(fromFrac, toFrac) {
    const dur = Math.max(300, (toFrac - fromFrac) * 1400);
    return new Promise((res) => {
      const start = performance.now();
      let lastBeep = 0;
      const f = (now) => {
        const k = Math.min(1, (now - start) / dur);
        el.playerBox.querySelector('.expfill').style.width = (fromFrac + (toFrac - fromFrac) * k) * 100 + '%';
        if (now - lastBeep > 60) { SFX.play('exp'); lastBeep = now; }
        if (k < 1) nextFrame(f); else res();
      };
      nextFrame(f);
    });
  }

  function renderBalls(side, party) {
    const c = el[side + 'Balls'];
    c.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const m = party[i];
      const b = document.createElement('span');
      b.className = 'mini ' + (!m ? 'empty' : m.hp <= 0 ? 'fainted' : m.status ? 'statused' : 'ok');
      c.appendChild(b);
    }
    c.classList.remove('hidden');
  }

  // ------------- menus -------------
  function gridMove(idx, k, cols, n) {
    let r = Math.floor(idx / cols), c = idx % cols;
    if (k === 'U') r--; if (k === 'D') r++; if (k === 'L') c--; if (k === 'R') c++;
    const rows = Math.ceil(n / cols);
    r = Math.max(0, Math.min(rows - 1, r)); c = Math.max(0, Math.min(cols - 1, c));
    const ni = r * cols + c;
    return ni < n ? ni : idx;
  }

  let actionCursor = 0, moveCursor = 0;

  function actionMenu(mon) {
    return new Promise((resolve) => {
      setText(`What will\n${mon.name} do?`);
      el.textbox.classList.remove('hidden');
      el.actionMenu.classList.remove('hidden');
      const opts = [...el.actionMenu.querySelectorAll('.opt')];
      const draw = () => opts.forEach((o, i) => o.classList.toggle('sel', i === actionCursor));
      const choose = () => { SFX.play('select'); el.actionMenu.classList.add('hidden'); Input.clear(); resolve(['fight', 'bag', 'pokemon', 'run'][actionCursor]); };
      opts.forEach((o, i) => { o.onclick = () => { actionCursor = i; draw(); choose(); }; o.onmouseenter = () => { actionCursor = i; draw(); }; });
      draw();
      Input.set((k) => {
        if (k === 'A') choose();
        else if (k !== 'B') { const n = gridMove(actionCursor, k, 2, 4); if (n !== actionCursor) { actionCursor = n; SFX.play('blip'); draw(); } }
      });
    });
  }

  function moveMenu(mon) {
    return new Promise((resolve) => {
      el.textbox.classList.add('hidden');
      el.moveMenu.classList.remove('hidden');
      const slots = [...el.moveMenu.querySelectorAll('.move')];
      if (moveCursor >= mon.moves.length) moveCursor = 0;
      const draw = () => {
        slots.forEach((s, i) => {
          const m = mon.moves[i];
          s.textContent = m ? m.name : '-';
          s.classList.toggle('sel', i === moveCursor);
          s.style.setProperty('--tc', m ? TYPE_COLORS[m.type] : 'transparent');
        });
        const m = mon.moves[moveCursor];
        const pp = el.moveInfo.querySelector('.pp');
        pp.textContent = `${m.ppLeft}/${m.pp}`;
        pp.className = 'pp ' + (m.ppLeft === 0 ? 'empty' : m.ppLeft <= m.pp / 4 ? 'low' : m.ppLeft <= m.pp / 2 ? 'mid' : '');
        const ty = el.moveInfo.querySelector('.type');
        ty.textContent = m.type; ty.style.background = TYPE_COLORS[m.type];
        const eff = el.moveInfo.querySelector('.cat');
        eff.textContent = m.power ? (m.cat === 'S' ? 'SPECIAL' : 'PHYSICAL') + ` · ${m.power}` : 'STATUS';
      };
      const close = (v) => { el.moveMenu.classList.add('hidden'); el.textbox.classList.remove('hidden'); Input.clear(); resolve(v); };
      slots.forEach((s, i) => {
        s.onclick = () => { if (!mon.moves[i]) return; moveCursor = i; draw(); SFX.play('select'); close(i); };
        s.onmouseenter = () => { if (mon.moves[i]) { moveCursor = i; draw(); } };
      });
      el.moveMenu.querySelector('.back').onclick = () => { SFX.play('back'); close(-1); };
      draw();
      Input.set((k) => {
        if (k === 'A') { SFX.play('select'); close(moveCursor); }
        else if (k === 'B') { SFX.play('back'); close(-1); }
        else { const n = gridMove(moveCursor, k, 2, mon.moves.length); if (n !== moveCursor) { moveCursor = n; SFX.play('blip'); draw(); } }
      });
    });
  }

  function yesNo() {
    return new Promise((resolve) => {
      let c = 0;
      el.yesno.classList.remove('hidden');
      const opts = [...el.yesno.querySelectorAll('.opt')];
      const draw = () => opts.forEach((o, i) => o.classList.toggle('sel', i === c));
      const done = (v) => { el.yesno.classList.add('hidden'); Input.clear(); SFX.play(v ? 'select' : 'back'); resolve(v); };
      opts.forEach((o, i) => { o.onclick = () => done(i === 0); });
      draw();
      Input.set((k) => {
        if (k === 'U' || k === 'D') { c = 1 - c; SFX.play('blip'); draw(); }
        if (k === 'A') done(c === 0);
        if (k === 'B') done(false);
      });
    });
  }

  // ------------- party screen -------------
  let partyCursor = 0;
  function partyScreen(party, { prompt = 'Choose a POKéMON.', canCancel = true, activeIdx = -1 } = {}) {
    return new Promise((resolve) => {
      const root = el.party;
      root.classList.remove('hidden');
      const list = root.querySelector('.slots');
      const msg = root.querySelector('.pmsg');
      msg.textContent = prompt;
      const cancelBtn = root.querySelector('.cancel');
      cancelBtn.style.visibility = canCancel ? 'visible' : 'hidden';
      const n = party.length + (canCancel ? 1 : 0);
      if (partyCursor >= n) partyCursor = 0;
      let closed = false;
      const draw = () => {
        list.innerHTML = '';
        party.forEach((m, i) => {
          const frac = m.hp / m.maxhp;
          const d = document.createElement('div');
          d.className = 'slot' + (i === partyCursor ? ' sel' : '') + (m.hp <= 0 ? ' fainted' : '') + (i === activeIdx ? ' active' : '');
          d.innerHTML = `
            <img src="${spritePathFor(m.species)}" class="mini-sprite">
            <div class="info">
              <div class="pname">${m.name} ${genderHTML(m.gender)}</div>
              <div class="plv">Lv${m.level} ${m.status ? `<span class="status ${m.status}">${STATUS_LABEL[m.status]}</span>` : ''}${m.hp <= 0 ? '<span class="status fnt">FNT</span>' : ''}</div>
              <div class="hprow"><span class="hplabel">HP</span><div class="hpbar"><div class="hpfill ${hpColor(frac)}" style="width:${frac * 100}%"></div></div></div>
              <div class="phpnum">${m.hp}/ ${m.maxhp}</div>
            </div>`;
          d.onclick = () => { if (closed) return; partyCursor = i; pick(); };
          d.onmouseenter = () => { if (!closed && partyCursor !== i) { partyCursor = i; draw(); } };
          list.appendChild(d);
        });
        cancelBtn.classList.toggle('sel', partyCursor === party.length);
      };
      cancelBtn.onclick = () => { if (canCancel && !closed) { SFX.play('back'); close(-1); } };
      const close = (v) => { closed = true; root.classList.add('hidden'); Input.clear(); resolve(v); };
      const pick = () => {
        if (partyCursor === party.length) { SFX.play('back'); close(-1); return; }
        SFX.play('select'); close(partyCursor);
      };
      draw();
      Input.set((k) => {
        if (k === 'A') pick();
        else if (k === 'B') { if (canCancel) { SFX.play('back'); close(-1); } }
        else {
          let c = partyCursor;
          if (c === party.length) { if (k === 'U') c = party.length - 1; }
          else if (k === 'D' && c + 2 >= party.length && canCancel) c = party.length;
          else c = gridMove(c, k, 2, party.length);
          if (c !== partyCursor) { partyCursor = c; SFX.play('blip'); draw(); }
        }
      });
    });
  }

  function subMenu(options) {
    return new Promise((resolve) => {
      const box = el.party.querySelector('.submenu');
      el.party.classList.remove('hidden');
      box.classList.remove('hidden');
      let c = 0;
      const draw = () => {
        box.innerHTML = options.map((o, i) => `<div class="opt ${i === c ? 'sel' : ''}" data-i="${i}">${o}</div>`).join('');
        box.querySelectorAll('.opt').forEach(n => n.onclick = () => { c = +n.dataset.i; done(c); });
      };
      const done = (v) => { box.classList.add('hidden'); Input.clear(); SFX.play(v === -1 || options[v] === 'CANCEL' ? 'back' : 'select'); resolve(v); };
      draw();
      Input.set((k) => {
        if (k === 'U') { c = (c + options.length - 1) % options.length; SFX.play('blip'); draw(); }
        if (k === 'D') { c = (c + 1) % options.length; SFX.play('blip'); draw(); }
        if (k === 'A') done(c);
        if (k === 'B') done(-1);
      });
    });
  }

  function partyMessage(text) {
    el.party.classList.remove('hidden');
    el.party.querySelector('.pmsg').textContent = text;
    const msg = el.party.querySelector('.pmsg');
    return new Promise((res) => {
      const done = () => { Input.clear(); msg.onclick = null; SFX.play('blip'); res(); };
      setTimeout(() => { Input.set((k) => { if (k === 'A' || k === 'B') done(); }); msg.onclick = done; }, 50);
    });
  }
  function hideParty() { el.party.classList.add('hidden'); }

  // ------------- summary -------------
  function summary(mon) {
    return new Promise((resolve) => {
      const s = el.summary;
      const statRow = (k, label) => `<tr><td>${label}</td><td>${k === 'hp' ? `${mon.hp}/${mon.maxhp}` : mon.stats[k]}</td></tr>`;
      s.innerHTML = `
        <div class="sum-card">
          <div class="sum-left">
            <div class="sum-name">${mon.name} ${genderHTML(mon.gender)} <span class="sum-lv">Lv${mon.level}</span></div>
            <img src="${spritePathFor(mon.species)}">
            <div class="types">${mon.types.map(t => `<span class="type" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('')}</div>
            <div class="ability">ABILITY: <b>${mon.ability}</b></div>
            <div class="ability">STATUS: <b>${mon.hp <= 0 ? 'FAINTED' : mon.status ? STATUS_LABEL[mon.status] : 'OK'}</b></div>
            ${mon.level < 100 ? `<div class="ability">EXP TO NEXT: <b>${expForLevel(mon.species.growth, mon.level + 1) - mon.exp}</b></div>` : ''}
          </div>
          <div class="sum-right">
            <table class="stats">${statRow('hp', 'HP')}${statRow('atk', 'ATTACK')}${statRow('def', 'DEFENSE')}${statRow('spa', 'SP. ATK')}${statRow('spd', 'SP. DEF')}${statRow('spe', 'SPEED')}</table>
            <div class="sum-moves">${mon.moves.map(m => `<div class="sum-move"><span class="type" style="background:${TYPE_COLORS[m.type]}">${m.type}</span><span class="mn">${m.name}</span><span class="mpp">PP ${m.ppLeft}/${m.pp}</span></div>`).join('')}</div>
          </div>
        </div>
        <div class="sum-hint">Z / X / Click to close</div>`;
      s.classList.remove('hidden');
      const close = () => { s.classList.add('hidden'); Input.clear(); SFX.play('back'); resolve(); };
      s.onclick = close;
      Input.set((k) => { if (k === 'A' || k === 'B') close(); });
    });
  }

  // ------------- bag -------------
  let bagCursor = 0;
  function bagScreen(items) {
    return new Promise((resolve) => {
      const root = el.bag;
      root.classList.remove('hidden');
      const names = Object.keys(items).filter(k => items[k] > 0);
      const n = names.length + 1;
      if (bagCursor >= n) bagCursor = 0;
      const draw = () => {
        const list = root.querySelector('.items');
        list.innerHTML = names.map((nm, i) => `<div class="item ${i === bagCursor ? 'sel' : ''}" data-i="${i}"><span>${nm}</span><span>×${items[nm]}</span></div>`).join('')
          + `<div class="item ${bagCursor === names.length ? 'sel' : ''}" data-i="${names.length}"><span>CLOSE BAG</span><span></span></div>`;
        list.querySelectorAll('.item').forEach(d => {
          d.onclick = () => { bagCursor = +d.dataset.i; pick(); };
          d.onmouseenter = () => { if (bagCursor !== +d.dataset.i) { bagCursor = +d.dataset.i; draw(); } };
        });
        root.querySelector('.desc').textContent = bagCursor < names.length ? ITEMS[names[bagCursor]].desc : 'Close the BAG and return to battle.';
      };
      const close = (v) => { root.classList.add('hidden'); Input.clear(); resolve(v); };
      const pick = () => {
        if (bagCursor === names.length) { SFX.play('back'); close(null); return; }
        SFX.play('select'); close(names[bagCursor]);
      };
      draw();
      Input.set((k) => {
        if (k === 'A') pick();
        else if (k === 'B') { SFX.play('back'); close(null); }
        else if (k === 'U' || k === 'D') { bagCursor = (bagCursor + (k === 'U' ? n - 1 : 1)) % n; SFX.play('blip'); draw(); }
      });
    });
  }

  // ------------- battle scene setup -------------
  function prepareBattle({ bg, foeSprite }) {
    resetBattle();
    el.bg.style.backgroundImage = `url('${bg || 'assets/arena_bg.png'}')`;
    document.getElementById('rays').style.display = bg && bg.includes('grass') ? 'none' : '';
    const ft = el.foeTrainer;
    if (foeSprite) { ft.style.display = ''; ft.querySelector('img').src = foeSprite; }
    else ft.style.display = 'none';
    el.playerTrainer.style.display = '';
  }

  function resetBattle() {
    for (const n of [el.foeTrainer, el.playerTrainer, el.foeMon, el.playerMon, el.foeBox, el.playerBox]) {
      n.getAnimations().forEach(a => a.cancel());
      const img = n.querySelector('img');
      if (img) img.getAnimations().forEach(a => a.cancel());
    }
    showMon('foe', false); showMon('player', false);
    for (const k of ['foeBox', 'playerBox', 'foeBalls', 'playerBalls', 'actionMenu', 'moveMenu', 'yesno', 'choice']) el[k].classList.add('hidden');
    el.stage.querySelectorAll('.pokeball').forEach(b => b.remove());
    el.textbox.classList.remove('hidden');
    setText('');
    SFX.setLowHp(false);
  }

  async function wildAppear(mon) {
    await setSprite('foe', mon);
    const img = el.foeMon.querySelector('img');
    showMon('foe', true);
    renderBox('foe', mon);
    await img.animate([
      { transform: 'translateX(-700px)', filter: 'brightness(0.15)' },
      { transform: 'translateX(0)', filter: 'brightness(0.15)', offset: 0.75 },
      { transform: 'translateX(0)', filter: 'none' },
    ], { duration: 1000, easing: 'ease-out' }).finished;
    el.foeBox.classList.remove('hidden');
    el.foeBox.animate([{ opacity: 0, transform: 'translateX(-60px)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
  }

  const BALL_CLASS = { 'GREAT BALL': 'great', 'ULTRA BALL': 'ultra', 'MASTER BALL': 'master' };
  async function catchAnim(shakes, item) {
    const from = { x: POS.player.trainer.x + 40, y: POS.player.trainer.y - 120 };
    const to = { x: POS.foe.mon.x, y: monCenter('foe').y };
    const ground = { x: POS.foe.mon.x, y: POS.foe.mon.y - 16 };
    const ball = document.createElement('div');
    ball.className = 'pokeball ' + (BALL_CLASS[item] || '');
    el.stage.appendChild(ball);
    const at = (p, rot = 0) => `translate(${p.x - 14}px, ${p.y - 14}px) rotate(${rot}deg)`;
    SFX.play('ball');
    const kf = [];
    for (let i = 0; i <= 14; i++) {
      const k = i / 14;
      kf.push({ transform: `translate(${from.x + (to.x - from.x) * k - 14}px, ${from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 160 - 14}px) rotate(${k * 900}deg)` });
    }
    await ball.animate(kf, { duration: 700, fill: 'forwards' }).finished;
    SFX.play('pop');
    FX.play('sendout', to, to);
    const img = el.foeMon.querySelector('img');
    await img.animate([{ transform: 'scale(1)', filter: 'none' }, { transform: 'scale(0.05)', filter: 'sepia(1) saturate(8) hue-rotate(-40deg) brightness(2)' }], { duration: 400, easing: 'ease-in' }).finished;
    showMon('foe', false);
    await ball.animate([{ transform: at(to) }, { transform: at(ground) }, { transform: at({ x: ground.x, y: ground.y - 30 }) }, { transform: at(ground) }],
      { duration: 600, easing: 'ease-in', fill: 'forwards' }).finished;
    for (let i = 0; i < Math.min(3, shakes); i++) {
      await wait(450);
      SFX.play('blip');
      await ball.animate([{ transform: at(ground, 0) }, { transform: at(ground, -28) }, { transform: at(ground, 22) }, { transform: at(ground, 0) }],
        { duration: 420, fill: 'forwards' }).finished;
    }
    await wait(500);
    if (shakes >= 4) {
      SFX.play('select');
      FX.burst({ x: ground.x, y: ground.y }, 14, { shape: 'star', color: '#fff4a0', core: '#fff', size: 9, maxSp: 160 });
      ball.style.filter = 'brightness(0.65)';
      await wait(400);
      return;
    }
    ball.remove();
    SFX.play('pop');
    FX.play('sendout', to, to);
    showMon('foe', true);
    await img.animate([{ transform: 'scale(0.05)', filter: 'brightness(4)' }, { transform: 'scale(1)', filter: 'none' }], { duration: 400, easing: 'ease-out' }).finished;
  }

  function choice(options, { cls = '' } = {}) {
    return new Promise((resolve) => {
      let c = 0;
      const box = el.choice;
      box.className = cls;
      box.classList.remove('hidden');
      const draw = () => {
        box.innerHTML = options.map((o, i) => `<div class="opt ${i === c ? 'sel' : ''}" data-i="${i}">${o}</div>`).join('');
        box.querySelectorAll('.opt').forEach(n => { n.onclick = () => done(+n.dataset.i); n.onmouseenter = () => { c = +n.dataset.i; draw(); }; });
      };
      const done = (v) => { box.classList.add('hidden'); Input.clear(); SFX.play(v < 0 ? 'back' : 'select'); resolve(v); };
      draw();
      Input.set((k) => {
        if (k === 'U') { c = (c + options.length - 1) % options.length; SFX.play('blip'); draw(); }
        if (k === 'D') { c = (c + 1) % options.length; SFX.play('blip'); draw(); }
        if (k === 'A') done(c);
        if (k === 'B') done(-1);
      });
    });
  }

  // ------------- misc -------------
  function fade(toBlack, ms = 600) {
    return el.fade.animate([{ opacity: toBlack ? 0 : 1 }, { opacity: toBlack ? 1 : 0 }], { duration: ms, fill: 'forwards' }).finished;
  }

  function trainerSlide(side, inward) {
    const t = el[side + 'Trainer'];
    const dx = side === 'player' ? -500 : 500;
    return t.animate(inward ? [{ transform: `translate(calc(-50% + ${dx}px), -100%)` }, { transform: 'translate(-50%, -100%)' }]
      : [{ transform: 'translate(-50%, -100%)' }, { transform: `translate(calc(-50% + ${dx}px), -100%)` }], { duration: 900, easing: 'ease-out', fill: 'forwards' }).finished;
  }

  function title() {
    return new Promise((res) => {
      const go = () => {
        Input.clear(); el.title.onclick = null; SFX.init(); SFX.play('select');
        el.title.classList.add('gone'); setTimeout(() => el.title.remove(), 700); fitStage(); res();
      };
      el.title.onclick = go;
      Input.set((k) => { if (k === 'A') go(); });
    });
  }

  function showResult(won, text) {
    el.result.innerHTML = `<div class="res-title ${won ? 'win' : 'lose'}">${won ? 'VICTORY!' : 'DEFEAT...'}</div><div class="res-sub">${text}</div><div class="res-btn">▶ PLAY AGAIN</div>`;
    el.result.classList.remove('hidden');
    const again = () => location.reload();
    el.result.querySelector('.res-btn').onclick = again;
    Input.set((k) => { if (k === 'A') again(); });
  }

  return {
    prepareBattle, resetBattle, wildAppear, catchAnim, choice, genderHTML,
    init, say, setText, sendOut, recall, faint, lunge, wiggle, hitBlink, renderBox, animateHP, setHpBar, setExpBar, animateExp,
    renderBalls, actionMenu, moveMenu, yesNo, partyScreen, subMenu, partyMessage, hideParty, summary, bagScreen, monCenter,
    showMon, fade, trainerSlide, title, showResult, toggleSound, updateStatusVisual, el,
    isTyping: () => typing,
  };
})();
