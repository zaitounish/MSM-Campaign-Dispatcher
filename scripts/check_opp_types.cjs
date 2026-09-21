const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('CNX - Hot Ads - Hot Leads.csv'),
  crlfDelay: Infinity
});

let header = null;
const oppTypes = {};

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
  const idx = header.indexOf('Opp Type');
  const val = (cols[idx] || '').trim();
  if (val) {
    oppTypes[val] = (oppTypes[val] || 0) + 1;
  }
});

rl.on('close', () => {
  console.log(JSON.stringify(oppTypes, null, 2));
});
