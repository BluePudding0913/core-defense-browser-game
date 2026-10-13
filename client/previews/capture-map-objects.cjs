// NODE_PATH must include Playwright. MAP_PREVIEW_BROWSER can select an installed Chromium browser.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const output=path.resolve('artifacts/map-objects');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.MAP_PREVIEW_BROWSER?{executablePath:process.env.MAP_PREVIEW_BROWSER}:{}),args:['--allow-file-access-from-files']});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(__dirname,'map-objects.html')).href);
  await page.waitForFunction(()=>window.previewReady,null,{timeout:20000});
  if(errors.length)throw Error(errors.join('\n'));
  await page.screenshot({path:path.join(output,'overview.png'),fullPage:true});
  const entries=await page.locator('article').evaluateAll(nodes=>nodes.map(n=>({id:n.id,title:n.querySelector('h2').textContent})));
  for(const entry of entries)await page.locator('#'+entry.id).screenshot({path:path.join(output,entry.id+'.png')});
  fs.writeFileSync(path.join(output,'README.md'),'# マップモデル画像\n\nゲームと共通の3Dモデルから出力。\n\n'+entries.map(e=>'## '+e.title+'\n\n!['+e.title+']('+e.id+'.png)\n').join('\n'));
  // Verify the direct link used by each gallery card.
  await page.goto(pathToFileURL(path.join(__dirname,'map-objects.html')).href+'?model=medical');
  await page.waitForFunction(()=>window.previewReady);if(await page.locator('article').count()!==1)throw Error('Single model view failed');
  console.log('Rendered and captured '+entries.length+' models; gallery and direct model view passed. '+output);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
