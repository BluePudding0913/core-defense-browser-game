// Run from the worktree root with Playwright on NODE_PATH.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
    fs.mkdirSync('artifacts/core-hud',{recursive:true});
    const browser=await chromium.launch({headless:true,...(process.env.CORE_HUD_PREVIEW_BROWSER?{executablePath:process.env.CORE_HUD_PREVIEW_BROWSER}:{}),args:['--allow-file-access-from-files']});
    try {
        const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.clock.install();
        await page.goto(pathToFileURL(path.resolve('client/previews/notifications.html')).href);
        await page.clock.pauseAt(new Date(Date.now()+10000));
        await page.locator('#preview-controls').evaluate(e=>e.style.display='none');
        // Both images use the production HUD and the same remaining HP.
        async function show(age){
            await page.evaluate(age=>{
                const now=performance.now();core.hp=700;
                CoreFeedback.reset();CoreFeedback.add(core,now-age);
                CoreFeedback.updateHud(document.querySelector('#core-damage-hud'),core,now);
            },age);
        }
        const hud=page.locator('#core-damage-hud');
        await show(1500);
        const settled=await hud.boundingBox();
        assert.equal(settled.width,360);
        assert.equal(await page.locator('.core-hud-track').evaluate(e=>e.getBoundingClientRect().height),9);
        await page.screenshot({path:'artifacts/core-hud/settled.png'});
        // A further hit restarts the enlargement after the previous hit settled.
        await page.evaluate(()=>{const now=performance.now();CoreFeedback.add(core,now);CoreFeedback.updateHud(document.querySelector('#core-damage-hud'),core,now);});
        const hit=await hud.boundingBox();
        assert(Math.abs(hit.width-486)<1);
        assert.equal(hit.y,settled.y,'Top anchor keeps enlarged HUD clear of the round timer');
        await page.screenshot({path:'artifacts/core-hud/attacked.png'});
        await show(225);
        const middle=await hud.boundingBox();assert(middle.width>settled.width&&middle.width<hit.width);
        await show(450);assert.equal((await hud.boundingBox()).width,360);
        await page.setViewportSize({width:390,height:844});await show(0);
        const small=await hud.boundingBox();assert(small.x>=0&&small.x+small.width<=390);
        await page.screenshot({path:'artifacts/core-hud/small.png'});
        await show(10400);assert(!await hud.isVisible());
        assert.deepEqual(errors,[]);
        console.log('Core HUD browser checks passed: settled/hit sizes, repeated hit, easing, timer clearance, narrow viewport and fade.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
