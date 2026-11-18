// Engine supports deterministic, server-authoritative priority. Card effects are
// enabled only when their wording has been verified from the supplied Figma art.
export const VERIFIED_EFFECTS=Object.freeze({
  '007': {kind:'draw_all',count:4,source:'Figma 007: 모든 플레이어가 카드를 4장씩 뽑습니다.'},
  '070': {kind:'negate_action',source:'Figma 070: 사용된 행동카드의 효과를 무효화합니다.'},
  '118': {kind:'bottom_draw_field',source:'Figma 118: 덱 아래부터 뽑습니다.'},
  '119': {kind:'faceup_traps_field',source:'Figma 119: 모든 함정을 앞면으로 설치합니다. 새 함정도 앞면으로 설치합니다.'}
});
export function clockwiseOrder(players,actingId){
  const at=players.findIndex(x=>x.id===actingId);
  if(at<0)throw Error('unknown actor');
  return Array.from({length:players.length-1},(_,i)=>players[(at+i+1)%players.length].id);
}
export function createPriority(players,actor,card,targetId=null){
  if(players.length<2)throw Error('at least two players');
  return {actorId:actor.id,actorName:actor.name,cardId:card.id,cardName:card.name,targetId,
    stack:[{actorId:actor.id,actorName:actor.name,cardId:card.id,cardName:card.name,targetId,source:'hand'}],
    order:clockwiseOrder(players,actor.id),cursor:0,responses:[],stage:'responding',manualResponses:false};
}
export function currentResponder(w){return w?.stage==='responding'?w.order[w.cursor]||null:null;}
export function passPriority(w,p){
  if(currentResponder(w)!==p.id)throw Error('현재 대응 순서가 아닙니다');
  w.responses.push({playerId:p.id,name:p.name,choice:'pass',cardId:null});
  if(++w.cursor===w.order.length)w.stage='ready';
  return w;
}
export function playResponse(w,players,p,c,source='hand'){
  if(currentResponder(w)!==p.id)throw Error('현재 대응 순서가 아닙니다');
  w.responses.push({playerId:p.id,name:p.name,choice:'counter',cardId:c.id});
  w.stack.push({actorId:p.id,actorName:p.name,cardId:c.id,cardName:c.name,targetId:null,source});
  w.manualResponses=true;
  w.order=clockwiseOrder(players,p.id);w.cursor=0;w.stage='responding';
  return w;
}
export function finishTop(w,players){
  if(w.stage!=='ready')throw Error('먼저 대응 순서를 완료해야 합니다');
  const top=w.stack.pop();
  if(!top)throw Error('카운터 스택이 비었습니다');
  if(w.stack.length){
    const parent=w.stack.at(-1);
    w.order=clockwiseOrder(players,parent.actorId);w.cursor=0;w.stage='responding';
  }else w.stage='done';
  return top;
}
export function applyVerifiedCard(r,top,drawFn){
  const spec=VERIFIED_EFFECTS[top.cardId];
  if(!spec)return {automated:false,message:'원본 효과 수동 처리 필요'};
  if(spec.kind==='draw_all'){
    let count=0;
    for(const p of r.players)count+=drawFn(r,p,spec.count);
    return {automated:true,message:'전원 카드 '+spec.count+'장씩 뽑기 ('+count+'장 지급)'};
  }
  if(spec.kind==='bottom_draw_field')return {automated:true,message:'필드 발동: 카드 뽑기 방향을 덱 아래로 변경'};
  if(spec.kind==='faceup_traps_field')return {automated:true,message:'필드 발동: 설치된 함정 공개'};
  return {automated:false,message:'조건부 대응 효과'};
}
