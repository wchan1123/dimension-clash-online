import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseBotTurn,chooseBotResponse,botName} from '../ai.js';
const cards=[{id:'007',type:'action'},{id:'070',type:'counter'},{id:'118',type:'field'},{id:'084',type:'trap'},{id:'006',type:'action'}];
const room=()=>({status:'playing',deck:['001'],cards,pending:null});
test('AI plays verified effects but never invents unverified card behavior',()=>{
 const b={id:'bot',hand:['006','007'],drawnThisTurn:true,playedThisTurn:false};
 assert.deepEqual(chooseBotTurn(b,room()),{type:'announce',cardId:'007'});
 b.hand=['006'];assert.deepEqual(chooseBotTurn(b,room()),{type:'next'});
});
test('AI draws first and moves verified field / traps to proper zones',()=>{
 const b={id:'bot',hand:['118'],drawnThisTurn:false,playedThisTurn:false};
 assert.deepEqual(chooseBotTurn(b,room()),{type:'draw',count:1});
 b.drawnThisTurn=true;assert.equal(chooseBotTurn(b,room()).destination,'field');
 b.hand=['084'];assert.equal(chooseBotTurn(b,room()).destination,'trap');
});
test('AI counter reacts only to verified action-card effect and correct priority',()=>{
 const r=room();r.pending={stage:'responding',order:['bot','human'],cursor:0,stack:[{cardId:'007'}]};
 const b={id:'bot',hand:['070']};
 assert.equal(chooseBotResponse(b,r).type,'counter');
 r.pending.cursor=1;assert.equal(chooseBotResponse(b,r).type,'wait');
 r.pending.cursor=0;r.pending.stack[0].cardId='118';
 assert.equal(chooseBotResponse(b,r).type,'pass');
 assert.equal(botName(2),'우주 AI 2');
});
