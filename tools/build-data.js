// Builds js/dex.js (all 809 Gen 1-7 Pokémon, supported moves, learnsets, default sets) from tools/raw/*.
// Raw sources: Pokémon Showdown pokedex/moves/learnsets, pkmn gen7 random battle sets, PokeAPI species CSVs.
// Usage: node tools/build-data.js
const fs = require('fs');
const path = require('path');
const raw = (f) => path.join(__dirname, 'raw', f);
const pokedex = require(raw('pokedex.json'));
const movesRaw = require(raw('moves.json'));
const learnsets = require(raw('learnsets.json'));
const randbats = require(raw('randbats7.json'));

const toID = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const csv = (f) => {
  const [head, ...rows] = fs.readFileSync(raw(f), 'utf8').trim().split('\n');
  const keys = head.split(',');
  return rows.map(r => Object.fromEntries(r.split(',').map((v, i) => [keys[i], v])));
};
const speciesCsv = new Map(csv('species.csv').map(r => [+r.id, r]));
const pokemonCsv = new Map(csv('pokemon.csv').filter(r => r.is_default === '1').map(r => [+r.species_id, r]));
const GROWTH = { 1: 'slow', 2: 'mf', 3: 'fast', 4: 'ms', 5: 'erratic', 6: 'fluct' };

// ---------------- moves ----------------
const FOE_TARGETS = new Set(['normal', 'any', 'allAdjacentFoes', 'allAdjacent', 'randomNormal', 'adjacentFoe']);
const BLACKLIST = new Set(['eruption', 'waterspout', 'focuspunch', 'fakeout', 'dreameater', 'synchronoise', 'lastresort', 'spitup',
  'naturalgift', 'fling', 'present', 'magnitude', 'trumpcard', 'beatup', 'round', 'echoedvoice', 'furycutter', 'rollout', 'iceball',
  'futuresight', 'doomdesire', 'hiddenpower', 'belch', 'snore', 'sleeptalk', 'steelbeam', 'mindblown', 'shelltrap', 'skydrop', 'bide',
  'uproar', 'rage', 'firstimpression', 'spikecannon', 'selfdestruct', 'explosion', 'geomancy', 'nightmare', 'captivate', 'venomdrench',
  'burnup', 'feint', 'suckerpunch', 'splash', 'celebrate', 'holdhands', 'happyhour', 'teleport', 'lockon', 'mindreader', 'mimic',
  'transform', 'sketch', 'metronome', 'mirrormove', 'assist', 'copycat', 'mefirst', 'naturepower', 'sleeptalk', 'struggle']);
const IGNORABLE_VOLATILES = new Set(['minimize', 'defensecurl']);
const WEATHER = { RainDance: 'rain', raindance: 'rain', SunnyDay: 'sun', sunnyday: 'sun', Sandstorm: 'sand', sandstorm: 'sand', Hail: 'hail', hail: 'hail' };
const HEAL_CALLBACK = new Set(['synthesis', 'morningsun', 'moonlight']);
const PROTECTS = new Set(['protect', 'detect', 'kingsshield', 'spikyshield', 'banefulbunker']);

