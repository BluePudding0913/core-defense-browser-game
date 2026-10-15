const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.ENEMY_PREVIEW_BROWSER?{executablePath:process.env.ENEMY_PREVIEW_BROWSER}:{}),args:['--allow-file-access-from-files']});try{
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve('client/previews/enemy-models.html')).href);
 await page.waitForFunction(()=>window.enemyStudio);
 await page.evaluate(()=>enemyStudio.select('lab-poisoner'));await page.locator('#motion').click();
 await page.screenshot({path:'artifacts/poisoner/front.png'});
 await page.mouse.move(600,450);await page.mouse.down();await page.mouse.move(220,450);await page.mouse.up();
 await page.screenshot({path:'artifacts/poisoner/back.png'});
 await page.goto(pathToFileURL(path.resolve('client/previews/enemy-game.html')).href);
 await page.waitForFunction(()=>document.querySelector('#lab-scene')?.width>0);
 await page.locator('#walk').click();
 await page.evaluate(()=>{state.enemies.forEach((e,i)=>{e.type=['grunt','poisoner','poisoner'][i];e.y=145;});document.querySelector('.labels').innerHTML='<span>GRUNT</span><span>POISONER</span><span>POISONER</span>';});
 await page.screenshot({path:'artifacts/poisoner/game.png'});await page.locator('#light').click();await page.screenshot({path:'artifacts/poisoner/blackout.png'});
 if(errors.length)throw new Error(errors.join('\n'));console.log('Studio front/back and game normal/blackout captured without browser errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
