const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const stageMult = (s) => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
const accMult = (s) => s >= 0 ? (3 + s) / 3 : 3 / (3 - s);
const CRIT_CHANCE = [1 / 16, 1 / 8, 1 / 2, 1];
const STAT_KEYS = ['atk', 'def', 'spa', 'spd', 'spe'];

function movesForLevel(sp, level) {
  const out = [];
  for (const [l, m] of sp.lv) {
    if (l > level) break;
    const i = out.indexOf(m);
    if (i >= 0) out.splice(i, 1);
    out.push(m);
  }
  const res = out.slice(-4);
  return res.length ? res : [sp.set[0] || 'TACKLE'];
}

function rollGender(sp) {
  if (sp.gender < 0) return 'N';
  return Math.random() * 8 < sp.gender ? 'F' : 'M';
}

class Mon {
  // spec: { species, level, gender?, moves?, set?, ivs?, ev?, exp?, hp?, status?, pp? }
  constructor(spec, sideKey = 'player') {
    this.key = spec.species;
    this.species = DEX[spec.species];
    this.level = spec.level;
    this.gender = spec.gender || rollGender(this.species);
    this.ivs = spec.ivs || [31, 31, 31, 31, 31, 31];
    this.ev = spec.ev !== undefined ? spec.ev : 85;
    this.sideKey = sideKey;
    const ids = spec.moves || (spec.set ? this.species.set : movesForLevel(this.species, this.level));
    this.moves = ids.filter(id => MOVES[id]).map(id => ({ id, ...MOVES[id], ppLeft: MOVES[id].pp }));
    if (spec.pp) spec.pp.forEach((p, i) => { if (this.moves[i]) this.moves[i].ppLeft = Math.min(p, this.moves[i].pp); });
    this.applySpecies();
    this.exp = spec.exp !== undefined ? spec.exp : expForLevel(this.species.growth, this.level);
    this.calcStats();
    this.hp = spec.hp !== undefined ? clamp(spec.hp, 0, this.maxhp) : this.maxhp;
    this.status = spec.status || null;
    this.sleepTurns = spec.status === 'slp' ? 2 : 0;
    this.toxicN = 0;
    this.facedBy = new Set();
    this.faintHandled = this.hp <= 0;
    this.resetVolatile();
  }
  applySpecies() {
    this.name = this.species.name;
    this.types = [...this.species.types];
    this.ability = this.species.ability;
  }
  calcStats() {
    const b = this.species.base, L = this.level, e = Math.floor(this.ev / 4);
    const f = (i) => Math.floor((2 * b[i] + this.ivs[i] + e) * L / 100);
    this.maxhp = this.species.base[0] === 1 ? 1 : f(0) + L + 10;
    this.stats = { atk: f(1) + 5, def: f(2) + 5, spa: f(3) + 5, spd: f(4) + 5, spe: f(5) + 5 };
  }
  evolveTo(key) {
    const lost = this.maxhp - this.hp;
    this.key = key;
    this.species = DEX[key];
    this.applySpecies();
    this.calcStats();
    this.hp = Math.max(this.hp > 0 ? 1 : 0, this.maxhp - lost);
  }
  heal() {
    this.hp = this.maxhp; this.status = null; this.faintHandled = false;
    this.moves.forEach(m => { m.ppLeft = m.pp; });
  }
  resetVolatile() {
    this.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
    this.confused = 0;
    this.seeded = false;
    this.mustRecharge = false;
    this.charging = null;
    this.protectChain = 0;
    this.protecting = false;
    this.flinched = false;
    this.moved = false;
    this.flashFire = false;
    if (this.status === 'tox') this.toxicN = 1;
  }
  toJSON() {
    return { species: this.key, level: this.level, gender: this.gender, ivs: this.ivs, ev: this.ev, exp: this.exp,
      hp: this.hp, status: this.status, moves: this.moves.map(m => m.id), pp: this.moves.map(m => m.ppLeft) };
  }
}