const FX_OVERRIDE = {
  flamethrower: 'fire', dragonclaw: 'dragonclaw', aerialace: 'slash', swordsdance: 'swords', surf: 'surf', icebeam: 'icebeam',
  raindance: 'raindance', protect: 'protect', razorleaf: 'leaves', sludgebomb: 'sludge', sleeppowder: 'powder_sleep', leechseed: 'seed',
  thunderbolt: 'thunder', quickattack: 'quick', thunderwave: 'twave', doubleteam: 'doubleteam', bodyslam: 'slam', earthquake: 'quake',
  shadowball: 'shadowball', rest: 'rest', confuseray: 'confuseray', doubleedge: 'tackle', sandattack: 'sand', psychic: 'psychic',
  firepunch: 'firepunch', recover: 'heal', calmmind: 'calmmind', rockslide: 'rocks', megahorn: 'horn', takedown: 'tackle',
  hydropump: 'hydropump', dragondance: 'dragondance', hyperbeam: 'hyperbeam', extremespeed: 'quick', crunch: 'bite',
  willowisp: 'wisp', gigadrain: 'drain', stunspore: 'powder_par', eggbomb: 'egg', leafstorm: 'leaves', magicalleaf: 'leaves',
  petalblizzard: 'leaves', petaldance: 'leaves', leafage: 'leaves', energyball: 'orb', blizzard: 'icebeam', fireblast: 'fireblast',
  overheat: 'fireblast', blastburn: 'hyperbeam', hydrocannon: 'hyperbeam', frenzyplant: 'hyperbeam', gigaimpact: 'hyperbeam',
  stoneedge: 'rocks', rockblast: 'rocks', ancientpower: 'rocks', rocktomb: 'rocks', headsmash: 'tackle', thunder: 'thunder',
  hurricane: 'gust', gust: 'gust', airslash: 'gust', aircutter: 'gust', twister: 'gust', bravebird: 'tackle', dazzlinggleam: 'fairy',
  moonblast: 'fairy', playrough: 'fairy', drainingkiss: 'fairy', fairywind: 'fairy', spore: 'powder_sleep', toxic: 'sludge',
  hypnosis: 'psychic', sing: 'sing', lovelykiss: 'fairy', yawn: 'powder_sleep', agility: 'dragondance', nastyplot: 'calmmind',
  quiverdance: 'dragondance', shellsmash: 'swords', bulkup: 'swords', coil: 'swords', workup: 'swords', growth: 'heal',
  roost: 'heal', softboiled: 'heal', slackoff: 'heal', milkdrink: 'heal', moonlight: 'heal', synthesis: 'heal', morningsun: 'heal',
  sunnyday: 'sunnyday', sandstorm: 'sandstorm', hail: 'hailfx', earthpower: 'quake', bulldoze: 'quake', magnitude: 'quake',
  flashcannon: 'beam', dragonpulse: 'beam', darkpulse: 'orb', aurasphere: 'orb', focusblast: 'orb', sludgewave: 'surf',
  muddywater: 'surf', scald: 'hydropump', watergun: 'hydropump', bubblebeam: 'hydropump', bubble: 'hydropump', thunderpunch: 'punch',
  icepunch: 'punch', shadowclaw: 'slash', nightslash: 'slash', xscissor: 'slash', leafblade: 'slash', psychocut: 'slash',
  crosspoison: 'slash', slash: 'slash', cut: 'slash', furyswipes: 'slash', scratch: 'slash', sacredsword: 'slash',
  secretsword: 'slash', smartstrike: 'horn', hornleech: 'horn', drillrun: 'horn', drillpeck: 'horn', peck: 'horn',
  hornattack: 'horn', poisonjab: 'horn', swift: 'star', thunderfang: 'bite', icefang: 'bite', firefang: 'bite',
  poisonfang: 'bite', bite: 'bite', psychicfangs: 'bite', hyperfang: 'bite', superpower: 'punch', closecombat: 'punch',
  hyperspacefury: 'psychic', psystrike: 'psychic', psyshock: 'psychic', zenheadbutt: 'psychic', extrasensory: 'psychic',
  voltswitch: 'thunder', wildcharge: 'thunder', voltTackle: 'thunder', volttackle: 'thunder', boltstrike: 'thunder',
  fusionbolt: 'thunder', fusionflare: 'fireblast', blueflare: 'fireblast', vcreate: 'fireblast', flareblitz: 'firepunch',
  sacredfire: 'fireblast', heatwave: 'fire', lavaplume: 'fire', ember: 'fire', flamewheel: 'firepunch', flamecharge: 'firepunch',
  uturn: 'slash', growl: 'rings', leer: 'rings', screech: 'rings', charm: 'fairy', featherdance: 'gust', scaryface: 'rings',
  metalsound: 'rings', faketears: 'rings', tailwhip: 'rings', stringshot: 'sand', smokescreen: 'sand', flash: 'star',
  supersonic: 'rings', sweetkiss: 'fairy', swagger: 'rings', flatter: 'rings', teeterdance: 'confused', poisonpowder: 'powder_par',
  sleeppowder2: 'powder_sleep', glare: 'twave', nuzzle: 'thunder', zapcannon: 'thunder', discharge: 'thunder', thundershock: 'thunder',
  spark: 'thunder', shockwave: 'thunder', chargebeam: 'beam', signalbeam: 'beam', aurorabeam: 'beam', solarbeam: 'hyperbeam',
  solarblade: 'slash', prismaticlaser: 'hyperbeam', moongeistbeam: 'hyperbeam', sunsteelstrike: 'fireblast', photongeyser: 'hyperbeam',
  roaroftime: 'hyperbeam', spacialrend: 'slash', shadowforce: 'shadowball', phantomforce: 'shadowball', originpulse: 'surf',
  precipiceblades: 'quake', dragonascent: 'tackle', thousandarrows: 'rocks', thousandwaves: 'quake', lightofruin: 'fairy',
  fleurcannon: 'fairy', diamondstorm: 'rocks', steameruption: 'surf', searingshot: 'fireblast', seedflare: 'leaves',
  judgment: 'star', relicsong: 'sing', boomburst: 'rings', hypervoice: 'rings', bugbuzz: 'rings', snarl: 'rings', round2: 'rings',
  dracometeor: 'meteor', outrage: 'dragonclaw', dragonrush: 'dragonclaw', dragontail: 'dragonclaw', dualchop: 'dragonclaw',
  dragonbreath: 'fire', dragonrage: 'fire', clangingscales: 'rings', coreenforcer: 'beam', freezedry: 'icebeam', iceshard: 'icebeam',
  iciclecrash: 'rocks', iciclespear: 'icebeam', avalanche: 'rocks', frostbreath: 'icebeam', powdersnow: 'icebeam', icywind: 'icebeam',
  sheercold: 'icebeam', glaciate: 'icebeam', freezeshock: 'icebeam', iceburn: 'icebeam', aquajet: 'quick', aquatail: 'surf',
  waterfall: 'surf', liquidation: 'surf', crabhammer: 'punch', razorshell: 'slash', brine: 'hydropump', waterpulse: 'orb',
  octazooka: 'orb', mudshot: 'sand', mudslap: 'sand', mudbomb: 'sludge', sludge: 'sludge', gunkshot: 'sludge', acid: 'sludge',
  acidspray: 'sludge', smog: 'sludge', poisonsting: 'horn', venoshock: 'sludge', clearsmog: 'sludge', shadowsneak: 'shadowball',
  hex: 'shadowball', ominouswind: 'gust', astonish: 'shadowball', lick: 'shadowball', nightshade: 'shadowball', shadowpunch: 'punch',
  spiritshackle: 'shadowball', spectralthief: 'shadowball', seismictoss: 'slam', vitalthrow: 'slam', circlethrow: 'slam',
  stormthrow: 'slam', knockoff: 'slam', foulplay: 'bite', throatchop: 'slam', pursuit: 'bite', assurance: 'bite', payback: 'bite',
  suckerpunch2: 'quick', machpunch: 'quick', bulletpunch: 'quick', vacuumwave: 'quick', accelerock: 'quick', watershuriken: 'quick',
  meteormash: 'punch', ironhead: 'tackle', gyroball: 'tackle', heavyslam: 'slam', irontail: 'slam', doubleironbash: 'punch',
  anchorshot: 'slam', sunsteelstrike2: 'fireblast', bonemerang: 'rocks', boneclub: 'rocks', bonerush: 'rocks', shadowbone: 'rocks',
  highhorsepower: 'quake', stompingtantrum: 'quake', dig: 'quake', fissure: 'quake', sandtomb: 'sand', leechlife: 'drain',
  absorb: 'drain', megadrain: 'drain', drainpunch: 'drain', paraboliccharge: 'drain', oblivionwing: 'drain', hornleech2: 'drain',
  strengthsap: 'drain', pinmissile: 'horn', twineedle: 'horn', lunge: 'tackle', pollenpuff: 'orb', bugbite: 'bite', infestation: 'sand',
  attackorder: 'horn', silverwind: 'gust', bulletseed: 'orb', seedbomb: 'orb', woodhammer: 'tackle', powerwhip: 'slash',
  vinewhip: 'slash', leaftornado: 'leaves', grassknot: 'leaves', tropkick: 'punch', solarbeam2: 'hyperbeam',
};

