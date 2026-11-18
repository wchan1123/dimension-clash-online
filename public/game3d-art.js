import * as THREE from '/vendor/three.module.js';
const palette=['#65efc3','#ff9a8b','#99b8ff','#efb5fa','#ffe09a','#7ce1e9','#fb829f','#bda5ff'];
const cardW=.58,cardH=.81;
function imageCanvas(w=512,h=512){const c=document.createElement('canvas');c.width=w;c.height=h;return [c,c.getContext('2d')];}
function makeSurface(){
 const [c,x]=imageCanvas(1024);
 const bg=x.createRadialGradient(512,485,20,512,512,700);bg.addColorStop(0,'#392051');bg.addColorStop(.55,'#2c1743');bg.addColorStop(1,'#150d29');x.fillStyle=bg;x.fillRect(0,0,1024,1024);
 x.save();x.translate(512,512);x.rotate(-.32);
 const orbit=(w,h,color,stroke)=>{x.beginPath();x.ellipse(0,0,w,h,0,0,Math.PI*2);x.lineWidth=stroke;x.strokeStyle=color;x.stroke()};
 orbit(463,245,'#74f5cc',15);orbit(360,170,'#8a5bb8',5);orbit(220,345,'#80f6c955',4);
 x.restore();
 for(let i=0;i<80;i++){const n=(i*199+29)%1001,k=(i*317+313)%1021;
   const d=Math.hypot(n-512,k-512);if(d>478)continue;
   x.fillStyle=i%5?'#96f6d0aa':'#f2ac91';x.beginPath();x.arc(n,k,(i%9===0?4:2),0,Math.PI*2);x.fill();
 }
 x.textAlign='center';x.fillStyle='#8efad5';x.font='bold 52px sans-serif';x.fillText('✦',512,533);
 x.fillStyle='#fdf0d1';x.font='bold 26px sans-serif';x.fillText('DIMENSION CLASH',512,580);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}
