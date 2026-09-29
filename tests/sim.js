// Headless battle simulation: runs the real engine with a stubbed UI and a random-input bot.
// Usage: node tests/sim.js [battles]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const N = parseInt(process.argv[2] || '200', 10);
const root = path.join(__dirname, '..');
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function makeContext(stats) {
  const log = [];
  let state = null;
  const UI = {
    say: async (t) => { log.push(t.replace(/\n/g, ' ')); },
    setText: () => {}, sendOut: async () => {}, recall: async () => {}, faint: async () => {}, lunge: async () => {},
    wiggle: async () => {}, hitBlink: async () => {}, renderBox: () => {}, animateHP: async () => {}, setHpBar: () => {},
    setExpBar: () => {}, animateExp: async () => {}, renderBalls: () => {}, hideParty: () => {}, summary: async () => {},
    monCenter: () => ({ x: 0, y: 0 }), showMon: () => {}, fade: async () => {}, trainerSlide: async () => {},
    updateStatusVisual: () => {}, partyMessage: async (t) => { log.push('[party] ' + t.replace(/\n/g, ' ')); },
    actionMenu: async () => { const r = process.env.SMART ? 0 : Math.random(); return r < 0.8 ? 'fight' : r < 0.88 ? 'bag' : r < 0.97 ? 'pokemon' : 'run'; },
    moveMenu: async (mon) => {
      if (!process.env.SMART) return Math.random() < 0.05 ? -1 : Math.floor(Math.random() * mon.moves.length);
      const B = vm.runInContext('Battle', ctx), S = B.state, foe = S.foe.party[S.foe.active];
      let best = 0, bs = -1;
      mon.moves.forEach((m, i) => {
        if (!m.power || m.ppLeft <= 0) return;
        const eff = vm.runInContext('typeEffectiveness', ctx)(m.type, foe.types);
        const d = eff ? B.calcDamage(mon, foe, m, { eff, avg: true }) * (m.acc || 100) / 100 : 0;
        if (d > bs) { bs = d; best = i; }
      });
      return best;
    },
    yesNo: async () => Math.random() < 0.5,
    partyScreen: async (party, o) => (o.canCancel && Math.random() < 0.1) ? -1 : Math.floor(Math.random() * party.length),
    subMenu: async (opts) => Math.random() < 0.85 ? 0 : Math.floor(Math.random() * opts.length),
    bagScreen: async (items) => { const k = Object.keys(items).filter(x => items[x] > 0); return Math.random() < 0.15 || !k.length ? null : pick(k); },
    showResult: (won) => { state = won ? 'win' : 'lose'; },
    prepareBattle: () => {}, resetBattle: () => {}, wildAppear: async () => {}, catchAnim: async () => {},
    choice: async (opts) => Math.floor(Math.random() * opts.length),
    el: { textbox: { classList: { add() {}, remove() {} } } },
  };
  const ctx = {
    console, Math, Set, Object, Promise, setTimeout, performance: { now: () => Date.now() },
    wait: async () => {},
    UI, FX: { play: async () => {}, setWeather: () => {}, shake: async () => {}, burst: () => {} },
    SFX: { play: () => {}, playMusic: () => {}, stopMusic: () => {}, setLowHp: () => {}, cry: () => {}, bump: () => {}, step: () => {} },
  };
  vm.createContext(ctx);
  for (const f of ['js/dex.js', 'js/data.js', 'js/trainers.js', 'js/battle.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  return { ctx, log, result: () => state, setResult: (r) => { state = r; } };
}

// Scenario scripts evaluated inside the VM: 0 = Battle Mode trainer, 1 = Story wild encounter, 2 = rival.
const SCENARIOS = [
  `(async () => {
    const t = TRAINERS[Math.floor(Math.random() * TRAINERS.length)];
    const lv = Math.random() < 0.5 ? 50 : 100;
    const pool = DEX_ORDER;
    const party = Array.from({ length: 6 }, () => new Mon({ species: pool[Math.floor(Math.random() * pool.length)], level: lv, set: true, ev: 85 }));
    const foe = t.team.map(k => new Mon({ species: k, level: lv, set: true, ev: t.ev || 85 }, 'foe'));
    const r = await Battle.run({ player: { name: 'RED', party, items: { 'HYPER POTION': 3, 'FULL RESTORE': 2, 'FULL HEAL': 3, 'REVIVE': 2, 'X ATTACK': 2, 'X SPECIAL': 2, 'X SPEED': 2 } },
      foe: { trainer: t.title + ' ' + t.name, party: foe, items: { 'FULL RESTORE': t.items || 2 }, sprite: 'x' }, intro: [t.quote], winText: ['gg'], prize: 100, exp: false });
    return r.result;
  })()`,
  `(async () => {
    const pool = DEX_ORDER;
    const lv = 3 + Math.floor(Math.random() * 40);
    const party = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => new Mon({ species: pool[Math.floor(Math.random() * pool.length)], level: lv, ev: 0 }));
    const foe = new Mon({ species: pool[Math.floor(Math.random() * pool.length)], level: Math.max(2, lv - 2), ev: 0 }, 'foe');
    const r = await Battle.run({ wild: true, hasBox: true, player: { name: 'RED', party, items: { 'POKé BALL': 5, 'GREAT BALL': 2, 'ULTRA BALL': 1, 'POTION': 3 } }, foe: { party: [foe] } });
    if (r.result === 'caught' && !r.caught) throw new Error('caught without mon');
    return r.result === 'caught' || r.result === 'run' ? 'win' : r.result;
  })()`,
  `(async () => {
    const party = [new Mon({ species: 'CHARMANDER', level: 5, ev: 0 })];
    const r = await Battle.run({ player: { name: 'RED', party, items: { 'POTION': 3 } }, foe: { trainer: 'RIVAL BLUE', party: [new Mon({ species: 'SQUIRTLE', level: 5, ev: 0 }, 'foe')], sprite: 'x' }, intro: ['hi'], winText: ['bye'], prize: 300 });
    return r.result;
  })()`,
];

(async () => {
  const stats = { win: 0, lose: 0, errors: 0, turnsMax: 0, msgs: new Map() };
  for (let i = 0; i < N; i++) {
    const { ctx, log, result, setResult } = makeContext(stats);
    try {
      const run = vm.runInContext(SCENARIOS[i % SCENARIOS.length], ctx).then(setResult);
      await Promise.race([run, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout / infinite loop')), 20000))]);
      const r = result();
      if (!r) throw new Error('battle ended without result');
      stats[r]++;
      // invariants
      const S = vm.runInContext('Battle.state', ctx);
      for (const sk of ['player', 'foe']) for (const m of S[sk].party) {
        if (m.hp < 0 || m.hp > m.maxhp) throw new Error(`HP out of range ${m.name} ${m.hp}/${m.maxhp}`);
        for (const mv of m.moves) if (mv.ppLeft < 0) throw new Error('negative PP');
      }
      for (const l of log) {
        const key = l.replace(/Foe |[A-Z]{3,}(?:[ -][A-Z]+)*|\d+/g, '#').slice(0, 60);
        stats.msgs.set(key, (stats.msgs.get(key) || 0) + 1);
      }
      if (log.some(l => /undefined|NaN|null/.test(l))) throw new Error('bad text: ' + log.find(l => /undefined|NaN|null/.test(l)));
    } catch (e) {
      stats.errors++;
      console.log(`Battle ${i} error:`, e.stack || e);
      console.log('  last messages:', log.slice(-8).join(' | '));
      if (stats.errors > 5) break;
    }
  }
  console.log(`battles=${N} win=${stats.win} lose=${stats.lose} errors=${stats.errors}`);
  console.log('distinct message kinds seen:', stats.msgs.size);
  console.log([...stats.msgs.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'));
})();