function fxFor(id, o) {
  if (FX_OVERRIDE[id]) return FX_OVERRIDE[id];
  if (o.cat === 'X') {
    if (o.protect) return 'protect';
    if (o.rest) return 'rest';
    if (o.heal) return 'heal';
    if (o.weather) return { rain: 'raindance', sun: 'sunnyday', sand: 'sandstorm', hail: 'hailfx' }[o.weather];
    if (o.status === 'slp') return 'powder_sleep';
    if (o.status === 'par') return 'twave';
    if (o.status === 'brn') return 'wisp';
    if (o.status) return 'sludge';
    if (o.confuse) return 'confuseray';
    if (o.leechSeed) return 'seed';
    if (o.boosts && o.target === 'self') {
      const k = Object.keys(o.boosts);
      if (k.includes('atk')) return 'swords';
      if (k.includes('spe')) return 'dragondance';
      if (k.includes('eva')) return 'doubleteam';
      return 'calmmind';
    }
    return 'rings';
  }
  if (o.recharge) return 'hyperbeam';
  const n = o.name;
  if (/CLAW|SLASH|BLADE|CUT|SCISSOR|CHOP/.test(n)) return 'slash';
  if (/FANG|BITE|CRUNCH/.test(n)) return 'bite';
  if (/BEAM|LASER|RAY|CANNON/.test(n)) return 'beam';
  if (/BALL|SPHERE|BOMB|SHOT|BLAST/.test(n)) return 'orb';
  if (/PUNCH|KICK|FIST|HAMMER/.test(n)) return 'punch';
  const byType = {
    FIRE: o.contact ? 'firepunch' : o.power >= 110 ? 'fireblast' : 'fire',
    WATER: o.spread ? 'surf' : 'hydropump', ELECTRIC: 'thunder', ICE: 'icebeam', GRASS: o.drain ? 'drain' : 'leaves',
    POISON: 'sludge', PSYCHIC: 'psychic', GHOST: 'shadowball', DARK: o.contact ? 'bite' : 'orb', DRAGON: o.contact ? 'dragonclaw' : 'beam',
    FAIRY: 'fairy', FLYING: o.contact ? 'tackle' : 'gust', BUG: o.contact ? 'horn' : 'orb', NORMAL: o.contact ? 'tackle' : 'star',
    FIGHTING: o.contact ? 'punch' : 'orb', ROCK: 'rocks', STEEL: o.contact ? 'slam' : 'beam', GROUND: o.spread ? 'quake' : 'sand',
  };
  return byType[o.type] || 'tackle';
}