function material(color,metalness=.15,roughness=.55){return new THREE.MeshStandardMaterial({color,metalness,roughness})}
function piece(parent,geo,mat,pos,rot=null){const o=new THREE.Mesh(geo,mat);o.position.set(...pos);if(rot)o.rotation.set(...rot);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
function sphere(parent,r,color,pos){return piece(parent,new THREE.SphereGeometry(r,16,12),material(color),pos)}
function bar(parent,w,h,d,color,pos,rot){return piece(parent,new THREE.BoxGeometry(w,h,d),material(color),pos,rot)}
function labelTexture(text,color='#7df5cc'){
 const [canvas,c]=imageCanvas(512,128);c.fillStyle='#1a0d2ddd';c.beginPath();c.roundRect(8,5,496,114,24);c.fill();c.strokeStyle=color;c.lineWidth=5;c.stroke();
 c.fillStyle='#fff4e4';c.textAlign='center';c.font='bold 46px "Malgun Gothic",sans-serif';c.fillText(String(text).slice(0,15),256,84);
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
}
export function buildBoard(scene){
 const root=new THREE.Group();scene.add(root);
 const base=piece(root,new THREE.CylinderGeometry(3.75,3.5,.30,96),material(0x291735,.28,.42),[0,1.11,0]);
 piece(root,new THREE.CylinderGeometry(3.53,3.48,.04,96),new THREE.MeshStandardMaterial({map:makeSurface(),metalness:.06,roughness:.65}),[0,1.30,0]);
 const rim=piece(root,new THREE.TorusGeometry(3.62,.075,12,96),new THREE.MeshBasicMaterial({color:0x7cf5c9}),[0,1.32,0],[-Math.PI/2,0,0]);
 piece(root,new THREE.CylinderGeometry(.82,1.02,1.10,24),material(0x24152f,.4,.35),[0,.49,0]);
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4,xx=Math.sin(a)*4.42,zz=Math.cos(a)*4.42;
  const chair=new THREE.Group();chair.position.set(xx,0,zz);chair.rotation.y=a;root.add(chair);
  bar(chair,1.1,.18,.94,0x524074,[0,.69,0]);bar(chair,1.15,.95,.19,0x554279,[0,1.13,.44]);bar(chair,1.03,.56,.09,0x8667a9,[0,1.26,.56]);
  for(const dx of [-.37,.37]){bar(chair,.12,.62,.12,0x281e38,[dx,.31,.28]);bar(chair,.12,.62,.12,0x281e38,[dx,.31,-.28]);}
 }
 const deckAnchor=new THREE.Group();deckAnchor.position.set(-1.42,1.37,.05);root.add(deckAnchor);
 const graveAnchor=new THREE.Group();graveAnchor.position.set(1.42,1.37,.05);root.add(graveAnchor);
 const fieldAnchor=new THREE.Group();fieldAnchor.position.set(0,1.37,-.72);root.add(fieldAnchor);
 const ring=piece(root,new THREE.RingGeometry(.38,.43,56),new THREE.MeshBasicMaterial({color:0xbba3f7,side:THREE.DoubleSide,transparent:true,opacity:.7}),[0,1.36,-.72],[-Math.PI/2,0,0]);
 const trapAnchors=[];for(let i=0;i<8;i++){const a=i*Math.PI/4;const anchor=new THREE.Group();anchor.position.set(Math.sin(a)*2.75,1.37,Math.cos(a)*2.75);anchor.rotation.y=a;root.add(anchor);trapAnchors.push(anchor)}
 return {root,deckAnchor,graveAnchor,fieldAnchor,trapAnchors};
}
const textureCache=new Map(),pendingImages=new Map();
function sheetIndex(id){return String(Math.ceil(Number(id)/9)).padStart(2,'0')}
export function cardTexture(id,backImage){
 if(!id)return backImage?.texture||null;
 if(textureCache.has(id))return textureCache.get(id);
 if(pendingImages.has(id))return null;
 const im=new Image();pendingImages.set(id,im);
 im.onload=()=>{
   const [c,x]=imageCanvas(320,446);const col=(Number(id)-1)%3,row=Math.floor(((Number(id)-1)%9)/3);
   const width=im.naturalWidth/3,height=im.naturalHeight/3;
   x.fillStyle='#faf7fc';x.fillRect(0,0,320,446);
   x.drawImage(im,col*width+width*.055,row*height+height*.035,width*.88,height*.91,0,0,320,446);
   const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;textureCache.set(id,t);pendingImages.delete(id);
 };
 im.onerror=()=>pendingImages.delete(id);
 im.src='/sheets/'+sheetIndex(id)+'.png';
 return null;
}
export function loadBack(){
 const state={texture:null};
 const loader=new THREE.TextureLoader();
 loader.load('/card-back.webp',t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;state.texture=t;},undefined,()=>{});
 return state;
}
export function placeCard(parent,frontId,back,offset=0){
 const geo=new THREE.BoxGeometry(cardW,.022,cardH);
 const sides=material(0xe0d3b8);
 const face=cardTexture(frontId,back)||back.texture;
 const surface=face?new THREE.MeshBasicMaterial({map:face}):material(0x55326e);
 const obj=new THREE.Mesh(geo,[sides,sides,surface,surface,sides,sides]);
 // BoxGeometry face index 2 points up with the planar surface.
 obj.position.y=.03+offset*.023;obj.rotation.y=offset*.055;parent.add(obj);return obj;
}
function wipe(group){while(group.children.length){const obj=group.children[0];group.remove(obj);obj.traverse(o=>{o.geometry?.dispose?.();if(Array.isArray(o.material)){o.material.forEach(m=>m.dispose())}else o.material?.dispose?.()})}}
export function refreshBoard(board,state,back){
 if(!state)return;
 for(const group of [board.deckAnchor,board.graveAnchor,board.fieldAnchor,...board.trapAnchors])wipe(group);
 const count=Math.min(13,Math.max(0,state.deck||0));for(let i=0;i<count;i++)placeCard(board.deckAnchor,null,back,i);
 if(state.discard?.length)placeCard(board.graveAnchor,state.discard[0].id,back,0);
 if(state.field?.length)placeCard(board.fieldAnchor,state.field[0].id,back,0);
 for(let i=0;i<(state.players||[]).length;i++){const p=state.players[i],anchor=board.trapAnchors[i];if(!anchor)continue;for(let j=0;j<Math.min(5,p.traps);j++){const face=p.revealedTraps?.[j]?.id||null;const obj=placeCard(anchor,face,back,j);obj.position.x=(j-Math.min(4,p.traps-1)/2)*.17;}}
}
export function makeHuman(scene,p){
 const g=new THREE.Group();scene.add(g);const primary=palette[Math.abs(p.name.length*3)%palette.length];
 const materialSkin=material(0xffcaa8),pants=material(0x30283f),shirt=material(new THREE.Color(primary));
 const hips=new THREE.Group();g.add(hips);const chest=piece(hips,new THREE.CapsuleGeometry(.30,.44,4,12),shirt,[0,1.15,0]);chest.scale.set(1.1,1,0.8);
 sphere(hips,.225,0xffd2b5,[0,1.82,0]);sphere(hips,.235,0x39213f,[0,2.01,-.05]);
 sphere(hips,.06,0x171225,[-.09,1.82,.203]);sphere(hips,.06,0x171225,[.09,1.82,.203]);
 const leftArm=new THREE.Group(),rightArm=new THREE.Group(),leftLeg=new THREE.Group(),rightLeg=new THREE.Group();
 for(const [limb,x] of [[leftArm,-.40],[rightArm,.40]]){limb.position.set(x,1.49,0);hips.add(limb);piece(limb,new THREE.CapsuleGeometry(.105,.38,4,10),shirt,[0,-.31,0]);sphere(limb,.11,0xffd2b5,[0,-.64,0]);}
 for(const [limb,x] of [[leftLeg,-.18],[rightLeg,.18]]){limb.position.set(x,.85,0);hips.add(limb);piece(limb,new THREE.CapsuleGeometry(.13,.48,3,10),pants,[0,-.4,0]);}
 const name=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture(p.name),transparent:true,depthTest:false}));name.scale.set(1.8,.45,1);name.position.y=2.65;g.add(name);
 const animator={g,hips,leftArm,rightArm,leftLeg,rightLeg,p,id:p.id,walk:0,sit:!!p.seated};
 return animator;
}
export function animateHuman(h,time,walking=false,seated=false){
 h.sit=seated;const phase=time*4.6;
 h.hips.position.y=seated?-.38:Math.sin(phase)*.012;
 if(seated){
  h.leftLeg.rotation.x=-1.16;h.rightLeg.rotation.x=-1.16;
  h.leftArm.rotation.x=-.5;h.rightArm.rotation.x=-.5;
 }else if(walking){
  h.leftArm.rotation.x=Math.sin(phase)*.38;h.rightArm.rotation.x=-Math.sin(phase)*.38;
  h.leftLeg.rotation.x=-Math.sin(phase)*.45;h.rightLeg.rotation.x=Math.sin(phase)*.45;
 }else{
  h.leftArm.rotation.x=-.12+Math.sin(time*1.4)*.04;h.rightArm.rotation.x=-.12-Math.sin(time*1.4)*.04;
  h.leftLeg.rotation.x=0;h.rightLeg.rotation.x=0;
 }
 h.hips.rotation.z=Math.sin(time*.95)*.009;
}
export function createOverlayGraphics(){
 const [c,x]=imageCanvas(1024,512);
 const bg=x.createLinearGradient(0,0,1024,512);bg.addColorStop(0,'#241136');bg.addColorStop(1,'#4e2569');x.fillStyle=bg;x.fillRect(0,0,1024,512);
 for(let i=0;i<65;i++){const xx=(i*173)%1024,yy=(i*257)%512;x.fillStyle=i%4?'#71efca':'#e7a1a4';x.beginPath();x.arc(xx,yy,2+i%3,0,Math.PI*2);x.fill();}
 x.strokeStyle='#7ef7cb';x.lineWidth=12;x.strokeRect(25,25,974,462);
 x.font='bold 90px sans-serif';x.textAlign='center';x.fillStyle='#fff1d8';x.fillText('차원대충돌!',512,257);
 return c.toDataURL('image/png');
}