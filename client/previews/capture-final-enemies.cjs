const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.ENEMY_PREVIEW_BROWSER?{executablePath:process.env.ENEMY_PREVIEW_BROWSER}:{}),args:['--allow-file-access-from-files']});
 try{
  fs.mkdirSync('artifacts/final-enemies',{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('client/previews/enemy-models.html')).href);
  await page.waitForFunction(()=>window.enemyStudio?.selected==='finals');
  await page.locator('#motion').click();
  await page.screenshot({path:'artifacts/final-enemies/studio.png'});
  assert.equal(await page.locator('.label.shown').count(),2);
  for(const id of ['lab-explosionboss','lab-finalboss']){
   await page.evaluate(id=>enemyStudio.select(id),id);await page.screenshot({path:'artifacts/final-enemies/'+id+'.png'});
  }
  await page.goto(pathToFileURL(path.resolve('client/previews/final-enemies.html')).href);
  await page.waitForFunction(()=>document.querySelector('#lab-scene')?.width>0);
  await page.locator('#walk').click();await page.screenshot({path:'artifacts/final-enemies/game.png'});
  await page.locator('#light').click();await page.screenshot({path:'artifacts/final-enemies/blackout.png'});
  assert.deepEqual(errors,[]);console.log('Final enemy browser previews passed: studio, individual models, game lighting, blackout, no runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