function convertMove(id, m) {
  if (!m || m.num <= 0 || m.num > 742 || m.isZ || m.isMax) return null;
  if (m.isNonstandard && m.isNonstandard !== 'Past') return null;
  if (BLACKLIST.has(id)) return null;
  const o = { name: m.name.toUpperCase(), type: m.type.toUpperCase(), cat: m.category === 'Physical' ? 'P' : m.category === 'Special' ? 'S' : 'X',
    power: m.basePower || 0, acc: m.accuracy === true ? null : m.accuracy, pp: m.pp };
  if (m.priority) o.priority = m.priority;
  const fl = m.flags || {};
  if (o.cat !== 'X') {
    if (!FOE_TARGETS.has(m.target) || m.ohko) return null;
    if (m.selfSwitch && m.selfSwitch !== true) return null;
    if (m.damage) { o.fixed = m.damage; o.power = o.power || 60; }
    else if (o.power <= 0) return null;
    o.target = 'foe';
    if (m.target === 'allAdjacentFoes' || m.target === 'allAdjacent') o.spread = 1;
    if (fl.contact) o.contact = 1;
    if (m.recoil) o.recoil = m.recoil[0] / m.recoil[1];
    if (m.drain) o.drain = m.drain[0] / m.drain[1];
    if (m.critRatio >= 2) o.highCrit = 1;
    if (m.willCrit) o.alwaysCrit = 1;
    if (m.self && m.self.volatileStatus === 'mustrecharge') o.recharge = 1;
    if (m.self && m.self.boosts) o.selfBoosts = m.self.boosts;
    if (m.multihit) o.multi = m.multihit;
    if (fl.charge) o.charge = 1;
    if (m.thawsTarget || fl.defrost) o.thaw = 1;
    const secs = m.secondaries || (m.secondary ? [m.secondary] : []);
    const sec = [];
    for (const s of secs) {
      const e = { chance: s.chance || 100 };
      if (s.status) e.status = s.status;
      if (s.volatileStatus === 'flinch') e.flinch = 1;
      if (s.volatileStatus === 'confusion') e.confuse = 1;
      if (s.boosts) e.boosts = s.boosts;
      if (s.self && s.self.boosts) e.selfBoosts = s.self.boosts;
      if (Object.keys(e).length > 1) sec.push(e);
    }
    if (sec.length) o.sec = sec;
  } else {
    if (m.selfSwitch || m.sideCondition || m.slotCondition || m.pseudoWeather || m.terrain || m.forceSwitch || m.selfdestruct || fl.charge) return null;
    const t = m.target;
    const foe = FOE_TARGETS.has(t), self = t === 'self' || t === 'adjacentAllyOrSelf';
    let ok = false;
    if (m.boosts) { if (!foe && !self) return null; o.boosts = m.boosts; o.target = self ? 'self' : 'foe'; ok = true; }
    if (m.status) { if (!foe) return null; o.status = m.status; o.target = 'foe'; ok = true; }
    if (m.volatileStatus === 'confusion') { if (!foe) return null; o.confuse = 1; o.target = 'foe'; ok = true; }
    else if (m.volatileStatus === 'leechseed') { o.leechSeed = 1; o.target = 'foe'; ok = true; }
    else if (PROTECTS.has(id)) { o.protect = 1; o.target = 'self'; ok = true; }
    else if (m.volatileStatus && !IGNORABLE_VOLATILES.has(m.volatileStatus)) return null;
    if (m.heal && self) { o.heal = m.heal[0] / m.heal[1]; o.target = 'self'; ok = true; }
    if (HEAL_CALLBACK.has(id)) { o.heal = 0.5; o.target = 'self'; ok = true; }
    if (id === 'rest') { o.rest = 1; o.target = 'self'; ok = true; }
    if (m.weather && WEATHER[m.weather]) { o.weather = WEATHER[m.weather]; o.target = 'field'; ok = true; }
    if (!ok) return null;
    if (fl.powder) o.powder = 1;
    if (id === 'thunderwave') o.typeImmune = 1;
  }
  o.fx = fxFor(id, o);
  return o;
}

