const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const C=require('../extension/core.js'),url='https://www.gradescope.com/courses/42';
const snap=extra=>({pageURL:url,kind:'course',course:{id:'42'},items:[{title:'HW',dueRaw:'Sep 20, 2026',dueDate:'2026-09-20'}],links:[],quality:{},...extra});
function harness(){
 const calls=[],messages=[],created=[],options={response:()=>new Response('<h1>Assignments</h1>',{headers:{'content-type':'text/html'}}),snapshot:snap(),existing:false};
 const chrome={runtime:{getURL:p=>'chrome-extension://test/'+p,getContexts:async()=>options.existing?[{}]:[],sendMessage:async message=>{messages.push(message);return {snapshot:options.snapshot};}},offscreen:{createDocument:async value=>{created.push(value);options.existing=true;}}};
 const context=vm.createContext({DNCore:C,chrome,AbortController,TextDecoder,setTimeout,clearTimeout,fetch:async(...args)=>{calls.push(args);return options.response(...args);}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/background-fetch.js'),'utf8'),context);
 return {read:context.DNBackground.read,calls,messages,created,options};
}
test('background transport uses authenticated read-only requests and reuses the hidden parser',async()=>{
 const h=harness();assert.equal((await h.read(url,{zone:'America/New_York'})).kind,'snapshot');await h.read(url,{zone:'America/New_York'});
 assert.equal(h.calls[0][1].credentials,'include');assert.equal(h.calls[0][1].redirect,'manual');assert.equal(h.calls[0][1].cache,'no-store');assert.equal(h.created.length,1);assert.equal(h.created[0].reasons[0],'DOM_PARSER');assert.equal(h.messages[0].target,'offscreen-parser');assert.equal(h.messages[0].settings.zone,'America/New_York');
});
test('fetch refuses unsupported hosts, quiz players and submission URLs',async()=>{
 const h=harness();for(const page of ['https://evil.test/','https://www.mathxl.com/Student/Player.aspx','https://www.gradescope.com/courses/42/assignments/99/submissions/new'])assert.equal((await h.read(page,{})).kind,'error');assert.equal(h.calls.length,0);
});
test('opaque redirects fall back without following SSO; HTTP failures are not zero successes',async()=>{
 const h=harness();h.options.response=()=>({type:'opaqueredirect',status:0});assert.equal((await h.read(url,{})).kind,'render');assert.equal(h.calls.length,1);assert.equal(h.messages.length,0);
 h.options.response=()=>new Response('',{status:401});assert.equal((await h.read(url,{})).kind,'login');
 for(const status of [403,429,500]){h.options.response=()=>new Response('',{status});assert.equal((await h.read(url,{})).kind,'error');}
});
test('blank shells, home previews, embedded-only and partial lists require rendering',async()=>{
 const h=harness();for(const snapshot of [snap({items:[]}),snap({kind:'home',items:[],course:{}}),snap({quality:{preview:true}}),snap({quality:{partial:true}}),snap({kind:'home',items:[],embedded:true,links:[{url}],course:{}})]){h.options.snapshot=snapshot;assert.equal((await h.read(url,{})).kind,'render');}
 h.options.snapshot=snap({items:[],quality:{explicitEmpty:true}});assert.equal((await h.read(url,{})).kind,'snapshot');
 h.options.snapshot=snap({items:[],login:true});assert.equal((await h.read(url,{})).kind,'login');
});
test('oversized responses are rejected before parser messaging',async()=>{
 const h=harness();h.options.response=()=>new Response('too large',{headers:{'content-type':'text/html','content-length':String(5*1024*1024)}});
 assert.equal((await h.read(url,{})).kind,'render');assert.equal(h.messages.length,0);
 h.options.response=()=>new Response('x'.repeat(4*1024*1024+1),{headers:{'content-type':'text/html'}});assert.equal((await h.read(url,{})).kind,'render');assert.equal(h.messages.length,0);
});
test('aborting a slow request returns promptly without parser work',async()=>{
 const h=harness(),controller=new AbortController();h.options.response=()=>new Promise(()=>{});
 const pending=h.read(url,{}, {signal:controller.signal});controller.abort();assert.equal((await pending).kind,'cancelled');assert.equal(h.messages.length,0);assert.equal(h.calls[0][1].signal.aborted,true);
});
test('offscreen accepts only internal worker parsing requests and never inserts fetched markup',()=>{
 let listener,parsed=0;const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>{listener=fn;}}}};
 const context=vm.createContext({chrome,DNCore:C,DNExtract:{extract:()=>({items:[]})},DOMParser:class{parseFromString(html,type){parsed++;assert.equal(type,'text/html');return {};}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/offscreen.js'),'utf8'),context);
 const message={target:'offscreen-parser',type:'PARSE_HTML',url,html:'<script>bad()</script>'},worker={id:'test',url:'chrome-extension://test/background.js'};let reply;
 listener(message,{...worker,tab:{id:1}},value=>reply=value);assert.equal(reply,undefined);assert.equal(parsed,0);
 listener(message,{id:'other'},value=>reply=value);assert.equal(parsed,0);
 listener({...message,url:'https://evil.test'},worker,value=>reply=value);assert.ok(reply.error);assert.equal(parsed,0);
 listener(message,worker,value=>reply=value);assert.ok(reply.snapshot);assert.equal(parsed,1);
 listener(message,{id:'test'},value=>reply=value);assert.ok(reply.snapshot);assert.equal(parsed,2);
});
