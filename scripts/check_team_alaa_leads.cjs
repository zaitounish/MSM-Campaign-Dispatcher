const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('CNX - Hot Ads - Hot Leads.csv'),
  crlfDelay: Infinity
});

const targets = new Set([
  'alaa ali', 'omar abdelaziz', 'samar ragab', 'farah abdelsalam',
  'mariam aamer', 'raneem mohamed', 'abdallah sobih', 'karim eltouny',
  'marwan attia', 'nabil abdallah', 'abdallah ghareeb'
]);

let header = null;
const repData = {};

function parseLine(line) {
  const res = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      res.push(cur); cur = '';
    } else cur += c;
  }
  res.push(cur);
  return res;
}

rl.on('line', (line) => {
  if (!header) {
    header = parseLine(line);
    return;
  }
  const cols = parseLine(line);
  const aoIdx = header.indexOf('AO');
  const asmIdx = header.indexOf('ASM');
  const ao = (cols[aoIdx] || '').trim().toLowerCase();
  if (targets.has(ao)) {
    if (!repData[ao]) {
      repData[ao] = { count: 0, asm: cols[asmIdx] || '' };
    }
    repData[ao].count++;
  }
});

rl.on('close', () => {
  console.log(JSON.stringify(repData, null, 2));
  let total = 0;
  for (const k in repData) total += repData[k].count;
  console.log('Total leads for Team Alaa:', total);
});