const BOOST_KEY = { accuracy: 'acc', evasion: 'eva' };
const fixBoosts = (b) => b && Object.fromEntries(Object.entries(b).map(([k, v]) => [BOOST_KEY[k] || k, v]));
for (const m of Object.values(movesRaw)) {
  if (m.boosts) m.boosts = fixBoosts(m.boosts);
  if (m.self && m.self.boosts) m.self.boosts = fixBoosts(m.self.boosts);
  for (const s of m.secondaries || (m.secondary ? [m.secondary] : [])) {
    if (s.boosts) s.boosts = fixBoosts(s.boosts);
    if (s.self && s.self.boosts) s.self.boosts = fixBoosts(s.self.boosts);
  }
}

const MOVES = {};
for (const [id, m] of Object.entries(movesRaw)) {
  const o = convertMove(id, m);
  if (o) MOVES[id.toUpperCase()] = o;
}
MOVES.STRUGGLE = { name: 'STRUGGLE', type: '???', cat: 'P', power: 50, acc: null, pp: 1, target: 'foe', contact: 1, recoil: 1 / 4, struggle: 1, fx: 'tackle' };

// ---------------- species ----------------
const ABILITY_SUPPORT = new Set(['BLAZE', 'TORRENT', 'OVERGROW', 'SWARM', 'STATIC', 'THICK FAT', 'WATER ABSORB', 'VOLT ABSORB',
  'FLASH FIRE', 'LEVITATE', 'KEEN EYE', 'SYNCHRONIZE', 'INTIMIDATE', 'ROCK HEAD', 'CHLOROPHYLL', 'SWIFT SWIM', 'HUGE POWER',
  'PURE POWER', 'ADAPTABILITY', 'SAP SIPPER', 'MOTOR DRIVE', 'LIGHTNING ROD', 'STORM DRAIN', 'DRY SKIN', 'TECHNICIAN', 'GUTS',
  'FLAME BODY', 'POISON POINT', 'SAND RUSH', 'SLUSH RUSH', 'MULTISCALE', 'MAGIC GUARD', 'SHEER FORCE', 'TOUGH CLAWS', 'IRON FIST',
  'PIXILATE', 'REFRIGERATE', 'AERILATE', 'SOLAR POWER', 'DROUGHT', 'DRIZZLE', 'SAND STREAM', 'SNOW WARNING', 'FILTER', 'SOLID ROCK',
  'PRISM ARMOR', 'HUSTLE', 'SPEED BOOST', 'STURDY', 'WONDER GUARD', 'EFFECT SPOT', 'SHADOW SHIELD', 'FULL METAL BODY', 'BEAST BOOST',
  'PRESSURE', 'SERENE GRACE', 'SKILL LINK', 'STRONG JAW', 'MEGA LAUNCHER', 'RECKLESS', 'NATURAL CURE', 'REGENERATOR']);

