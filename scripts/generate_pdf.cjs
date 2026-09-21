const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MD_PATH = path.join(__dirname, '..', 'REP_USER_GUIDE.md');
const HTML_OUTPUT = path.join(__dirname, 'guide_printable.html');
const PDF_OUTPUT = path.join(__dirname, '..', 'REP_USER_GUIDE.pdf');
const DOCS_PDF_OUTPUT = path.join(__dirname, '..', 'docs', 'REP_USER_GUIDE.pdf');

function markdownToHtml(md) {
  // Convert images to base64 data URLs
  md = md.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, imgRelPath) => {
    let fullImgPath = path.resolve(path.join(__dirname, '..', imgRelPath));
    if (!fs.existsSync(fullImgPath)) {
      fullImgPath = path.resolve(path.join(__dirname, '..', 'docs', imgRelPath));
    }
    if (fs.existsSync(fullImgPath)) {
      const b64 = fs.readFileSync(fullImgPath).toString('base64');
      const ext = path.extname(fullImgPath).replace('.', '') || 'png';
      return `<div class="img-card"><img src="data:image/${ext};base64,${b64}" alt="${alt}" /><p class="img-caption">📷 ${alt}</p></div>`;
    }
    return match;
  });

  const lines = md.split('\n');
  let inList = false;
  let inTable = false;
  let html = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Horizontal Rule
    if (/^---+\s*$/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      if (inTable) { html.push('</tbody></table>'); inTable = false; }
      html.push('<hr />');
      continue;
    }

    // Headings
    if (/^# (.+)$/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<h1>${RegExp.$1.trim()}</h1>`);
      continue;
    }
    if (/^## (.+)$/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<h2>${RegExp.$1.trim()}</h2>`);
      continue;
    }
    if (/^### (.+)$/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<h3>${RegExp.$1.trim()}</h3>`);
      continue;
    }
    if (/^#### (.+)$/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<h4>${RegExp.$1.trim()}</h4>`);
      continue;
    }

    // Tables
    if (line.includes('|')) {
      const cols = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (cols.length > 0) {
        if (/^:?---+:?$/.test(cols[0])) {
          // delimiter row
          continue;
        }
        if (!inTable) {
          html.push('<table><thead><tr>');
          cols.forEach(c => html.push(`<th>${formatInline(c)}</th>`));
          html.push('</tr></thead><tbody>');
          inTable = true;
          continue;
        } else {
          html.push('<tr>');
          cols.forEach(c => html.push(`<td>${formatInline(c)}</td>`));
          html.push('</tr>');
          continue;
        }
      }
    } else if (inTable) {
      html.push('</tbody></table>');
      inTable = false;
    }

    // Blockquotes
    if (/^>\s*(.+)$/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<blockquote>${formatInline(RegExp.$1)}</blockquote>`);
      continue;
    }

    // Lists
    if (/^(\s*)[-*+]\s+(.+)$/.test(line)) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${formatInline(RegExp.$2)}</li>`);
      continue;
    } else if (/^\d+\.\s+(.+)$/.test(line)) {
      if (!inList) { html.push('<ol>'); inList = true; }
      html.push(`<li>${formatInline(RegExp.$1)}</li>`);
      continue;
    } else {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
    }

    // Empty lines
    if (line.trim() === '') {
      continue;
    }

    // Image card pass-through
    if (line.startsWith('<div class="img-card">')) {
      html.push(line);
      continue;
    }

    // Standard paragraph
    html.push(`<p>${formatInline(line)}</p>`);
  }

  if (inList) html.push('</ul>');
  if (inTable) html.push('</tbody></table>');

  return html.join('\n');
}

function formatInline(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
}

