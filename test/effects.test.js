import test from 'node:test';
import assert from 'node:assert/strict';
import {clockwiseOrder,createPriority,currentResponder,passPriority,playResponse,finishTop,applyVerifiedCard,VERIFIED_EFFECTS} from '../effects.js';
import {advanceTurn} from '../turns.js';
const players=['A','B','C'].map(id=>({id,name:id,hand:[]}));
const card=(id,name='sample')=>({id,name});
test('clockwise turns count only full rounds',()=>{
 let turn=0,left=3;
 for(let i=0;i<6;i++){({turn,roundsRemaining:left}=advanceTurn({turn,playerCount:3,roundsRemaining:left}));}
 assert.equal(turn,0);assert.equal(left,1);
});
test('counter windows grant priority clockwise and reject out-of-turn responses',()=>{
 const w=createPriority(players,players[0],card('007','단체 월반'));
 assert.deepEqual(clockwiseOrder(players,'A'),['B','C']);
 assert.equal(currentResponder(w),'B');
 assert.throws(()=>passPriority(w,players[2]),/현재 대응 순서/);
 passPriority(w,players[1]);
 assert.equal(currentResponder(w),'C');
 passPriority(w,players[2]);
 assert.equal(w.stage,'ready');
 assert.equal(finishTop(w,players).cardId,'007');
 assert.equal(w.stage,'done');
});
test('counter chain is last-in-first-out, reopening clockwise priority',()=>{
 const w=createPriority(players,players[0],card('005','original'));
 playResponse(w,players,players[1],card('080','reaction 1'));
 assert.equal(currentResponder(w),'C');
 playResponse(w,players,players[2],card('089','reaction 2'));
 assert.equal(currentResponder(w),'A');
 passPriority(w,players[0]);passPriority(w,players[1]);
 assert.equal(w.stage,'ready');
 assert.equal(finishTop(w,players).cardId,'089');
 assert.equal(currentResponder(w),'C');
 passPriority(w,players[2]);passPriority(w,players[0]);
 assert.equal(finishTop(w,players).cardId,'080');
 assert.equal(currentResponder(w),'B');
 passPriority(w,players[1]);passPriority(w,players[2]);
 assert.equal(finishTop(w,players).cardId,'005');
 assert.equal(w.stage,'done');
});
test('only verified card 007 draws four for each player',()=>{
 assert.equal(VERIFIED_EFFECTS['007'].count,4);
 assert.equal(VERIFIED_EFFECTS['006'],undefined);
 const room={players:players.map(p=>({...p,hand:[]}))};
 const result=applyVerifiedCard(room,{cardId:'007'},(r,p,count)=>{p.hand.push(...Array(count).fill('X'));return count;});
 assert.equal(result.automated,true);
 assert.deepEqual(room.players.map(p=>p.hand.length),[4,4,4]);
 const unknown=applyVerifiedCard(room,{cardId:'006'},()=>{throw Error('should not execute')});
 assert.equal(unknown.automated,false);
});
test('no malformed priority state is accepted',()=>{
 const w=createPriority(players,players[0],card('007'));
 assert.throws(()=>finishTop(w,players),/먼저 대응/);
 assert.throws(()=>playResponse(w,players,players[0],card('080')), /현재 대응/);
});