const learnable = (key) => {
  const out = new Set();
  let k = key;
  while (k) {
    const ls = learnsets[k] && learnsets[k].learnset;
    if (ls) for (const [mid, srcs] of Object.entries(ls)) if (srcs.some(s => +s[0] <= 7)) out.add(mid.toUpperCase());
    const sp = pokedex[k];
    k = sp && sp.prevo ? toID(sp.prevo) : null;
  }
  return out;
};

const levelUp = (key) => {
  const ls = learnsets[key] && learnsets[key].learnset;
  const out = [];
  if (!ls) return out;
  for (const [mid, srcs] of Object.entries(ls)) {
    const M = mid.toUpperCase();
    if (!MOVES[M]) continue;
    for (const s of srcs) {
      const mt = s.match(/^7L(\d+)$/);
      if (mt) out.push([Math.max(1, +mt[1]), M]);
    }
  }
  const seen = new Set();
  return out.sort((a, b) => a[0] - b[0]).filter(([l, m]) => !seen.has(m + l) && seen.add(m + l));
};

function expectedPower(mv) {
  let p = mv.power;
  if (mv.fixed) p = 75;
  if (mv.multi) p *= Array.isArray(mv.multi) ? 3 : mv.multi;
  p *= (mv.acc == null ? 100 : mv.acc) / 100;
  if (mv.recharge) p *= 0.55;
  if (mv.charge) p *= 0.5;
  if (mv.recoil) p *= 0.92;
  if (mv.selfBoosts && Object.values(mv.selfBoosts).some(v => v < 0)) p *= 0.9;
  if (mv.priority > 0) p *= 1.05;
  return p;
}

