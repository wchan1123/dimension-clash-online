import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {randomBytes,randomInt} from 'node:crypto';
import {CARDS} from './cards.js';
import {advanceTurn} from './turns.js';
import {VERIFIED_EFFECTS,createPriority,currentResponder,passPriority,playResponse,finishTop,applyVerifiedCard} from './effects.js';
const app=express(),http=createServer(app),io=new Server(http),rooms=new Map(),sessions=new Map();
app.use(express.static('public'));
app.get('/api/cards',(_q,r)=>r.json(CARDS));
const id=()=>randomBytes(10).toString('hex');
const shuffle=a=>{for(let i=a.length-1;i>0;i--){let j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const card=(r,c)=>r.cards.find(x=>x.id===c);
const log=(r,t)=>{r.logs.unshift(t);r.logs.length=Math.min(60,r.logs.length)};
const visible=(r,p)=>({code:r.code,me:p.id,owner:r.owner,status:r.status,turn:r.turn,rounds:r.rounds,left:r.left,winner:r.winner,players:r.players.map(x=>({id:x.id,name:x.name,count:x.hand.length,traps:x.traps.length,connected:x.connected,seated:!!x.seated,x:x.x??0,z:x.z??0,angle:x.angle??0,revealedTraps:r.field.includes('119')?x.traps.map(t=>card(r,t)):null})),hand:p.hand.map(x=>card(r,x)),myTraps:p.traps.map(x=>card(r,x)),deck:r.deck.length,discard:r.discard.slice(-12).reverse().map(x=>card(r,x)),field:r.field.map(x=>card(r,x)),logs:r.logs,showcase:r.showcase||null,pending:r.pending?{...r.pending,responses:r.pending.responses.map(x=>({name:x.name,choice:x.choice}))}:null,catalog:r.cards});
const send=r=>r.players.forEach(p=>p.socket&&io.to(p.socket).emit('state',visible(r,p)));
function consume(r,actorId,cardId){const p=r.players.find(x=>x.id===actorId);if(!p)return;const index=p.hand.indexOf(cardId);if(index>=0){p.hand.splice(index,1);const c=card(r,cardId);if(c.type==='field')r.field.push(cardId);else if(c.type==='trap')p.traps.push(cardId);else r.discard.push(cardId);}}
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
function action(s,name,fn){s.on(name,(data={},cb)=>{const a=get(s,cb);if(!a)return;try{const e=fn(a.r,a.p,data);if(e)return respond(cb,e);send(a.r);respond(cb);}catch(e){console.error(name,e);respond(cb,'요청 처리 실패');}});}
io.on('connection',s=>{
s.on('create',({name}={},cb)=>{name=String(name||'').trim().slice(0,20);if(!name)return respond(cb,'이름을 입력하세요');let code;do{code=randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(code));const p={id:id(),token:id(),name,hand:[],traps:[],socket:s.id,connected:true,seated:false,x:0,z:7.2,angle:0},r={code,owner:p.id,players:[p],cards:structuredClone(CARDS),deck:[],discard:[],field:[],logs:[],rounds:5,left:5,turn:0,status:'lobby',winner:null,pending:null,showcase:null};rooms.set(code,r);sessions.set(s.id,{room:code,player:p.id});s.join(code);log(r,name+'님이 방을 만들었어요');send(r);cb?.({ok:true,code,token:p.token});});
s.on('join',({code,name,token}={},cb)=>{code=String(code||'').toUpperCase().trim();const r=rooms.get(code);if(!r)return respond(cb,'없는 방 코드입니다');let p=token?r.players.find(x=>x.token===token):null;if(p){p.socket=s.id;p.connected=true;}else{if(r.status!=='lobby')return respond(cb,'시작한 방에는 새로 들어갈 수 없어요');if(r.players.length>=8)return respond(cb,'최대 8명입니다');name=String(name||'').trim().slice(0,20);if(!name)return respond(cb,'이름을 입력하세요');p={id:id(),token:id(),name,hand:[],traps:[],socket:s.id,connected:true,seated:false,x:Math.sin(r.players.length*Math.PI/4)*7.2,z:Math.cos(r.players.length*Math.PI/4)*7.2,angle:0};r.players.push(p);log(r,name+'님이 입장했어요');}sessions.set(s.id,{room:code,player:p.id});s.join(code);send(r);cb?.({ok:true,code,token:p.token});});
action(s,'rounds',(r,p,{count})=>{if(p.id!==r.owner||r.status!=='lobby')return '방장만 게임 전에 설정할 수 있어요';count=Number(count);if(!Number.isInteger(count)||count<1||count>100)return '1~100바퀴만 가능해요';r.rounds=count;r.left=count;log(r,'전체 '+count+'바퀴 설정');});
action(s,'start',(r,p)=>{if(p.id!==r.owner)return '방장만 시작할 수 있어요';if(r.status!=='lobby')return '진행 중입니다';if(r.players.length<2)return '2명 이상 필요해요';r.deck=shuffle(r.cards.map(x=>x.id));r.discard=[];r.field=[];r.players.forEach(x=>{x.hand=[];x.traps=[];draw(r,x,3)});r.left=r.rounds;r.turn=0;r.winner=null;r.pending=null;r.showcase=null;r.status='playing';log(r,'게임 시작: 플레이어마다 3장 배분');});
action(s,'next',(r,p)=>{if(r.status!=='playing'||r.players[r.turn].id!==p.id)return '현재 플레이어만 턴을 종료해요';if(r.pending)return '카드 반응 처리 중에는 턴을 종료할 수 없어요';const v=advanceTurn({turn:r.turn,playerCount:r.players.length,roundsRemaining:r.left});r.turn=v.turn;r.left=v.roundsRemaining;if(v.roundFinished)log(r,'한 바퀴 완료! 남은 바퀴 '+r.left);if(!r.left){r.status='finished';log(r,'설정한 바퀴가 종료되었습니다');}else log(r,r.players[r.turn].name+'님 차례');});
action(s,'draw',(r,p,{count=1,where='top'})=>{if(r.status!=='playing'||r.players[r.turn].id!==p.id)return '내 턴에만 뽑을 수 있어요';if(r.pending)return '반응 처리 중에는 일반 카드 뽑기를 할 수 없어요';count=Number(count);if(!Number.isInteger(count)||count<1||count>10)return '1~10장만 가능해요';const n=draw(r,p,count,where==='bottom'?'bottom':'top');if(!n)return '뽑는 더미가 비었어요';log(r,p.name+'님이 '+n+'장 뽑았어요');});
action(s,'move',(r,p,{cardId,destination,targetId})=>{if(r.status!=='playing')return '게임이 진행 중이 아닙니다';if(r.pending&&!(r.pending.stage==='ready'&&r.pending.stack.at(-1).actorId===p.id))return '현재 효과 처리 순서가 아닙니다';if(!r.pending&&r.players[r.turn].id!==p.id)return '내 차례에만 일반 카드 조작을 할 수 있어요';const index=p.hand.indexOf(cardId);if(index<0)return '내 손패에 없는 카드입니다';const c=card(r,cardId);if(c.type==='joker'&&!['player','deckTop','deckBottom'].includes(destination))return '조커를 이 위치로 이동할 수 없어요';
 if(destination==='field'&&c.type!=='field')return '필드 영역에는 필드 카드만 놓을 수 있습니다';
 if(destination==='trap'&&c.type!=='trap')return '함정 구역에는 함정 카드만 설치할 수 있습니다';const target=r.players.find(x=>x.id===targetId);if(destination==='player'&&!target)return '대상을 선택하세요';if(!['discard','trap','field','deckTop','deckBottom','player'].includes(destination))return '잘못된 위치';p.hand.splice(index,1);if(destination==='discard')r.discard.push(cardId);if(destination==='trap')p.traps.push(cardId);if(destination==='field')r.field.push(cardId);if(destination==='deckTop')r.deck.push(cardId);if(destination==='deckBottom')r.deck.unshift(cardId);if(destination==='player')target.hand.push(cardId);log(r,p.name+': '+c.name+' → '+(destination==='player'?target.name:destination));if(['field','trap'].includes(destination))r.showcase={cardId,cardName:c.name,actorName:p.name,actorId:p.id,at:Date.now()};});
action(s,'manual',(r,p,{type,targetId,count=1})=>{if(r.status!=='playing')return '게임이 진행 중이 아닙니다';if(r.pending&&!(r.pending.stage==='ready'&&r.pending.stack.at(-1).actorId===p.id))return '현재 효과 처리 순서가 아닙니다';if(!r.pending&&r.players[r.turn].id!==p.id)return '내 차례에만 일반 카드 조작을 할 수 있어요';const target=r.players.find(x=>x.id===targetId)||p;count=Number(count);if(!Number.isInteger(count)||count<1||count>10)return '1~10장만 가능해요';if(type==='draw'){const n=draw(r,target,count);if(!n)return '뽑는 더미가 비었어요';log(r,p.name+'님이 '+target.name+'에게 '+n+'장 지급');}else if(type==='randomDiscard'){const options=target.hand.filter(x=>card(r,x).type!=='joker');if(!options.length)return '버릴 수 있는 카드가 없어요';const c=options[randomInt(options.length)];target.hand.splice(target.hand.indexOf(c),1);r.discard.push(c);log(r,target.name+'님이 무작위로 한 장 버렸어요');}else if(type==='takeDiscard'){if(!r.discard.length)return '버린 카드 없음';target.hand.push(r.discard.pop());log(r,target.name+'님이 버린 더미에서 한 장 가져왔어요');}else return '알 수 없는 동작';});
action(s,'declare',(r,p)=>{if(r.status!=='playing'||p.hand.length<10)return '게임 중 손패 10장 이상이어야 해요';r.winner=p.id;r.status='finished';log(r,p.name+'님이 아마겟돈! 승리를 선언했어요');});
action(s,'editCard',(r,p,{cardId,type,description})=>{if(p.id!==r.owner)return '방장만 카드 정보를 바꿀 수 있어요';const c=card(r,cardId);if(!c)return '존재하지 않는 카드';if(!['action','field','trap','counter','joker'].includes(type))return '잘못된 유형';const locked={'070':'counter','118':'field','119':'field','120':'joker'};
  if(locked[cardId]&&locked[cardId]!==type)return '원본에서 확인된 카드 유형은 바꿀 수 없어요';
  c.type=type;c.description=String(description||'').slice(0,1000);});
action(s,'announce',(r,p,{cardId,targetId})=>{
  if(r.status!=='playing')return '게임이 진행 중이지 않아요';
  if(r.players[r.turn].id!==p.id)return '사용 선언은 현재 플레이어만 할 수 있어요';
  if(r.pending)return '기존 카드 반응부터 처리하세요';
  if(!p.hand.includes(cardId))return '내 손패에 없는 카드입니다';
  const chosen=card(r,cardId);
  r.pending=createPriority(r.players,p,chosen,targetId||null);
  r.showcase={cardId,cardName:chosen.name,actorName:p.name,actorId:p.id,at:Date.now()};
  log(r,p.name+'님이 '+chosen.name+' 사용 선언. 다음 반응: '+r.players.find(x=>x.id===currentResponder(r.pending))?.name);
});
action(s,'react',(r,p,{choice,cardId})=>{
  const w=r.pending;
  if(!w)return '반응할 카드가 없어요';
  if(currentResponder(w)!==p.id)return '현재 '+(r.players.find(x=>x.id===currentResponder(w))?.name||'다른 플레이어')+'님의 반응 순서입니다';
  if(choice==='pass'){passPriority(w,p);log(r,p.name+'님이 패스했습니다');}
  else if(choice==='counter'){
    if(!cardId)return '대응할 카드를 선택하세요';
    const chosen=card(r,cardId);
    if(!chosen)return '존재하지 않는 카드입니다';
    const previous=w.stack.at(-1);
    if(cardId==='070'&&card(r,previous.cardId)?.type!=='action')return '와 샌즈!는 행동 카드에만 사용할 수 있습니다';
    if(cardId!=='070')w.unknownResponse=true;
    const inHand=p.hand.includes(cardId),inTrap=p.traps.includes(cardId);
    if(!inHand&&!inTrap)return '내가 가지고 있거나 설치한 카드가 아닙니다';
    const source=inTrap?'trap':'hand';
    playResponse(w,r.players,p,chosen,source);
    const list=source==='trap'?p.traps:p.hand;
    list.splice(list.indexOf(cardId),1);
    r.discard.push(cardId);
    log(r,p.name+'님이 '+chosen.name+' 대응 선언 (효과는 원본 규칙대로 수동 확인)');
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
action(s,'restart',(r,p)=>{if(p.id!==r.owner)return '방장만 초기화할 수 있어요';r.status='lobby';r.players.forEach(x=>{x.hand=[];x.traps=[]});r.deck=[];r.field=[];r.discard=[];r.left=r.rounds;r.turn=0;r.winner=null;r.pending=null;r.showcase=null;});

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
 if(Math.hypot(x-p.x,z-p.z)>Math.max(.55,elapsed*7.5))return;
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
