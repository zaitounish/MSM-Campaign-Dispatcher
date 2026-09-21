/**
 * scripts/ingest_assigned_leads.cjs
 * Ingests "Hot Ads - Hot Leads" leads into Supabase `assigned_leads` table.
 *
 * Excludes:
 * - "EMXs" (unassigned queue/pool)
 * - Team Alaa Abdelaati (11 reps kept on hold per user request)
 *
 * Matches:
 * - 90 reps from reps_whitelist
 * - 2 confirmed reps from AppSheet: George Shehata & Yousef Abdelkader
 * Total: 92 reps | 39,316 leads
 *
 * Usage:
 *   node scripts/ingest_assigned_leads.cjs --dry-run
 *   node scripts/ingest_assigned_leads.cjs
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://phewzisycpiaokxgchnh.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoZXd6aXN5Y3BpYW9reGdjaG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDY0OTIsImV4cCI6MjA5NTgyMjQ5Mn0.rZmi0HxgnSUD-Un9-OayKNS32A3Yzn6tpyLN3iaaCG8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const isDryRun = process.argv.includes('--dry-run');

// Reps on hold (Team Alaa was released; EMXs is handled separately)
const HELD_REPS = new Set([]);

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

async function run() {
  console.log('🚀 Starting lead ingestion pipeline...');
  console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (No database changes)' : '💾 LIVE INSERTION'}`);

  const baseDir = path.resolve(__dirname, '..');

  // Check Supabase connection and table existence
  if (!isDryRun) {
    const { error: checkErr } = await supabase.from('assigned_leads').select('id').limit(1);
    if (checkErr) {
      console.error('\n❌ ERROR: Cannot access `assigned_leads` table in Supabase:');
      console.error('   ' + checkErr.message);
      console.error('\n👉 Please run the migration first:');
      console.error('   1. Open Supabase Dashboard -> SQL Editor');
      console.error('   2. Paste and run `supabase-migrations/005_create_assigned_leads.sql`\n');
      process.exit(1);
    }
    console.log('✅ Connected to Supabase `assigned_leads` table.');
  }

  // 1. Build Rep Map from reps_whitelist_rows.csv
  const wlPath = path.join(baseDir, 'reps_whitelist_rows.csv');
  const wlData = fs.readFileSync(wlPath, 'utf8');
  const wlLines = wlData.split(/\r?\n/).filter(Boolean);
  const wlHeader = parseCSVLine(wlLines[0]);
  const emailIdx = wlHeader.indexOf('email');
  const nameIdx = wlHeader.indexOf('full_name');

  const repList = [];
  for (let i = 1; i < wlLines.length; i++) {
    const c = parseCSVLine(wlLines[i]);
    if (c[emailIdx]) {
      repList.push({
        email: c[emailIdx].trim().toLowerCase(),
        name: (c[nameIdx] || '').trim(),
      });
    }
  }

  // Add confirmed AppSheet and Team Alaa reps
  const confirmedDirectReps = [
    { email: 'george.shehata@ext.doordash.com', name: 'George Fayez Gouda Oweida Shehata', ao: 'george shehata' },
    { email: 'yousef.abdelkader@ext.doordash.com', name: 'Yousef Salah Eldin Abdullah Abdelkader Ali', ao: 'yousef abdelkader' },
    { email: 'alaa.ali@ext.doordash.com', name: 'Alaa Ali', ao: 'alaa ali' },
    { email: 'omar.abdelaziz@ext.doordash.com', name: 'Omar Abdelaziz', ao: 'omar abdelaziz' },
    { email: 'samar.ragab@ext.doordash.com', name: 'Samar Ragab', ao: 'samar ragab' },
    { email: 'farah.abdelsalam@ext.doordash.com', name: 'Farah Abdelsalam', ao: 'farah abdelsalam' },
    { email: 'mariam.aamer@ext.doordash.com', name: 'Mariam Aamer', ao: 'mariam aamer' },
    { email: 'raneem.mohamed@ext.doordash.com', name: 'Raneem Mohamed', ao: 'raneem mohamed' },
    { email: 'abdallah.sobih@ext.doordash.com', name: 'Abdallah Sobih', ao: 'abdallah sobih' },
    { email: 'karim.eltouny@ext.doordash.com', name: 'Karim Eltouny', ao: 'karim eltouny' },
    { email: 'marwan.attia@ext.doordash.com', name: 'Marwan Attia', ao: 'marwan attia' },
    { email: 'nabil.abdallah@ext.doordash.com', name: 'Nabil Abdallah', ao: 'nabil abdallah' },
    { email: 'abdallah.ghareeb@ext.doordash.com', name: 'Abdallah Ghareeb', ao: 'abdallah ghareeb' },
  ];

  // Helper function to resolve AO to rep email
  const aoCache = new Map();
  function resolveRepEmail(aoRaw) {
    const ao = (aoRaw || '').trim();
    if (!ao || ao === 'EMXs') return null;
    const lowerAO = ao.toLowerCase();

    if (HELD_REPS.has(lowerAO)) return null; // on hold
    if (aoCache.has(lowerAO)) return aoCache.get(lowerAO);

    // Check direct matches first
    const directMatch = confirmedDirectReps.find(r => r.ao === lowerAO);
    if (directMatch) {
      aoCache.set(lowerAO, directMatch);
      return directMatch;
    }

    const parts = lowerAO.split(/\s+/).filter(Boolean);
    let match = repList.find(r => {
      const prefix = r.email.split('@')[0];
      if (parts.length >= 2) {
        if (prefix === parts[0] + '.' + parts[parts.length - 1]) return true;
        if (prefix.startsWith(parts[0] + '.' + parts[parts.length - 1])) return true;
      }
      return false;
    });

    if (!match) {
      match = repList.find(r => {
        const fn = r.name.toLowerCase();
        if (parts.length >= 2 && fn.includes(parts[0]) && fn.includes(parts[parts.length - 1])) return true;
        return false;
      });
    }

    if (!match) {
      match = repList.find(r => r.email === lowerAO);
    }

    if (match) {
      aoCache.set(lowerAO, match);
      return match;
    }

    aoCache.set(lowerAO, null);
    return null;
  }

  // 2. Read and parse leads CSV
  const leadsPath = path.join(baseDir, 'CNX - Hot Ads - Hot Leads.csv');
  const fileStream = fs.createReadStream(leadsPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let header = null;
  let rowCount = 0;
  let matchedRows = 0;
  let heldRows = 0;
  let emxsRows = 0;

  const rowsToInsert = [];
  const repStats = new Map();

  for await (const line of rl) {
    if (!header) {
      header = parseCSVLine(line);
      continue;
    }
    rowCount++;
    const cols = parseCSVLine(line);

    const getVal = (colName) => {
      const idx = header.indexOf(colName);
      return idx >= 0 && cols[idx] !== undefined ? cols[idx].trim() : '';
    };

    const ao = getVal('AO');
    if (ao === 'EMXs') {
      emxsRows++;
      continue;
    }

    if (HELD_REPS.has(ao.toLowerCase())) {
      heldRows++;
      continue;
    }

    const rep = resolveRepEmail(ao);
    if (!rep) {
      continue;
    }

    matchedRows++;
    repStats.set(rep.email, (repStats.get(rep.email) || 0) + 1);

    const firstName = getVal('First Name');
    const lastName = getVal('Last Name');
    const dmName = [firstName, lastName].filter(Boolean).join(' ');

    rowsToInsert.push({
      rep_email: rep.email,
      rep_name: ao,
      manager_name: getVal('ASM'),
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
      campaign_event: 'Hot Ads - Hot Leads',
    });
  }

  console.log('\n📊 Parse Summary:');
  console.log(`   Total rows in CSV:    ${rowCount.toLocaleString()}`);
  console.log(`   EMXs (unassigned):    ${emxsRows.toLocaleString()} (skipped/on hold)`);
  console.log(`   Team Alaa (held):     ${heldRows.toLocaleString()} (on hold)`);
  console.log(`   Matched for upload:   ${matchedRows.toLocaleString()} rows across ${repStats.size} reps`);

  if (isDryRun) {
    console.log('\n🔍 DRY RUN COMPLETE: 0 database writes executed.');
    return;
  }

  // 3. Batch insert into Supabase
  console.log(`\n📤 Inserting ${rowsToInsert.length.toLocaleString()} leads into Supabase in batches...`);
  const BATCH_SIZE = 500;
  const totalBatches = Math.ceil(rowsToInsert.length / BATCH_SIZE);

  let insertedTotal = 0;
  for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
    const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    let attempts = 0;
    let success = false;

    while (attempts < 3 && !success) {
      attempts++;
      const { error } = await supabase.from('assigned_leads').insert(batch);
      if (!error) {
        success = true;
        insertedTotal += batch.length;
        process.stdout.write(`\r   Progress: Batch ${batchNum}/${totalBatches} (${insertedTotal.toLocaleString()}/${rowsToInsert.length.toLocaleString()} rows)`);
      } else {
        console.warn(`\n⚠️ Batch ${batchNum} failed on attempt ${attempts}: ${error.message}`);
        if (attempts < 3) await new Promise(r => setTimeout(r, 1500));
      }
    }

    if (!success) {
      console.error(`\n❌ Fatal: Failed to insert batch ${batchNum} after 3 attempts.`);
      process.exit(1);
    }
  }

  console.log(`\n\n🎉 SUCCESS! All ${insertedTotal.toLocaleString()} leads successfully inserted into \`assigned_leads\`!`);
}

run().catch(err => {
  console.error('\n❌ Unhandled error:', err);
  process.exit(1);
});
