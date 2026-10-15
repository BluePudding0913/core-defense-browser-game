// Run from the worktree root; set NODE_PATH to Playwright's package directory.
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
    fs.mkdirSync('artifacts/proximity',{recursive:true});
    const browser=await chromium.launch({headless:true,...(process.env.PROXIMITY_PREVIEW_BROWSER?{executablePath:process.env.PROXIMITY_PREVIEW_BROWSER}:{}),args:['--allow-file-access-from-files']});
    try {
        const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto(pathToFileURL(path.resolve('client/previews/proximity.html')).href);
        await page.waitForFunction(()=>window.previewReady);await page.waitForTimeout(600);
        const slider=async(id,value)=>{await page.locator('#'+id).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input'));},String(value));await page.waitForTimeout(80);};
        for(const mode of ['edge','arc','ring','off']){
            await page.locator('[data-mode='+mode+']').click();
            assert.equal(await page.evaluate(()=>proximityPreview.mode),mode);
            await page.screenshot({path:'artifacts/proximity/'+mode+'.png'});
        }
        await slider('distance',250);assert.equal(await page.evaluate(()=>proximityPreview.threat),null);
        assert.equal(await page.locator('#threat-state').textContent(),'範囲外');
        await slider('distance',40);assert.equal(await page.evaluate(()=>proximityPreview.threat.strength),1);
        await page.locator('[data-mode=arc]').click();
        await page.waitForFunction(()=>proximityPreview.threat===null);
        assert.equal(await page.evaluate(()=>proximityPreview.threat),null,'Front has no arc');
        for(const [angle,name] of [[90,'right'],[-90,'left'],[180,'behind']]){
            await slider('direction',angle);
            assert(Math.abs(await page.evaluate(()=>proximityPreview.threat.angle)-angle*Math.PI/180)<1e-8);
            await page.screenshot({path:'artifacts/proximity/'+name+'.png'});
        }
        await page.locator('#auto').click();const before=await page.locator('#distance').inputValue();
        await page.waitForTimeout(700);assert.notEqual(await page.locator('#distance').inputValue(),before);
        await page.locator('#auto').click();const stopped=await page.locator('#distance').inputValue();
        await page.waitForTimeout(100);assert.equal(await page.locator('#distance').inputValue(),stopped);
        await slider('distance',72);await slider('direction',0);
        await page.locator('#light').click();assert.equal(await page.evaluate(()=>proximityPreview.state.blackoutActive),true);
        await page.screenshot({path:'artifacts/proximity/blackout.png'});
        await page.locator('#light').click();await page.locator('[data-mode=edge]').click();
        await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/proximity/mobile.png'});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
        await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(80);
        assert.deepEqual(errors,[]);assert.equal(await page.locator('#overlay').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
        console.log('Browser passed: all variants, range, left/right/back, playback, pause, blackout, mobile, reduced motion, no runtime errors.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
