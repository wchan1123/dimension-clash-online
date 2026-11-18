// Only effects verified against the original Figma card faces belong here.
// Unknown effects intentionally remain manual rather than guessing.
export const VERIFIED_EFFECTS=Object.freeze({
  '007': {type:'draw_all',count:4,source:'Figma card 007: 모든 플레이어가 카드를 4장씩 뽑습니다.'}
});
export function clockwiseOrder(players,actingId){
  const start=players.findIndex(p=>p.id===actingId);
  if(start<0)throw new Error('Unknown acting player');
  return Array.from({length:players.length-1},(_,i)=>players[(start+i+1)%players.length].id);
}
export function createPriority(players,actorId,cardId,cardName,targetId){
  return {actorId,actorName:players.find(p=>p.id===actorId).name,cardId,cardName,targetId:targetId||null,
    order:clockwiseOrder(players,actorId),cursor:0,responses:[],counter:null,stage:players.length>1?'responding':'ready'};
}
export function currentResponder(pending){return pending?.stage==='responding'?pending.order[pending.cursor]||null:null;}
export function passPriority(pending,player){
  if(currentResponder(pending)!==player.id)throw new Error('현재 대응 순서가 아닙니다');
  pending.responses.push({playerId:player.id,name:player.name,choice:'pass'});
  pending.cursor+=1;
  if(pending.cursor>=pending.order.length)pending.stage='ready';
}
export function playCounter(pending,player,cardId,players){
  if(currentResponder(pending)!==player.id)throw new Error('현재 대응 순서가 아닙니다');
  if(cardId!=='080')throw new Error('검증된 대응 카드만 자동 처리할 수 있습니다');
  if(!player.hand.includes(cardId))throw new Error('손패에 없는 카운터입니다');
  player.hand.splice(player.hand.indexOf(cardId),1);
  pending.responses.push({playerId:player.id,name:player.name,choice:'counter',cardId});
  pending.counter={actorId:player.id,cardId,negates:pending.cardId};
  pending.order=clockwiseOrder(players,player.id);pending.cursor=0;
  pending.stage=pending.order.length?'responding':'ready';
}
export function drawAllEffect(players,drawFn,count=4){
  let total=0;
  for(const p of players)total+=drawFn(p,count);
  return total;
}
