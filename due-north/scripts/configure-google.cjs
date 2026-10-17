'use strict';
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),index=args.indexOf('--client-id'),client=index<0?'':args[index+1];
if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(client||'')){
  console.error('Usage: node scripts/configure-google.cjs --client-id YOUR_CLIENT_ID.apps.googleusercontent.com');process.exit(1);
}
const filename=path.resolve(__dirname,'../extension/manifest.json'),manifest=JSON.parse(fs.readFileSync(filename,'utf8'));
manifest.oauth2={client_id:client,scopes:['https://www.googleapis.com/auth/calendar.app.created']};
// Never add or change manifest.key: existing installations must keep their identity and storage.
fs.writeFileSync(filename,JSON.stringify(manifest,null,2)+'\n');
console.log('Public OAuth client configured. Reload Due North in chrome://extensions, then connect from Calendar.');
