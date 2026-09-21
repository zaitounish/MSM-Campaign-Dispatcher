/**
 * scripts/ingest_team_alaa.cjs
 *
 * 1. Whitelists the 11 reps of Team Alaa Abdelaati in `reps_whitelist`.
 * 2. Ingests all 2,490 leads for Team Alaa from `CNX - Hot Ads - Hot Leads.csv`
 *    into `assigned_leads` in Supabase.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://phewzisycpiaokxgchnh.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoZXd6aXN5Y3BpYW9reGdjaG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDY0OTIsImV4cCI6MjA5NTgyMjQ5Mn0.rZmi0HxgnSUD-Un9-OayKNS32A3Yzn6tpyLN3iaaCG8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TEAM_ALAA = [
  { ao: 'alaa ali', email: 'alaa.ali@ext.doordash.com', name: 'Alaa Ali' },
  { ao: 'omar abdelaziz', email: 'omar.abdelaziz@ext.doordash.com', name: 'Omar Abdelaziz' },
  { ao: 'samar ragab', email: 'samar.ragab@ext.doordash.com', name: 'Samar Ragab' },
  { ao: 'farah abdelsalam', email: 'farah.abdelsalam@ext.doordash.com', name: 'Farah Abdelsalam' },
  { ao: 'mariam aamer', email: 'mariam.aamer@ext.doordash.com', name: 'Mariam Aamer' },
  { ao: 'raneem mohamed', email: 'raneem.mohamed@ext.doordash.com', name: 'Raneem Mohamed' },
  { ao: 'abdallah sobih', email: 'abdallah.sobih@ext.doordash.com', name: 'Abdallah Sobih' },
  { ao: 'karim eltouny', email: 'karim.eltouny@ext.doordash.com', name: 'Karim Eltouny' },
  { ao: 'marwan attia', email: 'marwan.attia@ext.doordash.com', name: 'Marwan Attia' },
  { ao: 'nabil abdallah', email: 'nabil.abdallah@ext.doordash.com', name: 'Nabil Abdallah' },
  { ao: 'abdallah ghareeb', email: 'abdallah.ghareeb@ext.doordash.com', name: 'Abdallah Ghareeb' }
];

const aoMap = new Map(TEAM_ALAA.map(r => [r.ao, r]));

function parseCSVLine(line) {
  const res = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      res.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  res.push(cur);
  return res;
}

async function main() {
  console.log('🚀 Step 1: Whitelisting 11 reps in `reps_whitelist`...');

  for (const rep of TEAM_ALAA) {
    const { data: existing } = await supabase
      .from('reps_whitelist')
      .select('id, email')
      .eq('email', rep.email)
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await supabase.from('reps_whitelist').insert({
        email: rep.email,
        full_name: rep.name,
        role: 'rep',
        manager_name: 'Alaa Abdelaati',
        is_active: true,
        daily_email_limit: 45
      });
      if (insErr) {
        console.error(`❌ Failed to whitelist ${rep.email}:`, insErr.message);
      } else {
        console.log(`   ✓ Whitelisted ${rep.name} (${rep.email})`);
      }
    } else {
      console.log(`   ℹ Already whitelisted: ${rep.name} (${rep.email})`);
    }
  }

  console.log('\n🚀 Step 2: Parsing and extracting leads from `CNX - Hot Ads - Hot Leads.csv`...');
  const csvPath = path.resolve(__dirname, '..', 'CNX - Hot Ads - Hot Leads.csv');
  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let header = null;
  const rowsToInsert = [];
  const repCounts = {};

  for await (const line of rl) {
    if (!header) {
      header = parseCSVLine(line);
      continue;
    }
    const cols = parseCSVLine(line);

    const getVal = (colName) => {
      const idx = header.indexOf(colName);
      return idx >= 0 && cols[idx] !== undefined ? cols[idx].trim() : '';
    };

    const ao = getVal('AO').toLowerCase();
    const rep = aoMap.get(ao);
    if (!rep) continue;

    repCounts[rep.email] = (repCounts[rep.email] || 0) + 1;

    const firstName = getVal('First Name');
    const lastName = getVal('Last Name');
    const dmName = [firstName, lastName].filter(Boolean).join(' ');

    rowsToInsert.push({
      rep_email: rep.email,
      rep_name: rep.ao, // matching original AO format
      manager_name: getVal('ASM') || 'Alaa Abdelaati',
      store_id: getVal('Store Id'),
      business_id: getVal('Business Id'),
      business_name: getVal('Business Name'),
      opp_type: getVal('Opp Type'),
      dm_first_name: firstName,
      dm_last_name: lastName,
      dm_name: dmName,
      email: getVal('Email'),
      phone_number: getVal('Phone Number'),
      mx_role: getVal('Mx Role'),
      profile_type: getVal('Profile Type'),
      profile_id: getVal('Profile Id'),
      first_use: getVal('First Use'),
      last_use: getVal('Last Use'),
      campaign_event: 'Hot Ads - Hot Leads'
    });
  }

  console.log(`Found ${rowsToInsert.length} leads across 11 reps:`);
  for (const [em, cnt] of Object.entries(repCounts)) {
    console.log(`   ${em}: ${cnt} leads`);
  }

  console.log(`\n🚀 Step 3: Inserting ${rowsToInsert.length} leads into Supabase \`assigned_leads\` in batches...`);
  const BATCH_SIZE = 500;
  let insertedTotal = 0;

  for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
    const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
    let attempts = 0;
    let success = false;

    while (attempts < 3 && !success) {
      attempts++;
      const { error } = await supabase.from('assigned_leads').insert(batch);
      if (!error) {
        success = true;
        insertedTotal += batch.length;
        console.log(`   ✓ Inserted batch ${Math.floor(i / BATCH_SIZE) + 1} (${insertedTotal}/${rowsToInsert.length})`);
      } else {
        console.warn(`   ⚠️ Batch failed on attempt ${attempts}:`, error.message);
        if (attempts < 3) await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!success) {
      console.error('❌ Failed to insert batch. Stopping.');
      process.exit(1);
    }
  }

  console.log(`\n🎉 Step 4: Verification`);
  const { count: finalCount } = await supabase
    .from('assigned_leads')
    .select('id', { count: 'exact', head: true });
  console.log(`Total rows in \`assigned_leads\` table now: ${finalCount.toLocaleString()}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
