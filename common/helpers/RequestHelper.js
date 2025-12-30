const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;
const COOKIES_FILE = path.resolve('warmane_armory_cookies.json');


async function CallBrowserConfigured(mode) {
    let CONFIGS = {};
    if (mode == 'window') {
        CONFIGS = {
            headless: false, // MUST be visible so user can solve Cloudflare challenge
            defaultViewport: null,
            args: ['--window-size=1400,900', '--start-maximized']
        }
    } else {
        CONFIGS = {
            headless: true, // MUST be visible so user can solve Cloudflare challenge
            defaultViewport: null
        }
    }
    const browser = await puppeteer.launch(CONFIGS);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    return { browser, page }
}


async function RequestJSON(url) {
    const { browser } = await CallBrowserConfigured('headless')
    // Load saved cookies if they exist (helps skip challenges if cf_clearance is still valid)
    try {
        const { browser, page } = await CallBrowserConfigured('headless');
        const cookiesData = await fs.readFile(COOKIES_FILE, 'utf-8');
        const cookies = JSON.parse(cookiesData);
        await page.setCookie(...cookies);
        await browser.setCookie(...cookies);
        await page.goto(url)
        console.log(`Loaded ${cookies.length} saved cookies. May skip Cloudflare challenge.`);

        return JSONParse(page, browser)
    } catch (err) {
        const { page } = await CallBrowserConfigured('window')
        console.log('No saved cookies found. Starting fresh session.');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); // 2 min timeout for manual solve

        // Save cookies after successful load (especially important if a new cf_clearance was issued)
        const currentCookies = await page.cookies();
        await fs.writeFile(COOKIES_FILE, JSON.stringify(currentCookies, null, 2));
        let body = await JSONParse(page, browser)
        await browser.close();
        return { body, browser };
    } finally {
          if (browser) {
            await browser.close().catch(closeErr => {
                console.error('Error closing browser:', closeErr.message);
            });
            console.log('Browser closed.');
        }
    }

};


async function JSONParse(page, browser) {
    // Extract the JSON from the page (it's displayed as plain text)
    const jsonText = await page.evaluate(() => document.body.innerText);

    let body;
    try {
        body = JSON.parse(jsonText);
        return { body, browser };
    } catch (err) {
        console.error('Failed to parse JSON. Page content might still be a Cloudflare challenge or error.');
        await browser.close();
        throw new Error('Invalid JSON response or Not Found 404.');
    }
}



async function RequestElementsFromHTML(character, url) {
    if (!character || !character.name || !character.realm) {
        throw new Error('Invalid character object');
    }

    const { browser, page } = await CallBrowserConfigured('headless');

    // Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Load saved cookies if they exist (helps skip challenges if cf_clearance is still valid)
    try {
        const cookiesData = await fs.readFile(COOKIES_FILE, 'utf-8');
        const cookies = JSON.parse(cookiesData);
        await page.setCookie(...cookies);
        console.log(`Loaded ${cookies.length} saved cookies. May skip Cloudflare challenge.`);
    } catch (err) {
        console.log('No saved cookies found. Starting fresh session.');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 }); // 2 min timeout for manual solve

        // Save cookies after successful load (especially important if a new cf_clearance was issued)
        const currentCookies = await page.cookies();
        await fs.writeFile(COOKIES_FILE, JSON.stringify(currentCookies, null, 2));
    }

    console.log(`Opening character page: ${url}`);
    console.log('IMPORTANT: If a Cloudflare "Attention Required" or CAPTCHA appears, please solve it manually in the browser window.');
    console.log('Once solved, the page will load normally and the script will continue automatically.');

    try {
        const cookies = JSON.parse(await fs.readFile(COOKIES_FILE, 'utf-8'))
        browser.setCookie(...cookies);
        await page.goto(url)
        // *** CRITICAL FIX: Wait for the gear section to render ***
        try {
            await page.waitForSelector('.item-model a[rel]', { timeout: 30000 });
        } catch (waitErr) {
            console.warn('Timed out waiting for .item-model a[rel]. Trying fallback waits...');

            // Fallback: wait for any item-model or known container
            await page.waitForSelector('.item-model', { timeout: 20000 }).catch(() => { });
            await page.waitForTimeout(5000); // Extra buffer for JS to finish
        }

        // Get page HTML and load into Cheerio for parsing

        const htmlData = await page.evaluate(() => {
            const rels = [];
            document.querySelectorAll('.item-slot').forEach(a => {
                rels.push(a.querySelector('a').getAttribute('rel') || '');
            });

            const classText = document.querySelector('.level-race-class')?.textContent || '';

            const professions = []
            const profElements = document.querySelectorAll('.profskills .text');
            if (profElements.length > 0) {
                profElements.forEach(el => {
                    // Clone to avoid modifying the live DOM
                    const clone = el.cloneNode(true);

                    // Remove any <span> children (these contain skill levels like "450/450")
                    clone.querySelectorAll('span').forEach(span => span.remove());

                    const profName = clone.textContent.trim();

                    if (profName) {
                        professions.push(profName);
                    }
                });
            }

            return { rels, professions, classText };
        });


        return { htmlData, browser };

    } catch (error) {
        await browser.close();
        throw new Error(`Failed to load page: ${error.message}. Did you solve the Cloudflare challenge?`);
    }
}

async function RequestCheckAndSaveCookiesFromArchievementsPage(url) {
    const { browser, page } = await CallBrowserConfigured('headless');

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Carrega cookies salvos (cf_clearance, etc.)
    try {
        const cookies = JSON.parse(await fs.readFile(COOKIES_FILE, 'utf-8'));
        await page.setCookie(...cookies);
        console.log('Cookies de achievements carregados');
        return cookies

    } catch (e) {
        const { page } = await CallBrowserConfigured('window')
        console.log('Nenhum cookie salvo – iniciando sessão nova');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
        await fs.writeFile(COOKIES_FILE, JSON.stringify(await page.cookies(), null, 2));
        return JSON.parse(await fs.readFile(COOKIES_FILE, 'utf-8'));
    } finally {
        await browser.close();
    }

}


module.exports = { RequestJSON, RequestElementsFromHTML, RequestCheckAndSaveCookiesFromArchievementsPage }