const GOOD_STATUS = new Set(['SWORDSDANCE', 'DRAGONDANCE', 'CALMMIND', 'NASTYPLOT', 'QUIVERDANCE', 'SHELLSMASH', 'BULKUP', 'COIL',
  'RECOVER', 'ROOST', 'SOFTBOILED', 'SLACKOFF', 'MILKDRINK', 'MOONLIGHT', 'SYNTHESIS', 'MORNINGSUN', 'SHOREUP', 'TOXIC',
  'WILLOWISP', 'THUNDERWAVE', 'SPORE', 'SLEEPPOWDER', 'LEECHSEED', 'AGILITY', 'ROCKPOLISH', 'AUTOTOMIZE', 'GROWTH', 'WORKUP',
  'HONECLAWS', 'IRONDEFENSE', 'AMNESIA', 'COSMICPOWER', 'STOCKPILE', 'CURSE', 'HYPNOSIS', 'GLARE', 'STUNSPORE', 'SUNNYDAY', 'RAINDANCE',
  'TAILGLOW', 'GEOMANCY', 'SHIFTGEAR', 'VICTORYDANCE', 'REST', 'HEALORDER', 'STRENGTHSAP', 'CONFUSERAY', 'PROTECT']);

function pickSet(sp, candidates) {
  const [, atk, , spa] = sp.base;
  const physRatio = atk / Math.max(1, spa);
  const statFor = (mv) => mv.cat === 'P' ? (physRatio >= 0.8 ? 1 : physRatio) : (physRatio <= 1.25 ? 1 : 1 / physRatio);
  const score = (id) => {
    const mv = MOVES[id];
    return expectedPower(mv) * statFor(mv) * (sp.types.includes(mv.type) ? 1.5 : 1);
  };
  const attacks = candidates.filter(id => MOVES[id].cat !== 'X').sort((a, b) => score(b) - score(a));
  const PHYS_SETUP = new Set(['SWORDSDANCE', 'DRAGONDANCE', 'BULKUP', 'COIL', 'HONECLAWS', 'SHIFTGEAR', 'VICTORYDANCE']);
  const SPEC_SETUP = new Set(['CALMMIND', 'NASTYPLOT', 'QUIVERDANCE', 'TAILGLOW', 'GEOMANCY']);
  const statuses = candidates.filter(id => MOVES[id].cat === 'X' && GOOD_STATUS.has(id)
    && !(PHYS_SETUP.has(id) && physRatio < 1) && !(SPEC_SETUP.has(id) && physRatio > 1));
  const chosen = [];
  const typesUsed = new Set();
  for (const t of sp.types) {
    const best = attacks.find(id => MOVES[id].type === t && !chosen.includes(id));
    if (best && score(best) > 40) { chosen.push(best); typesUsed.add(t); }
  }
  if (statuses.length) {
    const pref = statuses.find(s => ['SWORDSDANCE', 'DRAGONDANCE', 'CALMMIND', 'NASTYPLOT', 'QUIVERDANCE', 'SHELLSMASH'].includes(s))
      || statuses.find(s => /RECOVER|ROOST|SOFTBOILED|SLACKOFF|MOONLIGHT|SYNTHESIS|MORNINGSUN|SHOREUP|MILKDRINK|STRENGTHSAP/.test(s))
      || statuses[0];
    if (chosen.length < 3) chosen.push(pref);
  }
  for (const id of attacks) {
    if (chosen.length >= 4) break;
    if (chosen.includes(id) || typesUsed.has(MOVES[id].type)) continue;
    chosen.push(id); typesUsed.add(MOVES[id].type);
  }
  for (const id of [...attacks, ...statuses]) { if (chosen.length >= 4) break; if (!chosen.includes(id)) chosen.push(id); }
  return chosen.slice(0, 4);
}

const fallbackForType = (type) => Object.entries(MOVES).filter(([, m]) => m.type === type && m.cat !== 'X' && m.power <= 80 && !m.charge && !m.recharge)
  .sort((a, b) => b[1].power - a[1].power).map(([k]) => k)[0];

