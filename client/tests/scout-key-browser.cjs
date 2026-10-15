// Run from the worktree root with Playwright on NODE_PATH; BROWSER_PATH may select a local Chromium browser.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
(async () => {
    const browser = await chromium.launch({headless:true,
        ...(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {}),
        args:['--allow-file-access-from-files']});
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const output = process.env.SCOUT_KEY_ARTIFACTS;
        if (output) fs.mkdirSync(output, {recursive:true});
        await page.goto(pathToFileURL(path.resolve('client/index.html')).href);
        await page.waitForFunction(() => window.coreMenu && window.coreGame);
        await page.getByRole('textbox', {name:'ゲストプレイヤー名'}).fill('Scout QA');
        await page.getByRole('button', {name:'決定',exact:true}).click();
        await page.getByRole('button', {name:'設定',exact:true}).click();
        const key = page.getByRole('textbox', {name:'ジョブ効果のキー',exact:true});
        assert.equal(await key.inputValue(), 'F');
        for (const viewport of [{width:1440,height:900},{width:390,height:844},{width:740,height:420}]) {
            await page.setViewportSize(viewport);
            await key.scrollIntoViewIfNeeded();
            const bounds = await key.boundingBox();
            assert(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width);
            assert(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height);
            assert(await page.evaluate(() => document.querySelector('#menu-ui').scrollWidth <= innerWidth), 'settings must not overflow horizontally');
            if (output) await page.screenshot({path:path.join(output,`settings-${viewport.width}.png`)});
        }
        await key.click(); await key.press('j');
        assert.equal(await key.inputValue(), 'J');
        assert.equal(await page.evaluate(() => localStorage.getItem('core-defense-job-key')), 'j');
        await key.press('h');
        assert.equal(await key.inputValue(), 'J', 'reserved medkit assignment is rejected');
        await page.reload();
        await page.getByRole('button', {name:'設定',exact:true}).click();
        assert.equal(await key.inputValue(), 'J', 'assignment survives reload');
        await page.evaluate(() => {
            window.scoutQaState = {phase:'preparing', players:[{id:'me',name:'Scout QA',human:true,job:'scout'}]};
            coreMenu.snapshot(window.scoutQaState, 'me'); coreMenu.openSettings();
        });
        assert.equal(await key.inputValue(), 'J', 'in-game settings use the same assignment');
        await key.click(); await key.press('f');
        assert.equal(await key.inputValue(), 'F');
        await page.evaluate(() => coreMenu.snapshot({...window.scoutQaState,phase:'lobby',roomOwnerId:'me'}, 'me'));
        await page.getByRole('button', {name:'ジョブ:Scout',exact:true}).click();
        const description = page.getByLabel('選択中のジョブ');
        assert.match(await description.innerText(), /ジョブ効果キー（初期F）/);
        assert.match(await description.innerText(), /設定の「ジョブ効果」/);
        await page.setViewportSize({width:1440,height:900});
        await description.scrollIntoViewIfNeeded();
        if (output) await page.screenshot({path:path.join(output,'scout-description.png')});
        assert.deepEqual(errors, []);
        console.log('Scout browser passed: responsive settings, F default, remapping, conflicts, persistence, in-game settings and description');
    } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
