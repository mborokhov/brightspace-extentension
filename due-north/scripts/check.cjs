const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const base = path.resolve(__dirname,'..','extension');
const manifest = JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
for (const filename of fs.readdirSync(base).filter(f=>f.endsWith('.js'))) cp.execFileSync(process.execPath,['--check',path.join(base,filename)],{stdio:'inherit'});
const refs = [manifest.background.service_worker,...Object.values(manifest.icons),...manifest.content_scripts.flatMap(c=>c.js)];
for (const html of ['dashboard.html','help.html']) {
  const data=fs.readFileSync(path.join(base,html),'utf8');
  for(const match of data.matchAll(/(?:src|href)="([^"#]+)"/g)) if(!match[1].includes('://')) refs.push(match[1]);
  if(/<script(?![^>]*\bsrc=)[^>]*>/i.test(data)) throw new Error('Inline script violates CSP');
}
for(const ref of refs) if(!fs.existsSync(path.join(base,ref))) throw new Error(`Missing asset: ${ref}`);
if(manifest.host_permissions.some(p=>p.includes('<all_urls>'))) throw new Error('Overbroad host permissions');
console.log(`PASS: JavaScript syntax, manifest, CSP script checks, and ${refs.length} asset references.`);
