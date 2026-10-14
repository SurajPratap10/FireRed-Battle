// Battle Mode: pick any 6 Gen I–IX POKéMON (incl. Mega + Gigantamax), then fight any GYM LEADER, CHAMPION or LEGENDARY boss.
const BattleMode = (() => {
  const TEAM_KEY = 'pkfr_bm_team', BEAT_KEY = 'pkfr_bm_beaten', LV_KEY = 'pkfr_bm_level';
  const MAX_GEN = 9;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  const MEGA_TAB = ROMAN.length + 1; // 0=ALL, 1–9=GEN, 10=MEGA, 11=G-MAX
  const GMAX_TAB = MEGA_TAB + 1;
  const MAX_MEGAS = 1, MAX_GMAX = 1, MAX_LEGS = 2, MAX_MYTHS = 1;
  const pickable = (k) => !!DEX[k];
  const isMega = (k) => !!DEX[k]?.mega;
  const isGmax = (k) => !!DEX[k]?.gmax;
  const isLeg = (k) => DEX[k]?.leg === 1;
  const isMyth = (k) => DEX[k]?.leg === 2;
  const countOf = (pred, list = team) => list.filter(pred).length;
  const megaCount = (list = team) => countOf(isMega, list);
  const gmaxCount = (list = team) => countOf(isGmax, list);
  const canAddTo = (k, list) => {
    if (list.includes(k) || list.length >= 6 || !DEX[k]) return false;
    if (isMega(k) && countOf(isMega, list) >= MAX_MEGAS) return false;
    if (isGmax(k) && countOf(isGmax, list) >= MAX_GMAX) return false;
    if (isLeg(k) && countOf(isLeg, list) >= MAX_LEGS) return false;
    if (isMyth(k) && countOf(isMyth, list) >= MAX_MYTHS) return false;
    return true;
  };
  const canAdd = (k) => team.includes(k) || canAddTo(k, team);
  const trimIllegal = (list) => {
    const keep = [];
    for (const k of list) if (canAddTo(k, keep)) keep.push(k);
    return keep;
  };
  const rollTeam = (size = 6, ok = pickable) => {
    const pool = DEX_ORDER.filter(ok);
    const out = [];
    for (let n = 0; n < 5000 && out.length < size; n++) {
      const k = pool[randInt(0, pool.length - 1)];
      if (canAddTo(k, out)) out.push(k);
    }
    return out;
  };
  const strongPick = (k) => pickable(k) && DEX[k].base.reduce((a, b) => a + b) >= 480;
  const PLAYER_ITEMS = () => ({ 'HYPER POTION': 3, 'FULL RESTORE': 2, 'FULL HEAL': 3, 'REVIVE': 2, 'X ATTACK': 2, 'X SPECIAL': 2, 'X SPEED': 2 });

  let team = trimIllegal(JSON.parse(localStorage.getItem(TEAM_KEY) || '[]').filter(k => DEX[k]));
  let randomBattle = false, foeTeam = null;
  const beaten = new Set(JSON.parse(localStorage.getItem(BEAT_KEY) || '[]'));
  let level = +(localStorage.getItem(LV_KEY) || 100);
  let gen = 0, typeFilter = '', search = '', focus = team[0] || 'CHARIZARD', cat = 'KANTO', chosen = null;
  const persist = () => {
    localStorage.setItem(TEAM_KEY, JSON.stringify(team));
    localStorage.setItem(BEAT_KEY, JSON.stringify([...beaten]));
    localStorage.setItem(LV_KEY, String(level));
  };
  persist();
  const $$ = (id) => document.getElementById(id);
  const nice = (s) => String(s || '').toLowerCase().replace(/(^|[^a-z0-9'])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const typeBadges = (types) => types.map(t => `<span class="type" style="background:${TYPE_COLORS[t]}">${nice(t)}</span>`).join('');
  const hideAll = () => ['builder', 'opponents', 'bmresult'].forEach(id => { $$(id).classList.add('hidden'); $$(id).innerHTML = ''; });
  const syncTeamHint = () => {
    const h = $$('tbHint');
    if (!h) return;
    const mc = megaCount(), gc = gmaxCount(), lc = countOf(isLeg), yc = countOf(isMyth);
    const chip = (cls, label, n, max) => `<span class="lim ${cls}"><b>${label}</b> ${n}/${max}</span>`;
    h.innerHTML = chip('mega', 'Mega', mc, MAX_MEGAS) + chip('gmax', 'G-Max', gc, MAX_GMAX) + chip('leg', 'Legend', lc, MAX_LEGS) + chip('myth', 'Mythic', yc, MAX_MYTHS);
  };

  function pickRandomTeam() {
    team = rollTeam(6, pickable);
    focus = team[0] || focus;
  }

  function leaveRandom() {
    randomBattle = false;
    foeTeam = null;
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
          <div class="rand-title">Random mode</div>
          <div class="rand-sub">Any generation, any type, randomized teams</div>
          <div class="rand-block">
            <div class="rand-label">Your team</div>
            <div class="rand-sprites">${team.map(k => `<img src="${spritePathFor(DEX[k])}" title="${DEX[k].name}">`).join('')}</div>
          </div>
          <div class="rand-vs">VS</div>
          <div class="rand-block foe">
            <div class="rand-label">${t.title} ${t.name}</div>
            <img class="rand-trainer" src="assets/trainers/${t.sprite}.png" alt="">
            <div class="rand-sprites">${(foeTeam || t.team).map(k => `<img src="${spritePathFor(DEX[k])}">`).join('')}</div>
          </div>
          <div class="rand-go btn go big" id="randGo">Battle</div>
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
    const t = TRAINERS.find(x => x.id === chosen);
    foeTeam = rollTeam(t?.team.length || 6, strongPick);
    randomBattle = true;
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
      else if (gen === GMAX_TAB) { if (!d.gmax) return false; }
      else if (gen && d.gen !== gen) return false;
      if (typeFilter && !d.types.includes(typeFilter)) return false;
      if (q && !d.name.includes(q) && String(d.id) !== q && !(d.mega && q.includes('MEGA')) && !(d.gmax && (q.includes('GMAX') || q.includes('G-MAX')))) return false;
      return true;
    });
  }

  function detailHTML(k) {
    const d = DEX[k];
    const labels = ['HP', 'ATK', 'DEF', 'SPA', 'SPD', 'SPE'];
    const bst = d.base.reduce((a, b) => a + b, 0);
    return `<div class="bd-top"><img src="${spritePathFor(d)}"><div>
        <div class="bd-name">#${String(d.id).padStart(d.id >= 10000 ? 5 : 3, '0')} ${nice(d.name)}${d.mega ? ' <span class="mega">Mega</span>' : ''}${d.gmax ? ' <span class="gmax">G-Max</span>' : ''}${d.leg === 2 ? ' <span class="myth">Mythic</span>' : d.leg ? ' <span class="leg">Legend</span>' : ''}</div>
        <div class="types">${typeBadges(d.types)}</div><div class="bd-ab">Ability · ${nice(d.ability)}</div></div></div>
      <div class="bd-stats">${d.base.map((v, i) => `<div class="bd-stat"><span>${labels[i]}</span><b>${v}</b><div class="bar"><div style="width:${Math.min(100, v / 1.8)}%;background:${v >= 110 ? '#40d080' : v >= 75 ? '#e8d040' : '#e87040'}"></div></div></div>`).join('')}
        <div class="bd-stat bst"><span>TOTAL</span><b>${bst}</b></div></div>
      <div class="bd-moves">${d.set.map(id => { const m = MOVES[id]; return `<div class="bd-move"><span class="type" style="background:${TYPE_COLORS[m.type] || '#888'}">${nice(m.type)}</span><span class="bd-mv">${nice(m.name)}</span><i>${m.cat === 'X' ? 'Status' : m.power}</i></div>`; }).join('')}</div>`;
  }

  function renderTeam() {
    const slots = [];
    for (let i = 0; i < 6; i++) {
      const k = team[i];
      slots.push(k ? `<div class="tb-slot" data-i="${i}"><img src="${spritePathFor(DEX[k])}"><div class="tb-sname">${nice(DEX[k].name)}</div><span class="tb-x">×</span></div>`
        : `<div class="tb-slot empty">Empty</div>`);
    }
    $$('tbTeam').innerHTML = slots.join('');
    $$('tbTeam').querySelectorAll('.tb-slot[data-i]').forEach(n => {
      n.onclick = () => { team.splice(+n.dataset.i, 1); SFX.play('back'); persist(); renderTeam(); renderGrid(); };
      n.onmouseenter = () => { focus = team[+n.dataset.i]; $$('tbDetail').innerHTML = detailHTML(focus); };
    });
    $$('tbCount').textContent = `${team.length} / 6`;
    $$('tbNext').classList.toggle('off', team.length === 0);
    syncTeamHint();
  }

  function renderGrid() {
    const list = filtered();
    const grid = $$('tbGrid');
    grid.innerHTML = list.map(k => {
      const d = DEX[k];
      const locked = !team.includes(k) && !canAddTo(k, team);
      const rare = d.leg === 2 ? 'myth' : d.leg ? 'leg' : '';
      const tag = d.mega ? 'MEGA' : d.gmax ? 'G-MAX' : '#' + d.id;
      return `<div class="tb-card ${team.includes(k) ? 'in' : ''} ${rare} ${d.mega ? 'mega' : ''} ${d.gmax ? 'gmax' : ''} ${locked ? 'mega-lock' : ''}" data-k="${k}"><img loading="lazy" src="${spritePathFor(d)}"><div class="tb-num">${tag}</div><div class="tb-name">${nice(d.name)}</div></div>`;
    }).join('') || '<div class="tb-none">No Pokémon match that search.</div>';
    $$('tbFound').textContent = `${list.length} Pokémon`;
    grid.onclick = (e) => {
      const c = e.target.closest('.tb-card'); if (!c) return;
      const k = c.dataset.k;
      const i = team.indexOf(k);
      if (i >= 0) { team.splice(i, 1); SFX.play('back'); }
      else if (!canAdd(k)) { SFX.play('error'); renderGrid(); return; }
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
      <div class="bm-head">
        <div class="bm-brand">
          <div class="bm-kicker">Battle Mode</div>
          <div class="bm-title">Build your team</div>
        </div>
        <div class="bm-btns">
          <div class="btn rand-mode" id="tbRandMode">Random mode</div>
          <div class="btn" id="tbRandom">Random team</div>
          <div class="btn" id="tbClear">Clear</div>
          <div class="btn go" id="tbNext">Next</div>
        </div>
      </div>
      <div class="tb-body">
        <div class="tb-left">
          <div class="tb-filters">
            <div class="tb-gens">${['ALL', ...ROMAN, 'MEGA', 'G-MAX'].map((r, i) => {
              const cls = r === 'MEGA' ? 'megatab' : r === 'G-MAX' ? 'gmaxtab' : '';
              const label = !i ? 'All' : r === 'MEGA' ? 'Mega' : r === 'G-MAX' ? 'G-Max' : r;
              return `<div class="tab ${cls} ${i === gen ? 'on' : ''}" data-g="${i}">${label}</div>`;
            }).join('')}</div>
            <div class="tb-row"><input id="tbSearch" placeholder="Search Pokémon" value="${search}" autocomplete="off">
              <select id="tbType"><option value="">All types</option>${TYPES.map(t => `<option value="${t}" ${t === typeFilter ? 'selected' : ''}>${t.charAt(0) + t.slice(1).toLowerCase()}</option>`).join('')}</select>
              <span id="tbFound"></span></div>
          </div>
          <div class="tb-grid" id="tbGrid"></div>
        </div>
        <div class="tb-right">
          <div class="tb-label"><span>Your team</span><span class="tb-count" id="tbCount"></span></div>
          <div class="tb-limits" id="tbHint"></div>
          <div class="tb-team" id="tbTeam"></div>
          <div class="tb-detail" id="tbDetail"></div>
        </div>
      </div>`;
    root.classList.remove('hidden');
    root.querySelectorAll('.tb-gens .tab').forEach(t => t.onclick = () => {
      gen = +t.dataset.g; SFX.play('blip');
      root.querySelectorAll('.tb-gens .tab').forEach(x => x.classList.toggle('on', x === t));
      syncTeamHint(); renderGrid(); $$('tbGrid').scrollTop = 0;
    });
    syncTeamHint();
    $$('tbSearch').oninput = (e) => { search = e.target.value; renderGrid(); };
    $$('tbType').onchange = (e) => { typeFilter = e.target.value; renderGrid(); };
    $$('tbRandMode').onclick = () => { SFX.play('select'); startRandomMode(); };
    $$('tbRandom').onclick = () => {
      team = rollTeam(6, strongPick);
      focus = team[0] || focus;
      SFX.play('select'); persist(); renderTeam(); renderGrid();
      if (focus) $$('tbDetail').innerHTML = detailHTML(focus);
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
      <div class="op-name">${nice(t.name)}</div><div class="op-title">${nice(t.title)}</div>
      <div class="op-type">${t.type === 'MIXED' || t.type === 'LEGEND' ? `<span class="type" style="background:${t.type === 'LEGEND' ? '#c89020' : '#707888'}">${t.type}</span>` : typeBadges([t.type])}</div>
      <div class="op-team">${t.team.map(k => `<img loading="lazy" src="${spritePathFor(DEX[k])}">`).join('')}</div></div>`;
  }

  function renderOpponents() {
    const list = TRAINERS.filter(t => t.cat === cat);
    $$('opGrid').innerHTML = list.map(trainerCard).join('');
    $$('opGrid').querySelectorAll('.op-card').forEach(n => {
      n.onclick = () => { chosen = n.dataset.id; SFX.play('blip'); renderOpponents(); renderChosen(); };
      n.ondblclick = () => { chosen = n.dataset.id; leaveRandom(); startBattle(); };
    });
    $$('opTabs').querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.c === cat));
  }

  function renderChosen() {
    const t = TRAINERS.find(x => x.id === chosen);
    $$('opBar').innerHTML = t
      ? `<div class="op-quote"><b>${nice(t.title)} ${nice(t.name)}:</b> "${t.quote.replace('\n', ' ')}"${t.cat === 'LEGENDS' ? ' <span class="leg">Overpowered</span>' : ''}</div><div class="btn go big" id="opFight">Battle</div>`
      : '<div class="op-quote">Pick an opponent. Beaten trainers get a star.</div>';
    if (t) $$('opFight').onclick = () => { leaveRandom(); startBattle(); };
  }

  function openOpponents() {
    hideAll();
    const root = $$('opponents');
    const done = TRAINERS.filter(t => beaten.has(t.id)).length;
    root.innerHTML = `
      <div class="bm-head">
        <div class="bm-brand">
          <div class="bm-kicker">Battle Mode</div>
          <div class="bm-title">Choose opponent <span class="bm-sub">${done}/${TRAINERS.length} beaten</span></div>
        </div>
        <div class="bm-btns">
          <div class="btn" id="opBack">Back</div>
          <div class="btn rand-mode" id="opRandMode">Random mode</div>
          <div class="lvl"><span>Lv</span><div class="tab ${level === 50 ? 'on' : ''}" data-l="50">50</div><div class="tab ${level === 100 ? 'on' : ''}" data-l="100">100</div></div>
        </div>
      </div>
      <div class="op-mine">${team.map(k => `<img src="${spritePathFor(DEX[k])}" title="${DEX[k].name}">`).join('')}</div>
      <div class="op-tabs" id="opTabs">${TRAINER_CATS.map(c => `<div class="tab ${c === 'LEGENDS' ? 'legtab' : ''}" data-c="${c}">${nice(c)}</div>`).join('')}</div>
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
    Input.set((k) => { if (k === 'B') $$('opBack').onclick(); if (k === 'A' && chosen) { leaveRandom(); startBattle(); } });
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
    const roster = (randomBattle && foeTeam?.length) ? foeTeam : t.team;
    const foe = roster.map(k => new Mon({ species: k, level, set: true, ev: t.ev || 85 }, 'foe'));
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
    UI.hideChrome && UI.hideChrome();
    const opts = [
      ['REMATCH', () => startBattle()],
      ['RANDOM AGAIN', () => startRandomMode()],
      ['NEW OPPONENT', () => { leaveRandom(); openOpponents(); }],
      ['EDIT TEAM', () => { leaveRandom(); openBuilder(); }],
    ];
    let c = 0;
    let locked = false;
    root.innerHTML = `<div class="res-home btn" id="resHome" role="button">Home</div>
        <div class="res-title ${won ? 'win' : 'lose'}">${won ? 'VICTORY!' : 'DEFEAT...'}</div>
        <img class="res-trainer" src="assets/trainers/${t.sprite}.png">
        <div class="res-sub">${won ? `You defeated ${t.title} ${t.name}!` : `${t.title} ${t.name} was too strong...`}</div>
        <div class="res-opts">${opts.map(([n], i) => `<div class="res-btn2 ${i === c ? 'sel' : ''}" data-i="${i}" role="button">${n}</div>`).join('')}</div>`;
    const paint = () => {
      root.querySelectorAll('.res-btn2').forEach((n, i) => n.classList.toggle('sel', i === c));
    };
    const goHome = () => {
      if (locked) return;
      locked = true;
      Input.clear();
      SFX.play('back');
      root.classList.add('hidden');
      leaveRandom();
      openBuilder();
    };
    const go = (i) => {
      if (locked || i < 0 || i >= opts.length) return;
      locked = true;
      Input.clear();
      SFX.play('select');
      root.classList.add('hidden');
      opts[i][1]();
    };
    root.onclick = (e) => {
      if (e.target.closest('#resHome')) { goHome(); return; }
      const btn = e.target.closest('.res-btn2');
      if (btn) go(+btn.dataset.i);
    };
    root.onpointerover = (e) => {
      const btn = e.target.closest('.res-btn2');
      if (!btn) return;
      const i = +btn.dataset.i;
      if (i === c) return;
      c = i;
      paint();
    };
    root.classList.remove('hidden');
    UI.fade(false, 400);
    Input.set((k) => {
      if (k === 'B') { goHome(); return; }
      if (k === 'L' || k === 'U') { c = (c + opts.length - 1) % opts.length; SFX.play('blip'); paint(); }
      if (k === 'R' || k === 'D') { c = (c + 1) % opts.length; SFX.play('blip'); paint(); }
      if (k === 'A') go(c);
    });
  }

  async function open() {
    await UI.fade(false, 300);
    openBuilder();
  }

  return { open };
})();
