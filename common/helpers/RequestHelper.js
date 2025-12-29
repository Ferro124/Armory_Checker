const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;
const COOKIES_FILE = path.resolve('warmane_armory_cookies.json');


async function CallBrowserConfigured() {
    const browser = await puppeteer.launch({
        headless: false, // MUST be visible so user can solve Cloudflare challenge
        defaultViewport: null,
        args: ['--window-size=1400,900', '--start-maximized']
    });
    return browser
}

async function RequestJSON(url) {
    const browser = await CallBrowserConfigured();

    const page = await browser.newPage();

    // Optional: set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`Navigating to: ${url}`);
    console.log('If Cloudflare challenge appears, please solve it manually in the opened browser window.');

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Extract the JSON from the page (it's displayed as plain text)
    const jsonText = await page.evaluate(() => document.body.innerText);

    let body;
    try {
        body = JSON.parse(jsonText);
    } catch (err) {
        console.error('Failed to parse JSON. Page content might still be a Cloudflare challenge or error.');
        await browser.close();
        throw new Error('Invalid JSON response or Not Found 404.');
    }
    await browser.close();

    return { body, browser };
};

async function RequestElementsFromHTML(character, url) {
    if (!character || !character.name || !character.realm) {
        throw new Error('Invalid character object');
    }

    const browser = await CallBrowserConfigured();

    const page = await browser.newPage();

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
    }

    console.log(`Opening character page: ${url}`);
    console.log('IMPORTANT: If a Cloudflare "Attention Required" or CAPTCHA appears, please solve it manually in the browser window.');
    console.log('Once solved, the page will load normally and the script will continue automatically.');

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 }); // 2 min timeout for manual solve


        // *** CRITICAL FIX: Wait for the gear section to render ***
        try {
            await page.waitForSelector('.item-model a[rel]', { timeout: 30000 });
        } catch (waitErr) {
            console.warn('Timed out waiting for .item-model a[rel]. Trying fallback waits...');

            // Fallback: wait for any item-model or known container
            await page.waitForSelector('.item-model', { timeout: 20000 }).catch(() => { });
            await page.waitForTimeout(5000); // Extra buffer for JS to finish
        }

        // Save cookies after successful load (especially important if a new cf_clearance was issued)
        const currentCookies = await page.cookies();
        await fs.writeFile(COOKIES_FILE, JSON.stringify(currentCookies, null, 2));

        // Get page HTML and load into Cheerio for parsing

        const htmlData = await page.evaluate(() => {
            const rels = [];
            document.querySelectorAll('.item-model a[rel]').forEach(a => {
                rels.push(a.getAttribute('rel'));
            });

            return { rels};
        });


        return { htmlData, browser };

    } catch (error) {
        await browser.close();
        throw new Error(`Failed to load page: ${error.message}. Did you solve the Cloudflare challenge?`);
    }
}

module.exports = { RequestJSON, RequestElementsFromHTML }