const Battle = (() => {
  const S = {};
  let weather = null, weatherTurns = 0, cfg = {};
  const say = (t, o) => UI.say(t, o);
  const other = (sk) => sk === 'player' ? 'foe' : 'player';
  const active = (sk) => S[sk].party[S[sk].active];
  const nm = (m) => m.sideKey === 'foe' ? `${S.wild ? 'Wild' : 'Foe'} ${m.name}` : m.name;
  const center = (m) => UI.monCenter(m.sideKey);
  const struggle = () => ({ id: 'STRUGGLE', ...MOVES.STRUGGLE, ppLeft: 1 });
  const fxCtx = (move, type) => ({ type: type || move.type, cat: move.cat });

  // ---------------- HP helpers ----------------
  async function damage(mon, amt) {
    const from = mon.hp;
    mon.hp = Math.max(0, mon.hp - amt);
    await UI.animateHP(mon.sideKey, mon, from, mon.hp);
  }
  async function heal(mon, amt) {
    const from = mon.hp;
    mon.hp = Math.min(mon.maxhp, mon.hp + amt);
    await UI.animateHP(mon.sideKey, mon, from, mon.hp);
    return mon.hp - from;
  }

  async function checkFaint(mon) {
    if (mon.hp > 0 || mon.faintHandled) return false;
    mon.faintHandled = true;
    mon.status = null;
    mon.charging = null;
    await UI.faint(mon.sideKey, mon);
    await say(`${nm(mon)}\nfainted!`);
    if (!S.wild || mon.sideKey === 'player') UI.renderBalls(mon.sideKey, S[mon.sideKey].party);
    if (mon.sideKey === 'foe') await awardExp(mon);
    else SFX.setLowHp(false);
    return true;
  }

  async function awardExp(foeMon) {
    if (!cfg.exp) return;
    const P = S.player;
    const parts = [...foeMon.facedBy].map(i => P.party[i]).filter(m => m && m.hp > 0 && m.level < 100);
    if (!parts.length) return;
    const total = Math.floor(Math.floor(foeMon.species.expYield * foeMon.level / 7) * (S.wild ? 1 : 1.5));
    const each = Math.max(1, Math.floor(total / parts.length));
    for (const m of parts) {
      await say(`${m.name} gained\n${each} EXP. Points!`);
      await gainExp(m, each, m === active('player'));
    }
  }

  async function gainExp(mon, amt, isActive) {
    const g = mon.species.growth;
    const target = mon.exp + amt;
    while (true) {
      const lo = expForLevel(g, mon.level), hi = expForLevel(g, mon.level + 1);
      const end = Math.min(target, hi);
      if (isActive) await UI.animateExp((mon.exp - lo) / (hi - lo), (end - lo) / (hi - lo));
      mon.exp = end;
      if (mon.exp >= hi && mon.level < 100) {
        const oldMax = mon.maxhp;
        mon.level++;
        mon.calcStats();
        if (mon.hp > 0) mon.hp += mon.maxhp - oldMax;
        mon.leveled = true;
        SFX.play('levelup');
        if (isActive) { UI.renderBox('player', mon); UI.setExpBar(mon, 0); }
        await say(`${mon.name} grew to\nLv. ${mon.level}!`);
        await learnMovesAt(mon, mon.level);
        if (mon.exp >= target) break;
      } else break;
    }
  }

  async function learnMovesAt(mon, level) {
    for (const [l, id] of mon.species.lv) if (l === level) await tryLearn(mon, id);
  }

  async function tryLearn(mon, id) {
    if (!MOVES[id] || mon.moves.some(m => m.id === id)) return;
    const mv = MOVES[id];
    const fresh = { id, ...mv, ppLeft: mv.pp };
    if (mon.moves.length < 4) {
      mon.moves.push(fresh);
      SFX.play('levelup');
      await say(`${mon.name} learned\n${mv.name}!`);
      return;
    }
    await say(`${mon.name} is trying to\nlearn ${mv.name}.`);
    await say(`But ${mon.name} can't learn\nmore than four moves.`);
    await say(`Delete a move to make\nroom for ${mv.name}?`, { auto: 1 });
    if (await UI.yesNo()) {
      UI.setText(`Which move should be\nforgotten?`);
      const i = await UI.choice([...mon.moves.map(m => m.name), 'CANCEL']);
      if (i >= 0 && i < mon.moves.length) {
        const old = mon.moves[i].name;
        mon.moves[i] = fresh;
        await say('1, 2, and... ... Poof!');
        await say(`${mon.name} forgot ${old}.`);
        SFX.play('levelup');
        await say(`And... ${mon.name}\nlearned ${mv.name}!`);
        return;
      }
    }
    await say(`${mon.name} did not learn\n${mv.name}.`);
  }

  // ---------------- stats / status ----------------
  function speedOf(mon) {
    let s = Math.floor(mon.stats.spe * stageMult(mon.stages.spe));
    if (mon.status === 'par') s = Math.floor(s / 2);
    const dbl = { CHLOROPHYLL: 'sun', 'SWIFT SWIM': 'rain', 'SAND RUSH': 'sand', 'SLUSH RUSH': 'hail' }[mon.ability];
    if (dbl && weather === dbl) s *= 2;
    return s;
  }

  async function changeStage(mon, stat, n, source) {
    if (mon.hp <= 0 || !(stat in mon.stages)) return;
    if (n < 0 && source && source !== mon && stat === 'acc' && mon.ability === 'KEEN EYE') {
      await say(`${nm(mon)}'s KEEN EYE\nprevents accuracy loss!`);
      return;
    }
    const cur = mon.stages[stat];
    if (n > 0 && cur >= 6) { await say(`${nm(mon)}'s ${STAT_NAMES[stat]}\nwon't go higher!`); return; }
    if (n < 0 && cur <= -6) { await say(`${nm(mon)}'s ${STAT_NAMES[stat]}\nwon't go lower!`); return; }
    mon.stages[stat] = clamp(cur + n, -6, 6);
    SFX.play(n > 0 ? 'statUp' : 'statDown');
    await FX.play(n > 0 ? 'statUp' : 'statDown', center(mon), center(mon));
    const word = n >= 3 ? 'rose drastically!' : n === 2 ? 'sharply rose!' : n > 0 ? 'rose!' : n <= -2 ? 'harshly fell!' : 'fell!';
    await say(`${nm(mon)}'s ${STAT_NAMES[stat]}\n${word}`);
  }

  async function applyBoosts(mon, boosts, source) {
    for (const [k, v] of Object.entries(boosts)) await changeStage(mon, k, v, source);
  }

  const STATUS_WORD = { par: 'paralyzed', slp: 'asleep', psn: 'poisoned', tox: 'poisoned', brn: 'burned', frz: 'frozen' };

  function cannotInflict(target, status) {
    if (target.status) {
      const same = target.status === status || (['psn', 'tox'].includes(status) && ['psn', 'tox'].includes(target.status));
      return same ? `${nm(target)} is\nalready ${STATUS_WORD[target.status]}!` : 'But it failed!';
    }
    const t = target.types;
    const immune = `It doesn't affect\n${nm(target)}...`;
    if (status === 'brn' && t.includes('FIRE')) return immune;
    if (status === 'par' && t.includes('ELECTRIC')) return immune;
    if ((status === 'psn' || status === 'tox') && (t.includes('POISON') || t.includes('STEEL'))) return immune;
    if (status === 'frz' && (t.includes('ICE') || weather === 'sun')) return 'But it failed!';
    return null;
  }

  const STATUS_FX = { par: 'parSpark', brn: 'burnFlame', psn: 'poisonBubble', tox: 'poisonBubble', slp: 'sleepZ', frz: 'freezeIce' };

  async function inflict(target, status, source, msg) {
    if (target.hp <= 0 || cannotInflict(target, status)) return false;
    target.status = status;
    if (status === 'slp') target.sleepTurns = randInt(2, 4);
    if (status === 'tox') target.toxicN = 1;
    UI.renderBox(target.sideKey, target);
    if (!S.wild || target.sideKey === 'player') UI.renderBalls(target.sideKey, S[target.sideKey].party);
    SFX.play('status');
    await FX.play(STATUS_FX[status], center(target), center(target));
    const text = msg || {
      par: `${nm(target)} is paralyzed!\nIt may be unable to move!`,
      slp: `${nm(target)} fell asleep!`,
      brn: `${nm(target)} was burned!`,
      psn: `${nm(target)} was poisoned!`,
      tox: `${nm(target)} is badly\npoisoned!`,
      frz: `${nm(target)} was\nfrozen solid!`,
    }[status];
    await say(text);
    if (target.ability === 'SYNCHRONIZE' && source && source !== target && ['brn', 'par', 'psn', 'tox'].includes(status) && !cannotInflict(source, status)) {
      await say(`${nm(target)}'s SYNCHRONIZE\npassed the status to ${nm(source)}!`);
      await inflict(source, status, null);
    }
    return true;
  }

  // ---------------- damage ----------------
  const ATE = { PIXILATE: 'FAIRY', REFRIGERATE: 'ICE', AERILATE: 'FLYING' };
  const PINCH = { BLAZE: 'FIRE', TORRENT: 'WATER', OVERGROW: 'GRASS', SWARM: 'BUG' };
  const moveType = (user, move) => (move.type === 'NORMAL' && ATE[user.ability]) ? ATE[user.ability] : move.type;

  function calcDamage(user, target, move, { crit = false, eff = 1, avg = false } = {}) {
    if (move.fixed) return move.fixed === 'level' ? user.level : move.fixed;
    const type = moveType(user, move);
    const special = move.cat === 'S';
    const aKey = special ? 'spa' : 'atk', dKey = special ? 'spd' : 'def';
    let aStage = user.stages[aKey], dStage = target.stages[dKey];
    if (crit) { aStage = Math.max(0, aStage); dStage = Math.min(0, dStage); }
    let A = Math.floor(user.stats[aKey] * stageMult(aStage));
    const D = Math.max(1, Math.floor(target.stats[dKey] * stageMult(dStage)));
    const ab = user.ability;
    if (!special) {
      if (ab === 'HUGE POWER' || ab === 'PURE POWER') A *= 2;
      if (ab === 'HUSTLE') A = Math.floor(A * 1.5);
      if (ab === 'GUTS' && user.status) A = Math.floor(A * 1.5);
    } else if (ab === 'SOLAR POWER' && weather === 'sun') A = Math.floor(A * 1.5);
    if (target.ability === 'THICK FAT' && (type === 'FIRE' || type === 'ICE')) A = Math.floor(A / 2);
    let power = move.power;
    if (PINCH[ab] === type && user.hp <= Math.floor(user.maxhp / 3)) power *= 1.5;
    if (ab === 'TECHNICIAN' && power <= 60) power *= 1.5;
    if (ab === 'IRON FIST' && /PUNCH/.test(move.name)) power *= 1.2;
    if (ab === 'STRONG JAW' && /FANG|BITE|CRUNCH/.test(move.name)) power *= 1.5;
    if (ab === 'MEGA LAUNCHER' && /PULSE|AURA SPHERE/.test(move.name)) power *= 1.5;
    if (ab === 'RECKLESS' && move.recoil) power *= 1.2;
    if (ab === 'SHEER FORCE' && move.sec) power *= 1.3;
    if (ab === 'TOUGH CLAWS' && move.contact) power *= 1.3;
    if (ATE[ab] && move.type === 'NORMAL') power *= 1.2;
    if (user.flashFire && type === 'FIRE') power *= 1.5;
    power = Math.floor(power);
    let base = Math.floor(Math.floor(Math.floor(2 * user.level / 5 + 2) * power * A / D) / 50);
    if (!special && user.status === 'brn' && ab !== 'GUTS') base = Math.floor(base / 2);
    if (weather === 'rain') { if (type === 'WATER') base = Math.floor(base * 1.5); if (type === 'FIRE') base = Math.floor(base / 2); }
    if (weather === 'sun') { if (type === 'FIRE') base = Math.floor(base * 1.5); if (type === 'WATER') base = Math.floor(base / 2); }
    base += 2;
    if (crit) base = Math.floor(base * 1.5);
    if (type !== '???' && user.types.includes(type)) base = Math.floor(base * (ab === 'ADAPTABILITY' ? 2 : 1.5));
    base = Math.floor(base * eff);
    if (eff > 1 && ['FILTER', 'SOLID ROCK', 'PRISM ARMOR'].includes(target.ability)) base = Math.floor(base * 0.75);
    if (target.hp === target.maxhp && ['MULTISCALE', 'SHADOW SHIELD'].includes(target.ability)) base = Math.floor(base / 2);
    base = Math.floor(base * (avg ? 92 : randInt(85, 100)) / 100);
    return Math.max(1, base);
  }

  function hits(user, target, move) {
    if (move.acc == null) return true;
    let acc = move.acc * accMult(clamp(user.stages.acc - target.stages.eva, -6, 6));
    if (user.ability === 'HUSTLE' && move.cat === 'P') acc *= 0.8;
    return Math.random() * 100 < acc;
  }

  // Abilities that nullify a move type. kind: heal | boost stat | fire | none
  const ABSORB = { 'WATER ABSORB': ['WATER', 'heal'], 'DRY SKIN': ['WATER', 'heal'], 'VOLT ABSORB': ['ELECTRIC', 'heal'],
    'FLASH FIRE': ['FIRE', 'fire'], 'SAP SIPPER': ['GRASS', 'atk'], 'MOTOR DRIVE': ['ELECTRIC', 'spe'],
    'LIGHTNING ROD': ['ELECTRIC', 'spa'], 'STORM DRAIN': ['WATER', 'spa'] };

  async function absorbed(user, target, move, type) {
    if (target.ability === 'LEVITATE' && type === 'GROUND' && move.cat !== 'X') {
      await say(`${nm(target)} makes GROUND\nmoves miss with LEVITATE!`); return true;
    }
    const a = ABSORB[target.ability];
    if (!a || a[0] !== type) return false;
    const label = `${nm(target)}'s ${target.ability}`;
    if (a[1] === 'heal') {
      if (target.hp < target.maxhp) { SFX.play('heal'); await heal(target, Math.floor(target.maxhp / 4)); await say(`${label}\nrestored its HP!`); }
      else await say(`${label}\nmade ${move.name} useless!`);
    } else if (a[1] === 'fire') {
      target.flashFire = true; await say(`${label}\nraised its FIRE power!`);
    } else {
      await say(`${label}\nabsorbed the attack!`); await changeStage(target, a[1], 1, target);
    }
    return true;
  }

  const CHARGE_TEXT = { SOLARBEAM: 'took in sunlight!', SOLARBLADE: 'took in sunlight!', FLY: 'flew up high!', DIG: 'dug a hole!',
    DIVE: 'hid underwater!', BOUNCE: 'sprang up!', PHANTOMFORCE: 'vanished instantly!', SHADOWFORCE: 'vanished instantly!',
    SKYATTACK: 'became cloaked\nin a harsh light!', SKULLBASH: 'tucked in its head!', RAZORWIND: 'whipped up a whirlwind!',
    FREEZESHOCK: 'became cloaked\nin a freezing light!', ICEBURN: 'became cloaked\nin freezing air!' };

  function hitCount(user, move) {
    if (!move.multi) return 1;
    if (!Array.isArray(move.multi)) return move.multi;
    if (user.ability === 'SKILL LINK') return move.multi[1];
    const r = Math.random();
    return r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.85 ? 4 : 5;
  }

  // ---------------- executing a move ----------------
  async function executeMove(user, target, move, isLast) {
    user.moved = true;
    if (!move.protect) user.protectChain = 0;

    if (user.status === 'frz') {
      if (Math.random() < 0.2 || move.thaw) { user.status = null; UI.renderBox(user.sideKey, user); await say(`${nm(user)} thawed out!`); }
      else { await FX.play('freezeIce', center(user), center(user)); await say(`${nm(user)} is\nfrozen solid!`); return; }
    }
    if (user.status === 'slp') {
      user.sleepTurns--;
      if (user.sleepTurns <= 0) { user.status = null; UI.renderBox(user.sideKey, user); if (!S.wild || user.sideKey === 'player') UI.renderBalls(user.sideKey, S[user.sideKey].party); await say(`${nm(user)} woke up!`); }
      else { user.charging = null; FX.play('sleepZ', center(user), center(user)); await say(`${nm(user)} is\nfast asleep.`); return; }
    }
    if (user.flinched) { user.charging = null; await say(`${nm(user)} flinched!`); return; }
    if (user.confused > 0) {
      user.confused--;
      if (user.confused === 0) await say(`${nm(user)} snapped\nout of confusion!`);
      else {
        FX.play('confused', center(user), center(user));
        await say(`${nm(user)} is\nconfused!`);
        if (Math.random() < 1 / 3) {
          user.charging = null;
          const d = calcDamage(user, user, { power: 40, type: '???', cat: 'P' });
          SFX.play('hit');
          UI.hitBlink(user.sideKey);
          await damage(user, Math.min(d, user.hp));
          await say('It hurt itself in its\nconfusion!');
          await checkFaint(user);
          return;
        }
      }
    }
    if (user.status === 'par' && Math.random() < 0.25) {
      user.charging = null;
      await FX.play('parSpark', center(user), center(user));
      await say(`${nm(user)} is paralyzed!\nIt can't move!`);
      return;
    }

    const releasing = user.charging && user.charging.id === move.id;
    if (!move.struggle && !releasing) move.ppLeft = Math.max(0, move.ppLeft - 1);

    if (move.charge && !releasing && !(weather === 'sun' && /SOLAR/.test(move.id))) {
      await say(`${nm(user)} used\n${move.name}!`, { auto: 300 });
      user.charging = move;
      SFX.play('move', move.type);
      await FX.play('calmmind', center(user), center(user));
      await say(`${nm(user)} ${CHARGE_TEXT[move.id] || 'is charging up!'}`);
      return;
    }
    user.charging = null;
    await say(`${nm(user)} used\n${move.name}!`, { auto: 300 });

    if (move.target === 'self' || move.target === 'field') return selfMove(user, target, move, isLast);
    if (target.hp <= 0) { await say('But there was no target...'); return; }
    if (target.protecting) { await say(`${nm(target)}\nprotected itself!`); return; }
    const type = moveType(user, move);
    if (move.cat === 'X' && move.typeImmune && typeEffectiveness(type, target.types) === 0) { await say(`It doesn't affect\n${nm(target)}...`); return; }
    if (move.powder && target.types.includes('GRASS')) { await say(`It doesn't affect\n${nm(target)}...`); return; }
    if (await absorbed(user, target, move, type)) return;
    if (!hits(user, target, move)) { await say(`${nm(user)}'s\nattack missed!`); return; }
    if (move.cat === 'X') return statusMove(user, target, move);

    const eff = type === '???' ? 1 : typeEffectiveness(type, target.types);
    if (eff === 0 || (move.fixed && typeEffectiveness(type, target.types) === 0)) { await say(`It doesn't affect\n${nm(target)}...`); return; }
    if (target.ability === 'WONDER GUARD' && eff <= 1 && type !== '???') { await say(`${nm(target)} avoided damage\nwith WONDER GUARD!`); return; }

    const n = hitCount(user, move);
    let total = 0, landed = 0, lastCrit = false;
    const startFull = target.hp === target.maxhp;
    for (let h = 0; h < n && target.hp > 0 && user.hp > 0; h++) {
      const crit = !move.fixed && (move.alwaysCrit || Math.random() < CRIT_CHANCE[move.highCrit ? 1 : 0]);
      let dmg = Math.min(calcDamage(user, target, move, { crit, eff: move.fixed ? 1 : eff }), target.hp);
      let endured = false;
      if (target.ability === 'STURDY' && startFull && h === 0 && dmg >= target.hp) { dmg = target.hp - 1; endured = true; }
      if (move.contact && h === 0) await UI.lunge(user.sideKey);
      SFX.play('move', move.recharge ? 'BEAM' : type);
      await FX.play(move.fx, center(user), center(target), fxCtx(move, type));
      SFX.play(eff > 1 ? 'hitSuper' : eff < 1 ? 'hitWeak' : 'hit');
      UI.hitBlink(target.sideKey);
      await damage(target, dmg);
      total += dmg; landed++; lastCrit = crit;
      if (crit) await say('A critical hit!');
      if (endured) await say(`${nm(target)} endured\nthe hit with STURDY!`);
    }
    if (!move.fixed) {
      if (eff > 1) await say("It's super effective!");
      else if (eff < 1) await say("It's not very\neffective...");
    }
    if (n > 1) await say(`Hit ${landed} time(s)!`);

    if (type === 'FIRE' && target.status === 'frz' && target.hp > 0) {
      target.status = null; UI.renderBox(target.sideKey, target); await say(`${nm(target)} thawed out!`);
    }

    if (target.hp > 0 && user.ability !== 'SHEER FORCE') {
      for (const s of move.sec || []) {
        const chance = s.chance * (user.ability === 'SERENE GRACE' ? 2 : 1);
        if (Math.random() * 100 >= chance) continue;
        if (s.status) await inflict(target, s.status, user);
        if (s.boosts) await applyBoosts(target, s.boosts, user);
        if (s.flinch && !target.moved) target.flinched = true;
        if (s.confuse && !target.confused) { target.confused = randInt(2, 5); await FX.play('confused', center(target), center(target)); await say(`${nm(target)} became\nconfused!`); }
      }
    }
    if (user.hp > 0 && user.ability !== 'SHEER FORCE') for (const s of move.sec || []) {
      if (s.selfBoosts && Math.random() * 100 < s.chance * (user.ability === 'SERENE GRACE' ? 2 : 1)) await applyBoosts(user, s.selfBoosts, user);
    }
    if (target.hp > 0 && move.contact && user.hp > 0 && !user.status && Math.random() < 0.3) {
      const cs = { STATIC: 'par', 'FLAME BODY': 'brn', 'POISON POINT': 'psn', 'EFFECT SPORE': ['psn', 'par', 'slp'][randInt(0, 2)] }[target.ability];
      if (cs && !cannotInflict(user, cs)) await inflict(user, cs, null, `${nm(target)}'s ${target.ability}\naffected ${nm(user)}!`);
    }
    const koed = await checkFaint(target);
    if (koed && user.ability === 'BEAST BOOST' && user.hp > 0) {
      const best = STAT_KEYS.reduce((a, k) => user.stats[k] > user.stats[a] ? k : a, 'atk');
      await changeStage(user, best, 1, user);
    }

    if (move.drain && total > 0 && user.hp > 0 && user.hp < user.maxhp) {
      SFX.play('heal');
      await heal(user, Math.max(1, Math.floor(total * move.drain)));
      await say(`${nm(target)} had its\nenergy drained!`);
    }
    if (move.recoil && total > 0 && user.hp > 0 && (move.struggle || (user.ability !== 'ROCK HEAD' && user.ability !== 'MAGIC GUARD'))) {
      await damage(user, Math.max(1, Math.floor(move.struggle ? user.maxhp / 4 : total * move.recoil)));
      await say(`${nm(user)} is hit\nwith recoil!`);
    }
    if (move.selfBoosts && user.hp > 0) await applyBoosts(user, move.selfBoosts, user);
    if (move.recharge) user.mustRecharge = true;
    void lastCrit;
    await checkFaint(user);
  }

  const WEATHER_TXT = {
    rain: ['It started to rain!', 'Rain continues to fall.', 'The rain stopped.'],
    sun: ['The sunlight turned\nharsh!', 'The sunlight is strong.', 'The sunlight faded.'],
    sand: ['A sandstorm kicked up!', 'The sandstorm rages.', 'The sandstorm subsided.'],
    hail: ['It started to hail!', 'Hail continues to fall.', 'The hail stopped.'],
  };

  async function selfMove(user, target, move, isLast) {
    const c = center(user);
    SFX.play('move', move.type);
    if (move.protect) {
      const chance = 1 / 3 ** user.protectChain;
      if (isLast || Math.random() >= chance) { user.protectChain = 0; await say('But it failed!'); return; }
      user.protectChain++;
      user.protecting = true;
      await FX.play('protect', c, c);
      await say(`${nm(user)} protected\nitself!`);
      return;
    }
    if (move.weather) {
      if (weather === move.weather) { await say('But it failed!'); return; }
      await FX.play(move.fx, c, c);
      setWeather(move.weather, 5);
      await say(WEATHER_TXT[move.weather][0]);
      return;
    }
    if (move.heal) {
      if (user.hp >= user.maxhp) { await say(`${nm(user)}'s HP is full!`); return; }
      await FX.play('heal', c, c);
      SFX.play('heal');
      await heal(user, Math.floor(user.maxhp * move.heal));
      await say(`${nm(user)} regained\nhealth!`);
      return;
    }
    if (move.rest) {
      if (user.hp >= user.maxhp || user.status === 'slp') { await say('But it failed!'); return; }
      await FX.play('rest', c, c);
      user.status = 'slp';
      user.sleepTurns = 3;
      UI.renderBox(user.sideKey, user);
      if (!S.wild || user.sideKey === 'player') UI.renderBalls(user.sideKey, S[user.sideKey].party);
      SFX.play('heal');
      await heal(user, user.maxhp);
      await say(`${nm(user)} slept and\nbecame healthy!`);
      return;
    }
    if (move.boosts) {
      await FX.play(move.fx, c, c, fxCtx(move));
      await applyBoosts(user, move.boosts, user);
    }
  }

  async function statusMove(user, target, move) {
    SFX.play('move', move.type);
    let did = false;
    if (move.boosts) {
      await FX.play(move.fx, center(user), center(target), fxCtx(move));
      await applyBoosts(target, move.boosts, user);
      did = true;
    }
    if (move.status) {
      const why = cannotInflict(target, move.status);
      if (why) { if (!did) await say(why); }
      else { if (!did) await FX.play(move.fx, center(user), center(target), fxCtx(move)); await inflict(target, move.status, user); }
      did = true;
    }
    if (move.confuse) {
      if (target.confused > 0) { if (!did) await say(`${nm(target)} is\nalready confused!`); }
      else {
        if (!did) await FX.play(move.fx, center(user), center(target), fxCtx(move));
        target.confused = randInt(2, 5);
        await FX.play('confused', center(target), center(target));
        await say(`${nm(target)} became\nconfused!`);
      }
      did = true;
    }
    if (move.leechSeed) {
      if (target.types.includes('GRASS')) { await say(`It doesn't affect\n${nm(target)}...`); return; }
      if (target.seeded) { await say(`${nm(target)} is\nalready seeded!`); return; }
      await FX.play(move.fx, center(user), center(target));
      target.seeded = true;
      await say(`${nm(target)} was seeded!`);
    }
  }

  function setWeather(w, turns) {
    weather = w; weatherTurns = turns;
    FX.setWeather(w);
  }

  // ---------------- switching / items ----------------
  async function sendOut(sk, idx) {
    const side = S[sk];
    side.active = idx;
    const mon = side.party[idx];
    mon.resetVolatile();
    mon.faintHandled = false;
    if (sk === 'player' || !S.wild) {
      const text = sk === 'player' ? `Go! ${mon.name}!` : `${side.trainer} sent\nout ${mon.name}!`;
      await say(text, { auto: 1 });
      if (!side.out) await UI.trainerSlide(sk, false);
      await UI.sendOut(sk, mon);
    }
    side.out = true;
    const opp = active(other(sk));
    if (sk === 'player') { if (opp.hp > 0) opp.facedBy.add(idx); }
    else if (S.player.out && opp.hp > 0) mon.facedBy.add(S.player.active);
    if (!S.wild || sk === 'player') UI.renderBalls(sk, side.party);
    await onEntry(mon, opp, sk);
  }

  async function onEntry(mon, opp, sk) {
    if (mon.ability === 'INTIMIDATE' && S[other(sk)].out && opp.hp > 0) {
      await say(`${nm(mon)}'s INTIMIDATE\ncuts ${nm(opp)}'s ATTACK!`, { auto: 500 });
      if (opp.stages.atk > -6) {
        opp.stages.atk--;
        SFX.play('statDown');
        await FX.play('statDown', center(opp), center(opp));
      }
    }
    const w = { DROUGHT: 'sun', DRIZZLE: 'rain', 'SAND STREAM': 'sand', 'SNOW WARNING': 'hail' }[mon.ability];
    if (w && weather !== w) {
      setWeather(w, 5);
      await say(`${nm(mon)}'s ${mon.ability}!\n${WEATHER_TXT[w][0].replace('\n', ' ')}`);
    }
    if (mon.ability === 'PRESSURE') await say(`${nm(mon)} is exerting\nits PRESSURE!`, { auto: 500 });
  }

  async function withdraw(sk) {
    const side = S[sk], mon = active(sk);
    await say(sk === 'player' ? `${mon.name}, that's enough!\nCome back!` : `${side.trainer} withdrew\n${mon.name}!`, { auto: 250 });
    if (sk === 'player') SFX.setLowHp(false);
    await UI.recall(sk);
    if (mon.ability === 'NATURAL CURE') mon.status = null;
    if (mon.ability === 'REGENERATOR' && mon.hp > 0) mon.hp = Math.min(mon.maxhp, mon.hp + Math.floor(mon.maxhp / 3));
    mon.resetVolatile();
  }

  async function doSwitch(sk, idx) {
    await withdraw(sk);
    await sendOut(sk, idx);
  }

  function itemUsable(def, m, isActive) {
    if (def.kind === 'revive') return m.hp <= 0;
    if (m.hp <= 0) return false;
    if (def.kind === 'heal') return m.hp < m.maxhp;
    if (def.kind === 'full') return m.hp < m.maxhp || !!m.status || (isActive && m.confused > 0);
    if (def.kind === 'cure') return !!m.status || (isActive && m.confused > 0);
    return true;
  }

  // Gen 3 catch formula. Returns number of shakes (4 = caught).
  function catchShakes(mon, ballRate) {
    if (ballRate >= 255) return 4;
    const st = mon.status === 'slp' || mon.status === 'frz' ? 2 : mon.status ? 1.5 : 1;
    const a = Math.floor((3 * mon.maxhp - 2 * mon.hp) * mon.species.catchRate * ballRate / (3 * mon.maxhp) * st);
    if (a >= 255) return 4;
    const b = Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / Math.max(1, a))));
    let n = 0;
    while (n < 4 && randInt(0, 65535) < b) n++;
    return n;
  }

  async function throwBall(act) {
    const P = S.player, def = ITEMS[act.item], foe = active('foe');
    P.items[act.item]--;
    await say(`${P.name} used\n${act.item}!`, { auto: 300 });
    const shakes = catchShakes(foe, def.rate);
    await UI.catchAnim(shakes, act.item);
    if (shakes >= 4) {
      SFX.playMusic('victory');
      await say(`Gotcha!\n${foe.name} was caught!`);
      S.caught = foe;
      return true;
    }
    await say(['Oh, no! The POKéMON\nbroke free!', 'Aww! It appeared to\nbe caught!', 'Aargh!\nAlmost had it!', 'Shoot! It was so\nclose, too!'][shakes]);
    return false;
  }

  async function useItem(sk, act) {
    const side = S[sk];
    const def = ITEMS[act.item];
    if (def.kind === 'ball') return throwBall(act);
    const m = side.party[act.target];
    const isActive = act.target === side.active;
    side.items[act.item]--;
    await say(`${sk === 'player' ? side.name : side.trainer} used\n${act.item}!`, { auto: 350 });
    if (def.kind === 'x') { await changeStage(m, def.stat, 2, null); return; }
    const c = isActive ? center(m) : null;
    if (c) FX.play('heal', c, c);
    SFX.play('heal');
    if (def.kind === 'heal' || def.kind === 'full') {
      const amt = def.kind === 'full' ? m.maxhp - m.hp : Math.min(def.amount, m.maxhp - m.hp);
      if (def.kind === 'full') { m.status = null; if (isActive) m.confused = 0; }
      if (isActive) { UI.renderBox(sk, m); await heal(m, amt); } else m.hp += amt;
      if (amt > 0) await say(`${nm(m)}'s HP was\nrestored by ${amt} point(s).`);
      else await say(`${nm(m)} became healthy!`);
    } else if (def.kind === 'cure') {
      m.status = null; if (isActive) m.confused = 0;
      if (isActive) UI.renderBox(sk, m);
      await say(`${nm(m)} was cured of\nits status problem!`);
    } else if (def.kind === 'revive') {
      m.hp = Math.max(1, Math.floor(m.maxhp * def.frac)); m.faintHandled = false; m.status = null;
      await say(`${nm(m)}'s HP was\nrestored.`);
    }
    if (!S.wild || sk === 'player') UI.renderBalls(sk, side.party);
  }

  // ---------------- player input flows ----------------
  async function partyFlow() {
    const P = S.player;
    while (true) {
      const i = await UI.partyScreen(P.party, { prompt: 'Choose a POKéMON.', canCancel: true, activeIdx: P.active });
      if (i < 0) return null;
      const opt = await UI.subMenu(['SHIFT', 'SUMMARY', 'CANCEL']);
      if (opt === 0) {
        const m = P.party[i];
        if (m.hp <= 0) { await UI.partyMessage(`There's no will to\nfight left!`); continue; }
        if (i === P.active) { await UI.partyMessage(`${m.name} is already\nin battle!`); continue; }
        UI.hideParty();
        return { type: 'switch', idx: i };
      }
      if (opt === 1) await UI.summary(P.party[i]);
    }
  }

  async function forcedChoose() {
    const P = S.player;
    while (true) {
      const i = await UI.partyScreen(P.party, { prompt: 'Choose a POKéMON.', canCancel: false, activeIdx: P.active });
      const opt = await UI.subMenu(['SHIFT', 'SUMMARY']);
      if (opt === 0) {
        if (P.party[i].hp <= 0) { await UI.partyMessage(`There's no will to\nfight left!`); continue; }
        UI.hideParty();
        return i;
      }
      if (opt === 1) await UI.summary(P.party[i]);
    }
  }

  async function bagFlow() {
    const P = S.player;
    while (true) {
      const item = await UI.bagScreen(P.items);
      if (!item) return null;
      const def = ITEMS[item];
      if (def.kind === 'ball') {
        if (!S.wild) { await say("The TRAINER blocked the BALL!\nDon't be a thief!"); continue; }
        if (S.player.party.length >= 6 && S.box === null) { await say('There is no room left\nfor another POKéMON!'); continue; }
        return { type: 'item', item };
      }
      if (def.kind === 'x') return { type: 'item', item, target: P.active };
      const i = await UI.partyScreen(P.party, { prompt: `Use ${item} on which\nPOKéMON?`, canCancel: true, activeIdx: P.active });
      if (i < 0) continue;
      if (!itemUsable(def, P.party[i], i === P.active)) { await UI.partyMessage("It won't have any effect."); UI.hideParty(); continue; }
      UI.hideParty();
      return { type: 'item', item, target: i };
    }
  }

  async function playerChoose() {
    const mon = active('player');
    while (true) {
      const a = await UI.actionMenu(mon);
      if (a === 'fight') {
        if (mon.moves.every(m => m.ppLeft <= 0)) { await say(`${mon.name} has no\nmoves left!`); return { type: 'move', move: struggle() }; }
        const i = await UI.moveMenu(mon);
        if (i < 0) continue;
        if (mon.moves[i].ppLeft <= 0) { await say("There's no PP left for\nthis move!"); continue; }
        return { type: 'move', move: mon.moves[i] };
      }
      if (a === 'bag') { const r = await bagFlow(); if (r) return r; continue; }
      if (a === 'pokemon') { const r = await partyFlow(); if (r) return r; continue; }
      if (a === 'run') {
        if (S.wild) return { type: 'run' };
        await say("No! There's no running\nfrom a TRAINER battle!");
      }
    }
  }

  // ---------------- AI ----------------
  function scoreMove(me, foe, m) {
    if (m.cat !== 'X') {
      const type = moveType(me, m);
      const eff = typeEffectiveness(type, foe.types);
      if (eff === 0) return -100;
      const ab = ABSORB[foe.ability];
      if ((ab && ab[0] === type) || (foe.ability === 'LEVITATE' && type === 'GROUND')) return -80;
      if (foe.ability === 'WONDER GUARD' && eff <= 1) return -90;
      const hitsN = m.multi ? (Array.isArray(m.multi) ? 3 : m.multi) : 1;
      const d = calcDamage(me, foe, m, { eff, avg: true }) * hitsN;
      const acc = m.acc == null ? 1 : m.acc / 100;
      let s = Math.min(1, d / foe.hp) * 100 * acc;
      if (d >= foe.hp) { s += 50; if (m.priority > 0) s += 40; }
      if (m.recharge && d < foe.hp) s -= 35;
      if (m.charge) s -= 25;
      if (m.recoil) s -= 8;
      return s;
    }
    if (m.status) {
      if (m.typeImmune && typeEffectiveness(m.type, foe.types) === 0) return -100;
      if (m.powder && foe.types.includes('GRASS')) return -100;
      if (cannotInflict(foe, m.status)) return -60;
      if (m.status === 'slp') return 58;
      if (m.status === 'brn') return foe.stats.atk > foe.stats.spa ? 52 : 22;
      if (m.status === 'tox') return 45;
      return 40;
    }
    if (m.confuse) return foe.confused ? -50 : 28;
    if (m.leechSeed) return foe.seeded || foe.types.includes('GRASS') ? -50 : 35;
    if (m.heal) return me.hp / me.maxhp < 0.5 ? 75 : -40;
    if (m.rest) return me.hp / me.maxhp < 0.35 ? 60 : -50;
    if (m.protect) return 5;
    if (m.weather) return weather === m.weather ? -50 : 15;
    if (m.boosts) {
      if (m.target === 'foe') { const [k] = Object.keys(m.boosts); return foe.stages[k] > -2 ? 22 : -20; }
      const top = Math.max(...Object.keys(m.boosts).map(k => me.stages[k] || 0));
      return top >= 2 ? -30 : 45 * (me.hp / me.maxhp);
    }
    return 0;
  }

  function aiChoose() {
    const F = S.foe, me = active('foe'), foe = active('player');
    if (F.items['FULL RESTORE'] > 0 && me.hp / me.maxhp < 0.25 && Math.random() < 0.65) return { type: 'item', item: 'FULL RESTORE', target: F.active };
    const usable = me.moves.filter(m => m.ppLeft > 0);
    if (!usable.length) return { type: 'move', move: struggle() };
    const noise = S.wild ? 70 : 18;
    let best = usable[0], bs = -1e9;
    for (const m of usable) {
      const s = scoreMove(me, foe, m) + Math.random() * noise;
      if (s > bs) { bs = s; best = m; }
    }
    return { type: 'move', move: best };
  }

  function aiPickReplacement() {
    const F = S.foe, foe = active('player');
    let best = -1, bs = -1e9;
    F.party.forEach((m, i) => {
      if (m.hp <= 0) return;
      const off = Math.max(0, ...m.moves.filter(x => x.cat !== 'X').map(x => typeEffectiveness(x.type, foe.types) * (m.types.includes(x.type) ? 1.5 : 1)));
      const def = Math.max(...foe.types.map(t => typeEffectiveness(t, m.types)));
      const s = off - def * 0.6 + Math.random() * 0.3;
      if (s > bs) { bs = s; best = i; }
    });
    return best;
  }

  // ---------------- turn flow ----------------
  async function endOfTurn() {
    if (weather) {
      weatherTurns--;
      if (weatherTurns <= 0) { const w = weather; setWeather(null, 0); await say(WEATHER_TXT[w][2]); }
      else {
        await say(WEATHER_TXT[weather][1], { auto: 600 });
        if (weather === 'sand' || weather === 'hail') {
          for (const m of ['player', 'foe'].map(active)) {
            if (m.hp <= 0 || m.ability === 'MAGIC GUARD') continue;
            const safe = weather === 'sand' ? ['ROCK', 'GROUND', 'STEEL'] : ['ICE'];
            if (m.types.some(t => safe.includes(t))) continue;
            await damage(m, Math.min(m.hp, Math.max(1, Math.floor(m.maxhp / 16))));
            await say(`${nm(m)} is buffeted\nby the ${weather === 'sand' ? 'sandstorm' : 'hail'}!`);
            await checkFaint(m);
          }
        }
      }
    }
    const order = ['player', 'foe'].map(active).filter(m => m.hp > 0).sort((a, b) => speedOf(b) - speedOf(a));
    for (const mon of order) {
      if (mon.hp <= 0) continue;
      const opp = active(other(mon.sideKey));
      const guard = mon.ability === 'MAGIC GUARD';
      if (mon.seeded && opp.hp > 0 && !guard) {
        const d = Math.min(mon.hp, Math.max(1, Math.floor(mon.maxhp / 8)));
        await FX.play('leech', center(mon), center(opp));
        await damage(mon, d);
        if (opp.hp < opp.maxhp) await heal(opp, d);
        await say(`${nm(mon)}'s health is\nsapped by LEECH SEED!`);
        if (await checkFaint(mon)) continue;
      }
      if ((mon.status === 'brn' || mon.status === 'psn' || mon.status === 'tox') && !guard) {
        let d = Math.max(1, Math.floor(mon.maxhp / (mon.status === 'brn' ? 16 : 8)));
        if (mon.status === 'tox') { d = Math.max(1, Math.floor(mon.maxhp * mon.toxicN / 16)); mon.toxicN++; }
        await FX.play(mon.status === 'brn' ? 'burnFlame' : 'poisonBubble', center(mon), center(mon));
        SFX.play('hitWeak');
        await damage(mon, Math.min(d, mon.hp));
        await say(mon.status === 'brn' ? `${nm(mon)} is hurt\nby its burn!` : `${nm(mon)} is hurt\nby poison!`);
        if (await checkFaint(mon)) continue;
      }
      if (mon.ability === 'SPEED BOOST' && mon.stages.spe < 6) await changeStage(mon, 'spe', 1, mon);
    }
    for (const sk of ['player', 'foe']) { const m = active(sk); m.protecting = false; m.flinched = false; }
  }

  async function handleFaints() {
    const P = S.player, F = S.foe;
    const pOut = P.party.every(m => m.hp <= 0);
    const fOut = F.party.every(m => m.hp <= 0);
    if (pOut) return 'lose';
    if (fOut) return 'win';
    const pm = active('player'), fm = active('foe');
    let next = -1;
    if (fm.hp <= 0) {
      next = aiPickReplacement();
      if (pm.hp > 0 && P.party.filter(m => m.hp > 0).length > 1) {
        await say(`${F.trainer} is about to use\n${F.party[next].name}.`);
        await say(`Will ${P.name} change\nPOKéMON?`, { auto: 1 });
        if (await UI.yesNo()) {
          const r = await partyFlow();
          if (r) await doSwitch('player', r.idx);
        }
      }
    }
    if (pm.hp <= 0) {
      UI.setText('Choose a POKéMON.');
      const idx = await forcedChoose();
      await sendOut('player', idx);
    }
    if (next >= 0) await sendOut('foe', next);
    return null;
  }

  async function tryRun() {
    S.runs++;
    const pm = active('player'), fm = active('foe');
    const ps = speedOf(pm), fs = speedOf(fm);
    const odds = Math.floor(ps * 128 / Math.max(1, fs)) + 30 * S.runs;
    if (ps >= fs || odds > 255 || randInt(0, 255) < odds) {
      SFX.play('recall');
      await say('Got away safely!');
      return true;
    }
    await say("Can't escape!");
    return false;
  }

  async function turn() {
    const pm = active('player'), fm = active('foe');
    const forced = (m) => m.mustRecharge ? { type: 'recharge' } : m.charging ? { type: 'move', move: m.charging } : null;
    const pAct = forced(pm) || await playerChoose();
    const fAct = forced(fm) || aiChoose();
    const acts = [{ sk: 'player', ...pAct }, { sk: 'foe', ...fAct }];

    if (pAct.type === 'run') {
      if (await tryRun()) return 'run';
    }
    for (const a of acts) if (a.type === 'switch') await doSwitch(a.sk, a.idx);
    for (const a of acts) if (a.type === 'item') {
      const caught = await useItem(a.sk, a);
      if (caught === true) return 'caught';
    }

    const moveActs = acts.filter(a => a.type === 'move' || a.type === 'recharge');
    for (const a of moveActs) {
      a.mon = active(a.sk);
      a.pri = a.type === 'move' ? (a.move.priority || 0) : 0;
      a.spe = speedOf(a.mon);
      a.tie = Math.random();
    }
    moveActs.sort((a, b) => b.pri - a.pri || b.spe - a.spe || a.tie - b.tie);
    for (const sk of ['player', 'foe']) active(sk).moved = false;

    for (let i = 0; i < moveActs.length; i++) {
      const a = moveActs[i];
      const user = a.mon;
      if (user.hp <= 0 || user !== active(a.sk)) continue;
      const target = active(other(a.sk));
      if (a.type === 'recharge') {
        user.moved = true;
        user.mustRecharge = false;
        await say(`${nm(user)} must\nrecharge!`);
        continue;
      }
      await executeMove(user, target, a.move, i === moveActs.length - 1 && moveActs.length > 1);
      if (active('player').hp <= 0 || active('foe').hp <= 0) break;
    }

    await endOfTurn();
    return handleFaints();
  }

  // cfg: { wild, player: { name, party, items }, foe: { trainer, party, items, sprite }, bg, intro[], winText[], prize, exp }
  async function run(config) {
    cfg = Object.assign({ exp: true, intro: [], winText: [], prize: 0 }, config);
    weather = null; weatherTurns = 0;
    FX.setWeather(null);
    S.wild = !!cfg.wild;
    S.runs = 0;
    S.caught = null;
    S.box = cfg.hasBox ? [] : null;
    S.player = { name: cfg.player.name || 'RED', party: cfg.player.party, items: cfg.player.items || {}, active: 0, out: false };
    S.foe = { name: cfg.foe.trainer || 'WILD', trainer: cfg.foe.trainer || '', party: cfg.foe.party, items: cfg.foe.items || {}, active: 0, out: false };
    S.player.party.forEach(m => { m.sideKey = 'player'; m.facedBy = new Set(); m.leveled = false; m.resetVolatile(); m.faintHandled = m.hp <= 0; });
    S.foe.party.forEach(m => { m.sideKey = 'foe'; m.facedBy = new Set(); });
    const lead = S.player.party.findIndex(m => m.hp > 0);

    UI.prepareBattle({ bg: cfg.bg, foeSprite: S.wild ? null : cfg.foe.sprite });
    UI.setText('');
    SFX.playMusic(S.wild ? 'wild' : 'battle');
    const fadeIn = UI.fade(false, 700);
    if (S.wild) {
      await Promise.all([UI.trainerSlide('player', true), UI.wildAppear(S.foe.party[0]), fadeIn]);
      UI.renderBalls('player', S.player.party);
      SFX.play('cry', S.foe.party[0].species.id);
      await say(`Wild ${S.foe.party[0].name}\nappeared!`);
      S.foe.out = true;
      await onEntry(S.foe.party[0], S.player.party[lead], 'foe');
    } else {
      await Promise.all([UI.trainerSlide('player', true), UI.trainerSlide('foe', true), fadeIn]);
      UI.renderBalls('foe', S.foe.party);
      UI.renderBalls('player', S.player.party);
      await say(`${S.foe.trainer}\nwould like to battle!`);
      for (const line of cfg.intro) await say(line);
      await sendOut('foe', 0);
    }
    await sendOut('player', lead);

    let result = null;
    while (!result) result = await turn();

    SFX.setLowHp(false);
    if (result === 'win' && !S.wild) {
      SFX.playMusic('victory');
      await say(`${S.player.name} defeated\n${S.foe.trainer}!`);
      for (const line of cfg.winText) await say(line);
      if (cfg.prize) await say(`${S.player.name} got ₽${cfg.prize}\nfor winning!`);
    } else if (result === 'lose') {
      SFX.stopMusic();
      await say(`${S.player.name} is out of\nusable POKéMON!`);
      await say(`${S.player.name} whited out!`);
    }
    await UI.fade(true, 600);
    FX.setWeather(null);
    UI.resetBattle();
    return { result, caught: S.caught };
  }

  // Legacy entry point: the original RED vs BLUE exhibition battle.
  async function start() {
    const party = TEAMS.player.map(s => new Mon(s, 'player'));
    const foe = TEAMS.foe.map(s => new Mon(s, 'foe'));
    const r = await run({ player: { name: 'RED', party, items: { 'HYPER POTION': 3, 'FULL RESTORE': 2 } },
      foe: { trainer: 'RIVAL BLUE', party: foe, items: { 'FULL RESTORE': 2 }, sprite: 'assets/trainers/blue-gen3.png' }, exp: true });
    UI.showResult && UI.showResult(r.result === 'win', r.result === 'win' ? 'You defeated RIVAL BLUE!' : 'RIVAL BLUE was too strong...');
    return r;
  }

  return { run, start, state: S, calcDamage, gainExp, tryLearn, learnMovesAt };
})();
