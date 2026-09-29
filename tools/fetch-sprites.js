// Downloads front/back battle sprites for all 809 Pokémon and trainer sprites from Pokémon Showdown.
// Usage: node tools/fetch-sprites.js   (needs curl + network)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/dex.js'), 'utf8') + ';this.DEX=DEX;', ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/trainers.js'), 'utf8') + ';this.TRAINERS=TRAINERS;', ctx);
const toID = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const S = 'https://play.pokemonshowdown.com/sprites';
const jobs = [];
const sprDir = path.join(root, 'assets/sprites');
const trDir = path.join(root, 'assets/trainers');
fs.mkdirSync(sprDir, { recursive: true });

for (const [key, d] of Object.entries(ctx.DEX)) {
  const id = key.toLowerCase();
  if (d.spr === 'png') {
    jobs.push([`${S}/gen5/${id}.png`, path.join(sprDir, `${d.id}.png`)]);
    jobs.push([`${S}/gen5-back/${id}.png`, path.join(sprDir, `${d.id}_back.png`)]);
  } else {
    jobs.push([`${S}/gen5ani/${id}.gif`, path.join(sprDir, `${d.id}.gif`)]);
    jobs.push([`${S}/gen5ani-back/${id}.gif`, path.join(sprDir, `${d.id}_back.gif`)]);
  }
}
for (const t of ctx.TRAINERS) if (t.sprite) jobs.push([`${S}/trainers/${t.sprite}.png`, path.join(trDir, `${t.sprite}.png`)]);

const todo = jobs.filter(([, f]) => !fs.existsSync(f) || fs.statSync(f).size < 100);
console.log(`${jobs.length} files, ${todo.length} to download`);
const list = path.join(__dirname, 'raw', 'jobs.txt');
fs.writeFileSync(list, todo.map(([u, f]) => `${u}\n${path.relative(root, f)}`).join('\n') + '\n');
if (todo.length) execSync(`xargs -n 2 -P 24 sh -c 'curl -sfL -o "$1" "$0" || echo "FAIL $0"' < tools/raw/jobs.txt`, { cwd: root, stdio: 'inherit', maxBuffer: 1 << 26 });
const missing = jobs.filter(([, f]) => !fs.existsSync(f) || fs.statSync(f).size < 100);
console.log('missing:', missing.map(([u]) => u).join('\n') || 'none');