const randIndex = new Map(Object.entries(randbats).map(([name, v]) => [toID(name), v]));
const DEX = {};
const bases = Object.entries(pokedex).filter(([, s]) => s.num >= 1 && s.num <= 809 && !s.forme);
for (const [key, s] of bases) {
  const K = key.toUpperCase();
  const csvS = speciesCsv.get(s.num) || {};
  const csvP = pokemonCsv.get(s.num) || {};
  let name = s.name.toUpperCase().replace(/^NIDORAN-F$/, 'NIDORAN♀').replace(/^NIDORAN-M$/, 'NIDORAN♂');
  const abil = Object.values(s.abilities).map(a => a.toUpperCase());
  const ability = abil.find(a => ABILITY_SUPPORT.has(a)) || abil[0];
  const base = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(k => s.baseStats[k]);
  const genderRate = s.gender === 'N' ? -1 : s.gender === 'F' ? 8 : s.gender === 'M' ? 0 : s.genderRatio ? Math.round(s.genderRatio.F * 8) : 4;
  const entry = {
    id: s.num, name, types: s.types.map(t => t.toUpperCase()), base, ability,
    growth: GROWTH[csvS.growth_rate_id] || 'ms', expYield: +csvP.base_experience || Math.round(base.reduce((a, b) => a + b) / 2.6),
    catchRate: +csvS.capture_rate || 45, gen: +csvS.generation_id || 1, gender: genderRate,
  };
  if (csvS.is_legendary === '1') entry.leg = 1;
  if (csvS.is_mythical === '1') entry.leg = 2;
  if (s.num > 649) entry.spr = 'png';

  const lv = levelUp(key);
  const all = [...learnable(key)].filter(id => MOVES[id]);
  const rb = randIndex.get(key);
  let cands = [];
  if (rb) {
    const names = new Set();
    for (const role of Object.values(rb.roles || {})) for (const mn of role.moves || []) names.add(toID(mn).toUpperCase());
    for (const mn of rb.moves || []) names.add(toID(mn).toUpperCase());
    cands = [...names].filter(id => MOVES[id]);
  }
  if (cands.filter(id => MOVES[id].cat !== 'X').length < 3) cands = [...new Set([...cands, ...all])];
  let set = pickSet(entry, cands);
  if (!set.length) {
    const fb = [fallbackForType(entry.types[0]), entry.types[1] && fallbackForType(entry.types[1]), 'TACKLE'].filter(Boolean);
    set = [...new Set(fb)];
  }
  entry.set = set;
  entry.lv = lv.length ? lv : [[1, set[0]]];

  if (s.evos) {
    for (const evoName of s.evos) {
      const ek = toID(evoName), e = pokedex[ek];
      if (!e || e.num > 809 || e.forme) continue;
      const lvl = e.evoLevel || (e.evoType === 'levelFriendship' ? 22 : e.evoType === 'trade' ? 36 : 32);
      entry.evo = [ek.toUpperCase(), lvl];
      break;
    }
  }
  DEX[K] = entry;
}

// Moves actually referenced, to keep the payload small.
const used = new Set(['STRUGGLE']);
for (const d of Object.values(DEX)) { d.set.forEach(m => used.add(m)); d.lv.forEach(([, m]) => used.add(m)); }
const OUT_MOVES = {};
for (const k of Object.keys(MOVES).sort()) if (used.has(k)) OUT_MOVES[k] = MOVES[k];

const out = `// Generated by tools/build-data.js — do not edit by hand.\n`
  + `const MOVES = ${JSON.stringify(OUT_MOVES)};\n`
  + `const DEX = ${JSON.stringify(DEX)};\n`
  + `const DEX_ORDER = Object.keys(DEX).sort((a, b) => DEX[a].id - DEX[b].id);\n`;
fs.writeFileSync(path.join(__dirname, '..', 'js', 'dex.js'), out);
console.log(`species=${Object.keys(DEX).length} moves=${Object.keys(OUT_MOVES).length} (supported total ${Object.keys(MOVES).length}) bytes=${out.length}`);
for (const k of ['CHARIZARD', 'PIKACHU', 'GENGAR', 'DITTO', 'MAGIKARP', 'ARCEUS', 'DECIDUEYE', 'ZERAORA', 'EEVEE', 'SHEDINJA', 'UNOWN', 'WOBBUFFET', 'SMEARGLE'])
  console.log(k, DEX[k].set.join(','), DEX[k].ability, DEX[k].evo || '', DEX[k].lv.length);