function buildHtmlDocument(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DoorDash MSM Campaign Dispatcher — Sales Rep User Guide</title>
  <style>
    @page {
      size: A4;
      margin: 16mm 14mm 16mm 14mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      line-height: 1.55;
      font-size: 13.5px;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    .header-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 3px solid #EB1700;
      padding-bottom: 14px;
      margin-bottom: 24px;
    }
    .header-title h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .header-title .subtitle {
      margin: 4px 0 0 0;
      font-size: 13px;
      color: #64748b;
      font-weight: 500;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #EB1700;
      font-size: 11px;
      font-weight: 700;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    h1 {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 24px;
      margin-bottom: 12px;
      letter-spacing: -0.3px;
      page-break-after: avoid;
    }
    h2 {
      font-size: 17px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 22px;
      margin-bottom: 10px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
      page-break-after: avoid;
    }
    h3 {
      font-size: 14.5px;
      font-weight: 700;
      color: #334155;
      margin-top: 16px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }
    p {
      margin: 0 0 10px 0;
    }
    ul, ol {
      margin: 0 0 12px 0;
      padding-left: 20px;
    }
    li {
      margin-bottom: 4px;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
      color: #0f172a;
      border: 1px solid #e2e8f0;
    }
    strong {
      color: #0f172a;
    }
    blockquote {
      margin: 12px 0;
      padding: 10px 14px;
      background: #f8fafc;
      border-left: 4px solid #EB1700;
      border-radius: 0 8px 8px 0;
      color: #334155;
      font-size: 13px;
    }
    hr {
      border: 0;
      border-top: 1px solid #e2e8f0;
      margin: 20px 0;
    }
    .img-card {
      margin: 14px 0 18px 0;
      padding: 8px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
      page-break-inside: avoid;
      text-align: center;
    }
    .img-card img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      display: block;
      margin: 0 auto;
    }
    .img-caption {
      margin: 6px 0 2px 0;
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
      font-size: 12px;
      page-break-inside: avoid;
    }
    th, td {
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      text-align: left;
    }
    th {
      background: #f8fafc;
      font-weight: 700;
      color: #0f172a;
    }
    a {
      color: #EB1700;
      text-decoration: none;
      font-weight: 600;
    }
    .footer-note {
      margin-top: 30px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #94a3b8;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header-banner">
    <div class="header-title">
      <h1>DoorDash Campaign Dispatcher</h1>
      <p class="subtitle">Sales Rep Quick Reference &amp; Operational User Guide</p>
    </div>
    <div class="badge">Internal Only</div>
  </div>
  ${bodyHtml}
  <div class="footer-note">
    DoorDash Merchant Success Management · Internal Operational Documentation · Confidential
  </div>
</body>
</html>`;
}

async function run() {
  console.log('Reading Markdown:', MD_PATH);
  const md = fs.readFileSync(MD_PATH, 'utf8');

  console.log('Parsing Markdown and embedding image Data URLs...');
  const bodyHtml = markdownToHtml(md);
  const fullHtml = buildHtmlDocument(bodyHtml);

  fs.writeFileSync(HTML_OUTPUT, fullHtml, 'utf8');
  console.log('Generated printable HTML:', HTML_OUTPUT);

  // Path to Chrome or Edge
  const browserPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  const browserExe = browserPaths.find(p => fs.existsSync(p));

  if (!browserExe) {
    console.error('Neither Google Chrome nor Microsoft Edge was found!');
    process.exit(1);
  }

  console.log('Using browser:', browserExe);
  console.log('Generating PDF:', PDF_OUTPUT);

  const cmd = `"${browserExe}" --headless --disable-gpu --run-all-compositor-stages-before-draw --print-to-pdf="${PDF_OUTPUT}" --no-pdf-header-footer "${HTML_OUTPUT}"`;
  execSync(cmd);

  if (fs.existsSync(PDF_OUTPUT)) {
    const stats = fs.statSync(PDF_OUTPUT);
    console.log(`Success! Created ${PDF_OUTPUT} (${(stats.size / 1024).toFixed(1)} KB)`);
    // Copy to docs/ as well
    fs.copyFileSync(PDF_OUTPUT, DOCS_PDF_OUTPUT);
    console.log(`Mirrored to ${DOCS_PDF_OUTPUT}`);
  } else {
    console.error('PDF generation command finished but output file not found.');
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
