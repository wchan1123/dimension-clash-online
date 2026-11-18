import {test,expect} from '@playwright/test';
test('mobile game: create, join, private cards, preview, reaction and turn',async({browser})=>{
 const contextA=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 const contextB=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 const a=await contextA.newPage(),b=await contextB.newPage();
 const errors=[];a.on('pageerror',e=>errors.push('A: '+e.message));b.on('pageerror',e=>errors.push('B: '+e.message));
 a.on('dialog',dialog=>dialog.accept());b.on('dialog',dialog=>dialog.accept());
 try{
  await a.goto('/');
  await expect(a.locator('#connection')).toContainText('연결됨');
  await a.locator('#nickname').fill('휴대폰A');
  await a.locator('#create').click();
  await expect(a.locator('#app')).toBeVisible();
  const code=(await a.locator('#code').textContent()).trim();
  expect(code).toMatch(/^[0-9A-F]{6}$/);
  await b.goto('/');
  await b.locator('#nickname').fill('휴대폰B');
  await b.locator('#roomcode').fill(code);
  await b.locator('#join').click();
  await expect(b.locator('#players .player')).toHaveCount(2);
  await a.locator('#start').click();
  await expect(a.locator('#hand .card')).toHaveCount(3);
  await expect(b.locator('#hand .card')).toHaveCount(3);
  for(const page of [a,b]){
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
   expect(overflow,'mobile page must not scroll horizontally').toBeLessThanOrEqual(3);
   const css=await page.locator('#hand .card').first().evaluate(el=>getComputedStyle(el).backgroundSize);
   expect(css).toContain('333.333%');
  }
  await a.locator('#hand .card').first().click();
  await expect(a.locator('#previewOverlay')).toHaveClass(/open/);
  await expect(a.locator('#previewArt .card-art')).toBeVisible();
  await a.locator('#closePreview').click();
  await expect(a.locator('#previewOverlay')).not.toHaveClass(/open/);
  const first=a.locator('#hand .card').filter({hasNot:a.locator('[data-card="007"]')}).first();
  // Announce whichever card is actually in hand; verified 007 is allowed to auto-resolve.
  await a.locator('#hand .card').first().click();
  await a.locator('#announceCard').click();
  await expect(b.locator('#reactionPanel')).toBeVisible();
  await expect(b.locator('#reactionPanel')).toContainText('대응 우선권');
  await b.locator('#reactionPanel button').filter({hasText:'패스'}).click();
  if(await a.locator('#reactionPanel button').filter({hasText:'효과 확인 후'}).count()){
   await a.locator('#reactionPanel button').filter({hasText:'효과 확인 후'}).click();
  }
  await a.locator('#next').click();
  await expect(b.locator('#current')).toContainText('휴대폰B');
  expect(errors).toEqual([]);
 }finally{await contextA.close();await contextB.close();}
});
test('mobile 320px viewport shows usable lobby',async({browser})=>{
 const context=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true});
 try{const p=await context.newPage();await p.goto('/');
  await expect(p.locator('#create')).toBeVisible();
  const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(3);
  const height=await p.locator('#create').evaluate(el=>el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(44);
 }finally{await context.close();}
});
