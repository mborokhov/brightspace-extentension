const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness(){
 let time=100000,callback,extractions=0,sequence=0;const timers=[],messages=[];
 const location={href:'https://www.gradescope.com/courses/42',pathname:'/courses/42'};
 const chrome={runtime:{sendMessage:async m=>{if(m.type==='CONTENT_SETTINGS')return {settings:{zone:'America/New_York'}};messages.push(m);return {ok:true};},onMessage:{addListener:()=>{}}}};
 const context=vm.createContext({chrome,document:{documentElement:{}},location,Date:class extends Date{static now(){return time;}},
   DNCore:{pageKind:()=> 'course'},DNExtract:{extract:()=>{extractions++;return {pageURL:location.href,items:[{title:'Item',revision:sequence}],links:[]};}},
   MutationObserver:class{constructor(fn){callback=fn;}observe(){}disconnect(){}},
   setTimeout:(fn,delay)=>{const token={fn,at:time+delay};timers.push(token);return token;},clearTimeout:token=>{const index=timers.indexOf(token);if(index>=0)timers.splice(index,1);}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/content.js'),'utf8'),context);
 const tick=async ms=>{await Promise.resolve();const until=time+ms;while(true){timers.sort((a,b)=>a.at-b.at);if(!timers.length||timers[0].at>until)break;const next=timers.shift();time=next.at;next.fn();await Promise.resolve();await Promise.resolve();}time=until;await Promise.resolve();};
 return {tick,messages,location,mutate:()=>{sequence++;callback();},count:()=>extractions};
}
test('content collection waits for initial and SPA navigation rendering before capturing',async()=>{
 const h=harness();await h.tick(5000);assert.equal(h.messages.length,0);await h.tick(1000);assert.equal(h.messages.length,1);
 h.location.href='https://www.gradescope.com/courses/43';h.location.pathname='/courses/43';h.mutate();await h.tick(4000);assert.equal(h.messages.length,1);
 await h.tick(6000);assert.ok(h.messages.length>=2);assert.equal(h.messages.at(-1).snapshot.pageURL,h.location.href);assert.equal(h.messages.at(-1).snapshot.settled,true);
});
test('continuous mutations cannot indefinitely starve fresh page collection',async()=>{
 const h=harness();await h.tick(31000);const before=h.count();
 for(let i=0;i<24;i++){h.mutate();await h.tick(500);}
 assert.ok(h.count()>before,'collector should run even when changes occur more often than its debounce interval');
});
