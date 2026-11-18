import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {io} from 'socket.io-client';
const req=(s,name,data={})=>new Promise((resolve,reject)=>s.timeout(4000).emit(name,data,(err,result)=>err?reject(err):resolve(result)));
test('solo game: add AI, share deck, AI draws, AI advances its own turn', {timeout:25000}, async t=>{
 const port=37000+(process.pid%18000);
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port)}});
 t.after(()=>child.kill('SIGTERM'));
 let running=false;for(let i=0;i<80;i++){try{const r=await fetch('http://127.0.0.1:'+port+'/api/cards');if(r.ok){running=true;break}}catch{}await delay(80)}
 assert.equal(running,true);
 const client=io('http://127.0.0.1:'+port,{transports:['websocket'],forceNew:true,reconnection:false});t.after(()=>client.disconnect());
 const states=[];client.on('state',s=>states.push(s));
 await new Promise((resolve,reject)=>{client.once('connect',resolve);client.once('connect_error',reject)});
 const room=await req(client,'create',{name:'혼자'});
 assert.equal(room.ok,true);
 assert.equal((await req(client,'addBot',{count:1})).ok,true);
 await delay(80);
 assert.equal(states.at(-1).players.length,2);
 assert.equal(states.at(-1).players[1].bot,true);
 assert.equal((await req(client,'start')).ok,true);
 await delay(60);
 assert.equal(states.at(-1).players[1].count,3);
 assert.equal((await req(client,'next')).ok,true);
 await delay(2600);
 assert.equal(states.some(s=>s.players?.[1]?.count>=4),true,'AI should draw after human turn');
 assert.equal(states.some(s=>s.players?.length===2&&s.turn===0&&s.left===4),true,'AI must end its own turn and decrement after round');
});
