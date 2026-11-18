import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {randomBytes,randomInt} from 'node:crypto';
import {CARDS} from './cards.js';
import {advanceTurn} from './turns.js';
import {chooseBotTurn,chooseBotResponse,botName} from './ai.js';
import {VERIFIED_EFFECTS,createPriority,currentResponder,passPriority,playResponse,finishTop,applyVerifiedCard} from './effects.js';
const app=express(),http=createServer(app),io=new Server(http),rooms=new Map(),sessions=new Map();
app.use('/vendor',express.static('node_modules/three/build'));
app.use(express.static('public'));
app.get('/api/cards',(_q,r)=>r.json(CARDS));
const id=()=>randomBytes(10).toString('hex');
const shuffle=a=>{for(let i=a.length-1;i>0;i--){let j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const card=(r,c)=>r.cards.find(x=>x.id===c);
const log=(r,t)=>{r.logs.unshift(t);r.logs.length=Math.min(60,r.logs.length)};
const visible=(r,p)=>({code:r.code,me:p.id,owner:r.owner,status:r.status,turn:r.turn,rounds:r.rounds,left:r.left,winner:r.winner,players:r.players.map(x=>({id:x.id,name:x.name,count:x.hand.length,traps:x.traps.length,connected:x.connected,bot:!!x.bot,seated:!!x.seated,x:x.x??0,z:x.z??0,angle:x.angle??0,revealedTraps:r.field.includes('119')?x.traps.map(t=>card(r,t)):null})),hand:p.hand.map(x=>card(r,x)),myTraps:p.traps.map(x=>card(r,x)),deck:r.deck.length,discard:r.discard.slice(-12).reverse().map(x=>card(r,x)),field:r.field.map(x=>card(r,x)),logs:r.logs,turnAction:r.turnAction||null,actionEvent:r.actionEvent||null,showcase:r.showcase||null,trapReveal:r.trapReveal||null,pending:r.pending?{...r.pending,responses:r.pending.responses.map(x=>({name:x.name,choice:x.choice}))}:null,catalog:r.cards});
const send=r=>r.players.forEach(p=>p.socket&&io.to(p.socket).emit('state',visible(r,p)));
function event(r,p,kind,label,cardId=null){r.actionEvent={id:(r.eventSeq=(r.eventSeq||0)+1),actorId:p?.id||null,actorName:p?.name||'',kind,label,cardId,at:Date.now()};log(r,label);}
function win(r,p){const owners=r.players.filter(x=>x.traps.includes('081'));const redirected=owners.find(x=>x.id!==p.id);if(redirected){const i=redirected.traps.indexOf('081');redirected.traps.splice(i,1);r.discard.push('081');r.trapReveal={cardId:'081',cardName:card(r,'081').name,ownerId:redirected.id,ownerName:redirected.name,index:i,at:Date.now()};r.showcase={cardId:'081',cardName:card(r,'081').name,actorName:redirected.name,actorId:redirected.id,at:Date.now(),kind:'trap'};p=redirected;event(r,p,'trap',p.name+'의 영역전개! 승리를 가로챘습니다','081');}r.winner=p.id;r.status='finished';event(r,p,'win',p.name+'님이 아마겟돈 승리!');}
function advanceRoom(r){const v=advanceTurn({turn:r.turn,playerCount:r.players.length,roundsRemaining:r.left});r.turn=v.turn;r.left=v.roundsRemaining;if(v.roundFinished)log(r,'한 바퀴 완료 · 남은 바퀴 '+r.left);if(!r.left){r.status='finished';log(r,'설정한 바퀴가 종료되었습니다');}else log(r,r.players[r.turn].name+'님의 차례');r.turnAction=null;r.players.forEach(x=>{x.drawnThisTurn=false;x.playedThisTurn=false})}
function scheduleAI(r){if(!r.players.some(p=>p.bot)||r.aiQueued)return;r.aiQueued=true;setTimeout(()=>{r.aiQueued=false;try{stepAI(r)}catch(e){console.error('AI step',e)}},650)}
function stepAI(r){
 if(r.status!=='playing')return;
 const w=r.pending;
 if(w){
  const responder=r.players.find(p=>p.id===currentResponder(w));
  if(responder?.bot){
   const choice=chooseBotResponse(responder,r);
   if(choice.type==='pass'){passPriority(w,responder);log(r,responder.name+' 패스')}
   else if(choice.type==='counter'){const chosen=card(r,choice.cardId);playResponse(w,r.players,responder,chosen,'hand');responder.hand.splice(responder.hand.indexOf(choice.cardId),1);r.discard.push(choice.cardId);log(r,responder.name+' 카운터: '+chosen.name)}
   autoResolve(r);
  }else if(w.stage==='ready'&&r.players.find(p=>p.id===w.stack.at(-1)?.actorId)?.bot){
   autoResolve(r);
   if(r.pending?.stage==='ready'){const top=finishTop(w,r.players);if(w.stage==='done'){consume(r,top.actorId,top.cardId);r.pending=null;log(r,'AI 카드 수동 효과 생략')}}
  }else return;
 }else{
  const bot=r.players[r.turn];if(!bot?.bot)return;
  const choice=chooseBotTurn(bot,r);
  if(choice.type==='win'){win(r,bot)}
  else if(choice.type==='draw'){if(r.turnAction){advanceRoom(r)}else{const n=draw(r,bot,1);r.turnAction='draw';bot.drawnThisTurn=true;event(r,bot,'draw',bot.name+'님이 덱에서 1장 뽑았습니다')}}
  else if(choice.type==='announce'){if(r.turnAction)advanceRoom(r);else{const chosen=card(r,choice.cardId);r.turnAction='action';r.pending=createPriority(r.players,bot,chosen);r.showcase={cardId:chosen.id,cardName:chosen.name,actorName:bot.name,actorId:bot.id,at:Date.now()};bot.playedThisTurn=true;event(r,bot,'action',bot.name+'님이 '+chosen.name+' 행동카드 사용',chosen.id)}}
  else if(choice.type==='move'){const chosen=card(r,choice.cardId);if(chosen?.type===choice.destination){bot.hand.splice(bot.hand.indexOf(choice.cardId),1);if(choice.destination==='field'){while(r.field.length)r.discard.push(r.field.pop());r.field.push(choice.cardId);}if(choice.destination==='trap')bot.traps.push(choice.cardId);if(choice.destination==='field')r.showcase={cardId:chosen.id,cardName:chosen.name,actorName:bot.name,actorId:bot.id,at:Date.now(),kind:'field'};log(r,bot.name+' '+choice.destination+' 설치')}bot.playedThisTurn=true}
  else advanceRoom(r);
 }
 send(r);scheduleAI(r);
}

function consume(r,actorId,cardId){const p=r.players.find(x=>x.id===actorId);if(!p)return;const index=p.hand.indexOf(cardId);if(index>=0){p.hand.splice(index,1);const c=card(r,cardId);if(c.type==='field'){while(r.field.length)r.discard.push(r.field.pop());r.field.push(cardId);}else if(c.type==='trap')p.traps.push(cardId);else r.discard.push(cardId);}}
function autoResolve(r){
 const w=r.pending;
 if(!w||w.stage!=='ready')return;
 const top=w.stack.at(-1);
 if(!top)return;
 // A verified '와 샌즈!' negates only the immediately preceding action card.
 if(top.cardId==='070'&&w.stack.length>1&&!w.unknownResponse){
   const preceding=w.stack.at(-2);
   if(card(r,preceding.cardId)?.type==='action'){
     finishTop(w,r.players);
     w.cancelledCardIds??=[];
     w.cancelledCardIds.push(preceding.cardId);
     log(r,'와 샌즈! → '+preceding.cardName+' 행동 효과를 무효화했습니다.');
     return;
   }
 }
 // After all priority passes, a verified negation discards the original without its effect.
 if(w.stack.length===1&&w.cancelledCardIds?.includes(top.cardId)){
   finishTop(w,r.players);
   consume(r,top.actorId,top.cardId);
   log(r,top.cardName+' 무효화 완료');
   r.pending=null;
   return;
 }
 // Cards with unverified responses are always left for manual adjudication.
 if(w.stack.length===1&&!w.manualResponses&&VERIFIED_EFFECTS[top.cardId]){
   const resolved=finishTop(w,r.players);
   const result=applyVerifiedCard(r,resolved,draw);
   consume(r,resolved.actorId,resolved.cardId);
   log(r,resolved.cardName+': '+result.message);
   r.pending=null;
 }
}

const respond=(cb,error)=>cb?.(error?{ok:false,error}:{ok:true});
function get(s,cb){const ref=sessions.get(s.id),r=ref&&rooms.get(ref.room),p=r?.players.find(x=>x.id===ref.player);if(!p){respond(cb,'먼저 방에 들어가 주세요');return null;}return {r,p};}
function draw(r,p,n=1,where='top'){let x=0;while(x<n&&r.deck.length){p.hand.push((where==='bottom'||r.field.includes('118'))?r.deck.shift():r.deck.pop());x++;}return x;}
function action(s,name,fn){s.on(name,(data={},cb)=>{const a=get(s,cb);if(!a)return;try{const e=fn(a.r,a.p,data);if(e)return respond(cb,e);send(a.r);respond(cb);scheduleAI(a.r);}catch(e){console.error(name,e);respond(cb,'요청 처리 실패');}});}
io.on('connection',s=>{
s.on('create',({name}={},cb)=>{name=String(name||'').trim().slice(0,20);if(!name)return respond(cb,'이름을 입력하세요');let code;do{code=randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(code));const p={id:id(),token:id(),name,hand:[],traps:[],socket:s.id,connected:true,seated:false,x:0,z:7.2,angle:0},r={code,owner:p.id,players:[p],cards:structuredClone(CARDS),deck:[],discard:[],field:[],logs:[],rounds:5,left:5,turn:0,status:'lobby',winner:null,pending:null,showcase:null,trapReveal:null,turnAction:null,actionEvent:null,eventSeq:0};rooms.set(code,r);sessions.set(s.id,{room:code,player:p.id});s.join(code);log(r,name+'님이 방을 만들었어요');send(r);cb?.({ok:true,code,token:p.token});});
s.on('join',({code,name,token}={},cb)=>{code=String(code||'').toUpperCase().trim();const r=rooms.get(code);if(!r)return respond(cb,'없는 방 코드입니다');let p=token?r.players.find(x=>x.token===token):null;if(p){p.socket=s.id;p.connected=true;}else{if(r.status!=='lobby')return respond(cb,'시작한 방에는 새로 들어갈 수 없어요');if(r.players.length>=8)return respond(cb,'최대 8명입니다');name=String(name||'').trim().slice(0,20);if(!name)return respond(cb,'이름을 입력하세요');p={id:id(),token:id(),name,hand:[],traps:[],socket:s.id,connected:true,seated:false,x:Math.sin(r.players.length*Math.PI/4)*7.2,z:Math.cos(r.players.length*Math.PI/4)*7.2,angle:0};r.players.push(p);log(r,name+'님이 입장했어요');}sessions.set(s.id,{room:code,player:p.id});s.join(code);send(r);cb?.({ok:true,code,token:p.token});});
action(s,'addBot',(r,p,{count=1}={})=>{
 if(p.id!==r.owner||r.status!=='lobby')return '방장만 게임 시작 전에 AI를 추가할 수 있어요';
 count=Number(count);if(!Number.isInteger(count)||count<1||count>7)return '1~7명까지 추가 가능합니다';
 if(r.players.length+count>8)return '전체 플레이어는 최대 8명입니다';
 for(let i=0;i<count;i++){const n=r.players.filter(x=>x.bot).length+1,a=r.players.length*2*Math.PI/8;r.players.push({id:id(),name:botName(n),bot:true,token:null,hand:[],traps:[],socket:null,connected:true,seated:true,x:Math.sin(a)*4.4,z:Math.cos(a)*4.4,angle:a+Math.PI,drawnThisTurn:false,playedThisTurn:false})}
 log(r,'AI 상대 '+count+'명 입장');
});
action(s,'removeBot',(r,p)=>{
 if(p.id!==r.owner||r.status!=='lobby')return '방장만 게임 전에 AI를 제거할 수 있어요';
 const index=r.players.findLastIndex(x=>x.bot);
 if(index===-1)return '제거할 AI가 없습니다';
 r.players.splice(index,1);log(r,'AI 상대 제거');
});
if(process.env.NODE_ENV==='test')action(s,'testGrant',(r,p,{cards=[]}={})=>{
 if(p.id!==r.owner||r.status!=='playing')return 'test owner only';
 if(!Array.isArray(cards)||cards.length>10||cards.some(id=>!r.cards.some(c=>c.id===id)))return 'bad test fixture';
 for(const cid of cards){if(p.hand.includes(cid))continue;const j=r.deck.indexOf(cid);if(j<0)return 'fixture card not in deck';r.deck.splice(j,1);p.hand.push(cid);}
});
action(s,'rounds',(r,p,{count})=>{if(p.id!==r.owner||r.status!=='lobby')return '방장만 게임 전에 설정할 수 있어요';count=Number(count);if(!Number.isInteger(count)||count<1||count>100)return '1~100바퀴만 가능해요';r.rounds=count;r.left=count;log(r,'전체 '+count+'바퀴 설정');});
action(s,'start',(r,p)=>{if(p.id!==r.owner)return '방장만 시작할 수 있어요';if(r.status!=='lobby')return '진행 중입니다';if(r.players.length<2)return '2명 이상 필요해요. 혼자라면 AI 상대를 추가하세요';r.deck=shuffle(r.cards.map(x=>x.id));r.discard=[];r.field=[];r.players.forEach((x,i)=>{x.hand=[];x.traps=[];x.seated=!!x.bot;const a=i*2*Math.PI/r.players.length;x.x=Math.sin(a)*(x.bot?4.4:6.5);x.z=Math.cos(a)*(x.bot?4.4:6.5);x.angle=a+Math.PI;draw(r,x,3)});r.left=r.rounds;r.turn=0;r.winner=null;r.pending=null;r.showcase=null;r.trapReveal=null;r.turnAction=null;r.actionEvent=null;r.status='playing';log(r,'게임 시작: 플레이어마다 3장 배분');});
action(s,'next',(r,p)=>{if(r.status!=='playing'||r.players[r.turn].id!==p.id)return '현재 플레이어만 턴을 종료해요';if(r.pending)return '카드 반응 처리 중에는 턴을 종료할 수 없어요';advanceRoom(r);});
action(s,'draw',(r,p,{count=1,where='top'}={})=>{if(r.status!=='playing'||r.players[r.turn].id!==p.id)return '내 턴에만 뽑을 수 있어요';if(r.pending)return '반응 처리 중에는 뽑을 수 없어요';if(r.turnAction)return '이번 턴에는 이미 행동카드를 사용하거나 1장을 뽑았습니다';if(Number(count)!==1)return '기본 드로우는 정확히 1장만 가능합니다';const n=draw(r,p,1,where==='bottom'?'bottom':'top');if(!n)return '덱이 비었어요';r.turnAction='draw';event(r,p,'draw',p.name+'님이 덱에서 1장을 뽑았습니다');});
action(s,'move',(r,p,{cardId,destination,targetId})=>{if(r.status!=='playing')return '게임이 진행 중이 아닙니다';if(r.pending&&!(r.pending.stage==='ready'&&r.pending.stack.at(-1).actorId===p.id))return '현재 효과 처리 순서가 아닙니다';if(!r.pending&&r.players[r.turn].id!==p.id)return '내 차례에만 일반 카드 조작을 할 수 있어요';const index=p.hand.indexOf(cardId);if(index<0)return '내 손패에 없는 카드입니다';const c=card(r,cardId);if(c.type==='joker'&&!['player','deckTop','deckBottom'].includes(destination))return '조커를 이 위치로 이동할 수 없어요';
 if(destination==='field'&&c.type!=='field')return '필드 영역에는 필드 카드만 놓을 수 있습니다';
 if(destination==='trap'&&c.type!=='trap')return '함정 구역에는 함정 카드만 설치할 수 있습니다';const target=r.players.find(x=>x.id===targetId);if(destination==='player'&&!target)return '대상을 선택하세요';if(!['discard','trap','field','deckTop','deckBottom','player'].includes(destination))return '잘못된 위치';p.hand.splice(index,1);if(destination==='discard')r.discard.push(cardId);if(destination==='trap')p.traps.push(cardId);if(destination==='field'){while(r.field.length)r.discard.push(r.field.pop());r.field.push(cardId);}if(destination==='deckTop')r.deck.push(cardId);if(destination==='deckBottom')r.deck.unshift(cardId);if(destination==='player')target.hand.push(cardId);event(r,p,destination,p.name+'님: '+(destination==='trap'?'함정을 뒷면으로 설치':destination==='field'?'필드 카드 '+c.name+' 설치':c.name+' 이동'),destination==='trap'?null:cardId);if(destination==='field')r.showcase={cardId,cardName:c.name,actorName:p.name,actorId:p.id,at:Date.now(),kind:'field'};});
action(s,'triggerTrap',(r,p,{cardId}={})=>{
 if(r.status!=='playing')return '게임 진행 중에만 발동할 수 있어요';
 if(r.trapReveal)return '먼저 발동한 함정의 효과를 해결해 주세요';
 const idx=p.traps.indexOf(cardId);if(idx<0)return '내가 설치한 함정이 아닙니다';
 const c=card(r,cardId);if(c?.type!=='trap')return '함정 카드가 아닙니다';
 r.trapReveal={cardId,cardName:c.name,ownerId:p.id,ownerName:p.name,index:idx,at:Date.now()};
 r.showcase={cardId,cardName:c.name,actorName:p.name,actorId:p.id,at:Date.now(),kind:'trap'};
 event(r,p,'trap',p.name+'님의 함정 '+c.name+' 공개',cardId);
});
action(s,'finishTrap',(r,p)=>{
 const t=r.trapReveal;
 if(!t)return '공개된 함정이 없습니다';
 if(t.ownerId!==p.id)return '함정을 설치한 플레이어만 효과 처리를 마칠 수 있어요';
 const i=p.traps.indexOf(t.cardId);if(i>=0)p.traps.splice(i,1);
 r.discard.push(t.cardId);log(r,p.name+'님의 함정 효과 처리 완료 → 묘지');
 r.trapReveal=null;
});
action(s,'manual',(r,p,{type,targetId,count=1})=>{if(r.status!=='playing')return '게임이 진행 중이 아닙니다';if(r.pending&&!(r.pending.stage==='ready'&&r.pending.stack.at(-1).actorId===p.id))return '현재 효과 처리 순서가 아닙니다';if(!r.pending&&r.players[r.turn].id!==p.id)return '내 차례에만 일반 카드 조작을 할 수 있어요';const target=r.players.find(x=>x.id===targetId)||p;count=Number(count);if(!Number.isInteger(count)||count<1||count>10)return '1~10장만 가능해요';if(type==='draw'){const n=draw(r,target,count);if(!n)return '뽑는 더미가 비었어요';log(r,p.name+'님이 '+target.name+'에게 '+n+'장 지급');}else if(type==='randomDiscard'){const options=target.hand.filter(x=>card(r,x).type!=='joker');if(!options.length)return '버릴 수 있는 카드가 없어요';const c=options[randomInt(options.length)];target.hand.splice(target.hand.indexOf(c),1);r.discard.push(c);log(r,target.name+'님이 무작위로 한 장 버렸어요');}else if(type==='takeDiscard'){if(!r.discard.length)return '버린 카드 없음';target.hand.push(r.discard.pop());log(r,target.name+'님이 버린 더미에서 한 장 가져왔어요');}else return '알 수 없는 동작';});
action(s,'declare',(r,p)=>{if(r.status!=='playing'||p.hand.length<10)return '게임 중 손패 10장 이상이어야 해요';win(r,p);});
action(s,'editCard',(r,p,{cardId,type,description})=>{if(p.id!==r.owner)return '방장만 카드 정보를 바꿀 수 있어요';const c=card(r,cardId);if(!c)return '존재하지 않는 카드';if(!['action','field','trap','counter','joker'].includes(type))return '잘못된 유형';const locked={'070':'counter','118':'field','119':'field','120':'joker'};
  if(locked[cardId]&&locked[cardId]!==type)return '원본에서 확인된 카드 유형은 바꿀 수 없어요';
  c.type=type;c.description=String(description||'').slice(0,1000);});
action(s,'announce',(r,p,{cardId,targetId})=>{
  if(r.status!=='playing')return '게임이 진행 중이지 않아요';
  if(r.players[r.turn].id!==p.id)return '사용 선언은 현재 플레이어만 할 수 있어요';
  if(r.turnAction)return '이번 턴의 행동 또는 드로우를 이미 선택했습니다';
  if(r.pending)return '기존 카드 반응부터 처리하세요';
  if(!p.hand.includes(cardId))return '내 손패에 없는 카드입니다';
  const chosen=card(r,cardId);if(chosen.type!=='action')return '기본 사용 선언은 행동카드만 가능합니다';
  if(targetId!=null && (!r.players.some(x=>x.id===targetId)||targetId===p.id))return '유효한 상대 플레이어를 선택하세요';
  r.turnAction='action';r.pending=createPriority(r.players,p,chosen,targetId||null);
  r.showcase={cardId,cardName:chosen.name,actorName:p.name,actorId:p.id,targetId:targetId||null,at:Date.now(),kind:'action'};
  const recipient=r.players.find(x=>x.id===targetId);
  event(r,p,'action',p.name+'님이 '+(recipient?recipient.name+'님을 가리키며 ':'')+chosen.name+' 행동카드를 사용했습니다',cardId);
  r.actionEvent.targetId=targetId||null;
});
action(s,'react',(r,p,{choice,cardId,targetId})=>{
  const w=r.pending;
  if(!w)return '반응할 카드가 없어요';
  if(currentResponder(w)!==p.id)return '현재 '+(r.players.find(x=>x.id===currentResponder(w))?.name||'다른 플레이어')+'님의 반응 순서입니다';
  if(choice==='pass'){passPriority(w,p);log(r,p.name+'님이 패스했습니다');}
  else if(choice==='counter'){
    if(!cardId)return '대응할 카드를 선택하세요';
    const chosen=card(r,cardId);
    if(!chosen)return '존재하지 않는 카드입니다';
    if(chosen.type!=='counter' && chosen.type!=='trap')return '카운터 대응에는 카운터 또는 설치된 함정만 사용할 수 있습니다';
    if(targetId!=null && (!r.players.some(x=>x.id===targetId)||targetId===p.id))return '유효한 대응 대상을 선택하세요';
    const previous=w.stack.at(-1);
    if(cardId==='070'&&card(r,previous.cardId)?.type!=='action')return '와 샌즈!는 행동 카드에만 사용할 수 있습니다';
    if(cardId!=='070')w.unknownResponse=true;
    const inHand=p.hand.includes(cardId),inTrap=p.traps.includes(cardId);
    if(!inHand&&!inTrap)return '내가 가지고 있거나 설치한 카드가 아닙니다';
    const source=inTrap?'trap':'hand';
    playResponse(w,r.players,p,chosen,source,targetId||previous.actorId);
    const list=source==='trap'?p.traps:p.hand;
    list.splice(list.indexOf(cardId),1);
    r.discard.push(cardId);
    const recipient=r.players.find(x=>x.id===(targetId||previous.actorId));
    r.showcase={cardId,cardName:chosen.name,actorName:p.name,actorId:p.id,targetId:recipient?.id||null,kind:'counter',at:Date.now()};
    event(r,p,'counter',p.name+'님이 '+(recipient?recipient.name+'님에게 ':'')+chosen.name+' 카운터 선언',cardId);
    r.actionEvent.targetId=recipient?.id||null;
  }else return '잘못된 대응입니다';
  autoResolve(r);
});
action(s,'resolve',(r,p)=>{
  const w=r.pending;
  if(!w)return '대기 중인 선언이 없어요';
  if(w.stage!=='ready')return '모든 플레이어가 대응하거나 패스해야 합니다';
  if(w.stack.at(-1).actorId!==p.id)return '현재 스택 맨 위 카드의 사용자만 처리할 수 있습니다';
  const top=finishTop(w,r.players);
  log(r,top.actorName+'님의 '+top.cardName+' 대응 처리 완료');
  if(w.stage==='done'){
    consume(r,top.actorId,top.cardId);
    log(r,'원본 효과는 플레이어가 수동으로 확인한 뒤 처리했습니다');
    r.pending=null;
  } else log(r,'이전 카드로 돌아가며 대응 우선권을 다시 확인합니다');
});
action(s,'restart',(r,p)=>{if(p.id!==r.owner)return '방장만 초기화할 수 있어요';r.status='lobby';r.players.forEach(x=>{x.hand=[];x.traps=[]});r.deck=[];r.field=[];r.discard=[];r.left=r.rounds;r.turn=0;r.winner=null;r.pending=null;r.showcase=null;r.trapReveal=null;r.turnAction=null;r.actionEvent=null;});

const isNum=x=>typeof x==='number'&&Number.isFinite(x);
function seatPosition(r,p){const n=r.players.indexOf(p),a=2*Math.PI*n/Math.max(2,r.players.length);return {x:Math.sin(a)*4.4,z:Math.cos(a)*4.4};}
action(s,'sit',(r,p,{sit})=>{
 if(!!sit){
  const spot=seatPosition(r,p);
  if(Math.hypot(p.x-spot.x,p.z-spot.z)>3.4)return '내 좌석 가까이에서 E를 눌러주세요';
  p.seated=true;p.x=spot.x;p.z=spot.z;
 }else p.seated=false;
});
s.on('avatar',({x,z,angle}={})=>{
 const a=get(s);if(!a)return;const {p,r}=a;if(p.seated)return;
 if(!isNum(x)||!isNum(z)||!isNum(angle)||Math.abs(x)>12||Math.abs(z)>12)return;
 const now=Date.now(),elapsed=Math.min(0.25,Math.max(0.016,(now-(p.lastAvatar||now-75))/1000));
 if(Math.hypot(x-p.x,z-p.z)>Math.max(.7,elapsed*9))return;
 if(Math.hypot(x,z)<3.35)return;
 if(now-(p.lastAvatar||0)<45)return;
 p.x=x;p.z=z;p.angle=angle;p.lastAvatar=now;
 s.to(r.code).emit('avatar',{id:p.id,x,z,angle});
});
s.on('cursor',({x,y}={})=>{
 const a=get(s);if(!a)return;const {p,r}=a;const now=Date.now();
 if(!isNum(x)||!isNum(y)||x<0||x>1||y<0||y>1||now-(p.lastCursor||0)<45)return;
 p.lastCursor=now;s.to(r.code).emit('cursor',{id:p.id,name:p.name,x,y});
});

s.on('disconnect',()=>{const ref=sessions.get(s.id);if(!ref)return;const r=rooms.get(ref.room),p=r?.players.find(x=>x.id===ref.player);if(p&&p.socket===s.id){p.connected=false;p.socket=null;send(r)}sessions.delete(s.id);});
});
http.listen(Number(process.env.PORT)||3000,'0.0.0.0');
