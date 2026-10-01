// Battle Mode: pick any 6 Gen I–VI POKéMON (incl. Mega Evolutions), then fight any GYM LEADER, CHAMPION or LEGENDARY boss.
const BattleMode = (() => {
  const TEAM_KEY = 'pkfr_bm_team', BEAT_KEY = 'pkfr_bm_beaten', LV_KEY = 'pkfr_bm_level';
  const MAX_GEN = 6;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const MEGA_TAB = ROMAN.length + 1; // tab index: 0=ALL, 1–6=GEN, 7=MEGA only
  const MAX_MEGAS = 2;
  const pickable = (k) => { const d = DEX[k]; return d && (d.mega || d.gen <= MAX_GEN); };
  const megaCount = (list = team) => list.filter(k => DEX[k]?.mega).length;
  const canAdd = (k) => {
    if (team.includes(k)) return true;
    if (team.length >= 6) return false;
    if (DEX[k]?.mega && megaCount() >= MAX_MEGAS) return false;
    return true;
  };
  const trimExtraMegas = () => {
    while (megaCount() > MAX_MEGAS) {
      const i = team.findIndex(k => DEX[k]?.mega);
      if (i < 0) break;
      team.splice(i, 1);
    }
  };
  const PLAYER_ITEMS = () => ({ 'HYPER POTION': 3, 'FULL RESTORE': 2, 'FULL HEAL': 3, 'REVIVE': 2, 'X ATTACK': 2, 'X SPECIAL': 2, 'X SPEED': 2 });

  let team = JSON.parse(localStorage.getItem(TEAM_KEY) || '[]').filter(k => DEX[k]);
  trimExtraMegas();
  const beaten = new Set(JSON.parse(localStorage.getItem(BEAT_KEY) || '[]'));
  let level = +(localStorage.getItem(LV_KEY) || 100);
  let gen = 0, typeFilter = '', search = '', focus = team[0] || 'CHARIZARD', cat = 'KANTO', chosen = null;
  const persist = () => {
    localStorage.setItem(TEAM_KEY, JSON.stringify(team));
    localStorage.setItem(BEAT_KEY, JSON.stringify([...beaten]));
    localStorage.setItem(LV_KEY, String(level));
  };
  const $$ = (id) => document.getElementById(id);
  const typeBadges = (types) => types.map(t => `<span class="type" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('');
  const hideAll = () => ['builder', 'opponents', 'bmresult'].forEach(id => { $$(id).classList.add('hidden'); $$(id).innerHTML = ''; });
  const syncMegaHint = () => {
    const h = $$('tbHint');
    if (!h) return;
    const mc = megaCount();
    h.innerHTML = gen === MEGA_TAB
      ? `<b>48 Mega Evolutions</b> — team limit <b>${mc}/${MAX_MEGAS}</b> megas.`
      : `Megas: <b>MEGA</b> tab · max <b>${MAX_MEGAS}</b> per team (${mc}/${MAX_MEGAS} now).`;
  };

  function pickRandomTeam() {
    const pool = DEX_ORDER.filter(pickable);
    team = [];
    while (team.length < 6) {
      const k = pool[randInt(0, pool.length - 1)];
      if (team.includes(k) || !canAdd(k)) continue;
      team.push(k);
    }
    focus = team[0];
  }

  function pickRandomOpponent() {
    chosen = TRAINERS[randInt(0, TRAINERS.length - 1)].id;
  }

  function showRandomRoll() {
    const t = TRAINERS.find(x => x.id === chosen);
    return new Promise((res) => {
      hideAll();
      const root = $$('bmresult');
      root.innerHTML = `
        <div class="rand-roll">
          <div class="rand-title">⚡ RANDOM MODE</div>
          <div class="rand-sub">Any Gen · Any Type · Any Trainer</div>
          <div class="rand-block">
            <div class="rand-label">YOUR TEAM</div>
            <div class="rand-sprites">${team.map(k => `<img src="${spritePathFor(DEX[k])}" title="${DEX[k].name}">`).join('')}</div>
          </div>
          <div class="rand-vs">VS</div>
          <div class="rand-block foe">
            <div class="rand-label">${t.title} ${t.name}</div>
            <img class="rand-trainer" src="assets/trainers/${t.sprite}.png" alt="">
            <div class="rand-sprites">${t.team.map(k => `<img src="${spritePathFor(DEX[k])}">`).join('')}</div>
          </div>
          <div class="rand-go btn go big" id="randGo">BATTLE! ▶</div>
        </div>`;
      root.classList.remove('hidden');
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        Input.clear(); SFX.play('select'); root.classList.add('hidden'); res();
      };
      $$('randGo').onclick = go;
      Input.set((k) => { if (k === 'A') go(); });
      const tmr = setTimeout(go, 2800);
      root.querySelector('.rand-roll').addEventListener('click', () => { clearTimeout(tmr); go(); }, { once: true });
    });
  }
  
  async function startRandomMode() {
    pickRandomTeam();
    pickRandomOpponent();
    persist();
    await showRandomRoll();
    await startBattle();
  }

  // ---------------- team builder ----------------
  function filtered() {
    const q = search.trim().toUpperCase();
    return DEX_ORDER.filter(k => {
      if (!pickable(k)) return false;
      const d = DEX[k];
      if (gen === MEGA_TAB) { if (!d.mega) return false; }
      else if (gen && d.gen !== gen) return false;
      if (typeFilter && !d.types.includes(typeFilter)) return false;
      if (q && !d.name.includes(q) && String(d.id) !== q && !(d.mega && q.includes('MEGA'))) return false;
      return true;
    });
  }

  function detailHTML(k) {
    const d = DEX[k];
    const labels = ['HP', 'ATK', 'DEF', 'SPA', 'SPD', 'SPE'];
    const bst = d.base.reduce((a, b) => a + b, 0);
    return `<div class="bd-top"><img src="${spritePathFor(d)}"><div>
        <div class="bd-name">#${String(d.id).padStart(d.id >= 10000 ? 5 : 3, '0')} ${d.name}${d.mega ? ' <span class="mega">⬡ MEGA</span>' : ''}${d.leg ? ' <span class="leg">★ LEGEND</span>' : ''}</div>
        <div class="types">${typeBadges(d.types)}</div><div class="bd-ab">ABILITY: ${d.ability}</div></div></div>
      <div class="bd-stats">${d.base.map((v, i) => `<div class="bd-stat"><span>${labels[i]}</span><b>${v}</b><div class="bar"><div style="width:${Math.min(100, v / 1.8)}%;background:${v >= 110 ? '#40d080' : v >= 75 ? '#e8d040' : '#e87040'}"></div></div></div>`).join('')}
        <div class="bd-stat bst"><span>TOTAL</span><b>${bst}</b></div></div>
      <div class="bd-moves">${d.set.map(id => { const m = MOVES[id]; return `<div class="bd-move"><span class="type" style="background:${TYPE_COLORS[m.type] || '#888'}">${m.type}</span>${m.name}<i>${m.cat === 'X' ? 'STATUS' : m.power}</i></div>`; }).join('')}</div>`;
  }

  function renderTeam() {
    const slots = [];
    for (let i = 0; i < 6; i++) {
      const k = team[i];
      slots.push(k ? `<div class="tb-slot" data-i="${i}"><img src="${spritePathFor(DEX[k])}"><div class="tb-sname">${DEX[k].name}</div><div class="types">${typeBadges(DEX[k].types)}</div><span class="tb-x">✕</span></div>`
        : `<div class="tb-slot empty">EMPTY</div>`);
    }
    $$('tbTeam').innerHTML = slots.join('');
    $$('tbTeam').querySelectorAll('.tb-slot[data-i]').forEach(n => {
      n.onclick = () => { team.splice(+n.dataset.i, 1); SFX.play('back'); persist(); renderTeam(); renderGrid(); };
      n.onmouseenter = () => { focus = team[+n.dataset.i]; $$('tbDetail').innerHTML = detailHTML(focus); };
    });
    const mc = megaCount();
    $$('tbCount').textContent = `${team.length}/6 · MEGA ${mc}/${MAX_MEGAS}`;
    $$('tbNext').classList.toggle('off', team.length === 0);
    syncMegaHint();
  }

  function renderGrid() {
    const list = filtered();
    const grid = $$('tbGrid');
    const megaFull = megaCount() >= MAX_MEGAS;
    grid.innerHTML = list.map(k => {
      const d = DEX[k];
      const locked = d.mega && megaFull && !team.includes(k);
      return `<div class="tb-card ${team.includes(k) ? 'in' : ''} ${d.leg ? 'leg' : ''} ${d.mega ? 'mega' : ''} ${locked ? 'mega-lock' : ''}" data-k="${k}"><img loading="lazy" src="${spritePathFor(d)}"><div class="tb-num">${d.mega ? 'MEGA' : '#' + d.id}</div><div class="tb-name">${d.name}</div></div>`;
    }).join('') || '<div class="tb-none">No POKéMON match.</div>';
    $$('tbFound').textContent = `${list.length} POKéMON`;
    grid.onclick = (e) => {
      const c = e.target.closest('.tb-card'); if (!c) return;
      const k = c.dataset.k;
      const i = team.indexOf(k);
      if (i >= 0) { team.splice(i, 1); SFX.play('back'); }
      else if (!canAdd(k)) { SFX.play('error'); return; }
      else { team.push(k); SFX.play('select'); SFX.cry(DEX[k].id); }
      persist(); renderTeam(); c.classList.toggle('in', team.includes(k));
    };
    grid.onmouseover = (e) => {
      const c = e.target.closest('.tb-card'); if (!c || c.dataset.k === focus) return;
      focus = c.dataset.k; $$('tbDetail').innerHTML = detailHTML(focus);
    };
  }

  function openBuilder() {
    hideAll();
    const root = $$('builder');
    root.innerHTML = `
      <div class="bm-head"><div class="bm-title">BATTLE MODE · BUILD YOUR TEAM</div>
        <div class="bm-btns"><div class="btn rand-mode" id="tbRandMode">⚡ RANDOM MODE</div><div class="btn" id="tbRandom">RANDOM TEAM</div><div class="btn" id="tbClear">CLEAR</div><div class="btn go" id="tbNext">NEXT ▶</div></div></div>
      <div class="tb-body">
        <div class="tb-left">
          <div class="tb-filters">
            <div class="tb-gens">${['ALL', ...ROMAN, 'MEGA'].map((r, i) => `<div class="tab ${r === 'MEGA' ? 'megatab' : ''} ${i === gen ? 'on' : ''}" data-g="${i}">${i && r !== 'MEGA' ? 'GEN ' + r : r}</div>`).join('')}</div>
            <div class="tb-hint" id="tbHint">Megas: tap <b>MEGA</b> tab — max <b>2</b> per team (like official battles).</div>
            <div class="tb-row"><input id="tbSearch" placeholder="SEARCH (e.g. MEGA, GENGAR MEGA)" value="${search}" autocomplete="off">
              <select id="tbType"><option value="">ALL TYPES</option>${TYPES.map(t => `<option ${t === typeFilter ? 'selected' : ''}>${t}</option>`).join('')}</select>
              <span id="tbFound"></span></div>
          </div>
          <div class="tb-grid" id="tbGrid"></div>
        </div>
        <div class="tb-right">
          <div class="tb-label">YOUR TEAM <span id="tbCount"></span></div>
          <div class="tb-team" id="tbTeam"></div>
          <div class="tb-detail" id="tbDetail"></div>
        </div>
      </div>`;
    root.classList.remove('hidden');
    root.querySelectorAll('.tb-gens .tab').forEach(t => t.onclick = () => {
      gen = +t.dataset.g; SFX.play('blip');
      root.querySelectorAll('.tb-gens .tab').forEach(x => x.classList.toggle('on', x === t));
      syncMegaHint(); renderGrid(); $$('tbGrid').scrollTop = 0;
    });
    syncMegaHint();
    $$('tbSearch').oninput = (e) => { search = e.target.value; renderGrid(); };
    $$('tbType').onchange = (e) => { typeFilter = e.target.value; renderGrid(); };
    $$('tbRandMode').onclick = () => { SFX.play('select'); startRandomMode(); };
    $$('tbRandom').onclick = () => {
      const pool = DEX_ORDER.filter(k => pickable(k) && DEX[k].base.reduce((a, b) => a + b) >= 480);
      team = [];
      while (team.length < 6) {
        const k = pool[randInt(0, pool.length - 1)];
        if (!canAdd(k)) continue;
        team.push(k);
      }
      SFX.play('select'); persist(); renderTeam(); renderGrid();
    };
    $$('tbClear').onclick = () => { team = []; SFX.play('back'); persist(); renderTeam(); renderGrid(); };
    $$('tbNext').onclick = () => { if (!team.length) { SFX.play('error'); return; } SFX.play('select'); openOpponents(); };
    $$('tbDetail').innerHTML = detailHTML(focus);
    renderTeam(); renderGrid();
    Input.set((k) => { if (k === 'A' && team.length) $$('tbNext').onclick(); });
  }

  // ---------------- opponent select ----------------
  function trainerCard(t) {
    return `<div class="op-card ${chosen === t.id ? 'sel' : ''} ${t.cat === 'LEGENDS' ? 'legend' : ''}" data-id="${t.id}">
      ${beaten.has(t.id) ? '<div class="op-star">★</div>' : ''}
      <img class="op-sprite" src="assets/trainers/${t.sprite}.png">
      <div class="op-name">${t.name}</div><div class="op-title">${t.title}</div>
      <div class="op-type">${t.type === 'MIXED' || t.type === 'LEGEND' ? `<span class="type" style="background:${t.type === 'LEGEND' ? '#c89020' : '#707888'}">${t.type}</span>` : typeBadges([t.type])}</div>
      <div class="op-team">${t.team.map(k => `<img loading="lazy" src="${spritePathFor(DEX[k])}">`).join('')}</div></div>`;
  }

  function renderOpponents() {
    const list = TRAINERS.filter(t => t.cat === cat);
    $$('opGrid').innerHTML = list.map(trainerCard).join('');
    $$('opGrid').querySelectorAll('.op-card').forEach(n => {
      n.onclick = () => { chosen = n.dataset.id; SFX.play('blip'); renderOpponents(); renderChosen(); };
      n.ondblclick = () => { chosen = n.dataset.id; startBattle(); };
    });
    $$('opTabs').querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.c === cat));
  }

  function renderChosen() {
    const t = TRAINERS.find(x => x.id === chosen);
    $$('opBar').innerHTML = t
      ? `<div class="op-quote"><b>${t.title} ${t.name}:</b> "${t.quote.replace('\n', ' ')}"${t.cat === 'LEGENDS' ? ' <span class="leg">OVERPOWERED</span>' : ''}</div><div class="btn go big" id="opFight">BATTLE! ▶</div>`
      : '<div class="op-quote">Pick an opponent. Beaten opponents get a ★.</div>';
    if (t) $$('opFight').onclick = startBattle;
  }

  function openOpponents() {
    hideAll();
    const root = $$('opponents');
    const done = TRAINERS.filter(t => beaten.has(t.id)).length;
    root.innerHTML = `
      <div class="bm-head"><div class="bm-title">CHOOSE YOUR OPPONENT <span class="bm-sub">${done}/${TRAINERS.length} BEATEN</span></div>
        <div class="bm-btns"><div class="btn" id="opBack">◀ TEAM</div><div class="btn rand-mode" id="opRandMode">⚡ RANDOM MODE</div>
          <div class="lvl"><span>LEVEL</span><div class="tab ${level === 50 ? 'on' : ''}" data-l="50">50</div><div class="tab ${level === 100 ? 'on' : ''}" data-l="100">100</div></div></div></div>
      <div class="op-mine">${team.map(k => `<img src="${spritePathFor(DEX[k])}" title="${DEX[k].name}">`).join('')}</div>
      <div class="op-tabs" id="opTabs">${TRAINER_CATS.map(c => `<div class="tab ${c === 'LEGENDS' ? 'legtab' : ''}" data-c="${c}">${c}</div>`).join('')}</div>
      <div class="op-grid" id="opGrid"></div>
      <div class="op-bar" id="opBar"></div>`;
    root.classList.remove('hidden');
    $$('opBack').onclick = () => { SFX.play('back'); openBuilder(); };
    $$('opRandMode').onclick = () => { SFX.play('select'); startRandomMode(); };
    root.querySelectorAll('.lvl .tab').forEach(t => t.onclick = () => {
      level = +t.dataset.l; persist(); SFX.play('blip');
      root.querySelectorAll('.lvl .tab').forEach(x => x.classList.toggle('on', x === t));
    });
    $$('opTabs').querySelectorAll('.tab').forEach(t => t.onclick = () => { cat = t.dataset.c; SFX.play('blip'); renderOpponents(); });
    renderOpponents(); renderChosen();
    Input.set((k) => { if (k === 'B') $$('opBack').onclick(); if (k === 'A' && chosen) startBattle(); });
  }

  // ---------------- battle ----------------
  async function startBattle() {
    const t = TRAINERS.find(x => x.id === chosen);
    if (!t || !team.length) return;
    Input.clear();
    SFX.play('select');
    await UI.fade(true, 400);
    hideAll();
    const party = team.map(k => new Mon({ species: k, level, set: true, ev: 85 }));
    const foe = t.team.map(k => new Mon({ species: k, level, set: true, ev: t.ev || 85 }, 'foe'));
    const legend = t.cat === 'LEGENDS';
    const { result } = await Battle.run({
      player: { name: 'RED', party, items: PLAYER_ITEMS() },
      foe: { trainer: `${t.title} ${t.name}`, party: foe, items: { 'FULL RESTORE': t.items || (legend ? 3 : 2) }, sprite: `assets/trainers/${t.sprite}.png` },
      bg: legend || t.cat === 'CHAMPIONS' ? 'assets/arena_bg.png' : (['GRASS', 'BUG', 'FLYING', 'FAIRY', 'NORMAL'].includes(t.type) ? 'assets/grass_bg.png' : 'assets/arena_bg.png'),
      intro: [`${t.name}: ${t.quote}`.length > 40 ? t.quote : `${t.name}: ${t.quote}`],
      winText: [legend ? `${t.name}: Impossible...!\nMy legendary POKéMON...!` : `${t.name}: Incredible...\nYou're truly strong!`],
      prize: legend ? 99999 : level * 100, exp: false,
    });
    if (result === 'win') { beaten.add(t.id); persist(); }
    showResult(result === 'win', t);
  }

  function showResult(won, t) {
    const root = $$('bmresult');
    const opts = [
      ['REMATCH', () => startBattle()],
      ['RANDOM AGAIN', () => startRandomMode()],
      ['NEW OPPONENT', () => openOpponents()],
      ['EDIT TEAM', () => openBuilder()],
    ];
    let c = 0;
    const draw = () => {
      root.innerHTML = `<div class="res-title ${won ? 'win' : 'lose'}">${won ? 'VICTORY!' : 'DEFEAT...'}</div>
        <img class="res-trainer" src="assets/trainers/${t.sprite}.png">
        <div class="res-sub">${won ? `You defeated ${t.title} ${t.name}!` : `${t.title} ${t.name} was too strong...`}</div>
        <div class="res-opts">${opts.map(([n], i) => `<div class="res-btn2 ${i === c ? 'sel' : ''}" data-i="${i}">${n}</div>`).join('')}</div>`;
      root.querySelectorAll('.res-btn2').forEach(n => { n.onclick = () => go(+n.dataset.i); n.onmouseenter = () => { c = +n.dataset.i; draw(); }; });
    };
    const go = (i) => { Input.clear(); SFX.play('select'); root.classList.add('hidden'); UI.fade(false, 300); opts[i][1](); };
    draw();
    root.classList.remove('hidden');
    UI.fade(false, 400);
    Input.set((k) => {
      if (k === 'L' || k === 'U') { c = (c + opts.length - 1) % opts.length; SFX.play('blip'); draw(); }
      if (k === 'R' || k === 'D') { c = (c + 1) % opts.length; SFX.play('blip'); draw(); }
      if (k === 'A') go(c);
    });
  }

  async function open() {
    await UI.fade(false, 300);
    openBuilder();
  }

  return { open };
})();
