// Solo-play bots use the exact same server-side deck, priority and turn rules as humans.
// The bot never invents effects for unverified cards.
export function chooseBotTurn(bot,r){
 if(r.status!=='playing')return {type:'wait'};
 if(r.pending)return {type:'wait'};
 if(bot.hand.length>=10)return {type:'win'};
 if(!bot.drawnThisTurn&&r.deck.length)return {type:'draw',count:1};
 const known=['007'];
 const usable=bot.hand.find(id=>known.includes(id));
 if(usable&&!bot.playedThisTurn)return {type:'announce',cardId:usable};
 const field=bot.hand.find(id=>r.cards.find(c=>c.id===id)?.type==='field');
 if(field&&!bot.playedThisTurn)return {type:'move',cardId:field,destination:'field'};
 const trap=bot.hand.find(id=>r.cards.find(c=>c.id===id)?.type==='trap');
 if(trap&&!bot.playedThisTurn)return {type:'move',cardId:trap,destination:'trap'};
 return {type:'next'};
}
export function chooseBotResponse(bot,r){
 const w=r.pending;
 if(!w||w.stage!=='responding'||w.order[w.cursor]!==bot.id)return {type:'wait'};
 const top=w.stack.at(-1);
 const topCard=r.cards.find(c=>c.id===top?.cardId);
 // 070 is confirmed to negate an action effect. Other counters remain human-judged.
 if(topCard?.type==='action'&&bot.hand.includes('070')&&w.stack.length<6)
   return {type:'counter',cardId:'070'};
 return {type:'pass'};
}
export function botName(index){return '우주 AI '+index;}
