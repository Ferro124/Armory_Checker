const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;

const COOKIES_FILE = path.resolve('warmane_armory_cookies.json');
const MAX_COOKIE_AGE_HOURS = 4; // Refresh every 4 hours

async function CallBrowserConfigured(mode) {
    const isHeadless = mode === 'headless';

    const browser = await puppeteer.launch({
        headless: isHeadless ? true : false,
        defaultViewport: null,
        args: isHeadless 
            ? ['--no-sandbox', '--disable-setuid-sandbox'] 
            : ['--window-size=1400,900', '--start-maximized']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    return { browser, page };
}

async function RequestJSON(url) {
    let browser = null;
    let page = null;

    try {
        let useSavedCookies = false;

        // Check if cookies exist and are fresh
        try {
            const stats = await fs.stat(COOKIES_FILE);
            const ageInHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);

            if (ageInHours < MAX_COOKIE_AGE_HOURS) {
                useSavedCookies = true;
                console.log(`Cookies are ${ageInHours.toFixed(1)} hours old – trying to reuse.`);
            } else {
                console.log(`Cookies expired (${ageInHours.toFixed(1)}h old) – forcing refresh.`);
                await fs.unlink(COOKIES_FILE);
                console.log('Old cookies deleted.');
            }
        } catch (e) {
            if (e.code === 'ENOENT') {
                console.log('No saved cookies found – starting fresh session.');
            } else {
                console.warn('Error checking cookies file:', e.message);
            }
        }

        // Launch browser: headless if cookies are fresh, visible otherwise
        const mode = useSavedCookies ? 'headless' : 'window';
        console.log(`Launching browser in ${mode} mode...`);
        ({ browser, page } = await CallBrowserConfigured(mode));
        
        // Load saved cookies if available
        if (useSavedCookies) {
            try {
                const cookiesData = await fs.readFile(COOKIES_FILE, 'utf-8');
                const cookies = JSON.parse(cookiesData);
                await page.setCookie(...cookies);
                console.log(`Loaded ${cookies.length} saved cookies.`);
            } catch (err) {
                console.warn('Failed to load/parse cookies – treating as expired.');
            }
        }

        // Navigate to the page
        console.log(`Navigating to: ${url}`);
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: useSavedCookies ? 30000 : 120000
        });

        // Always save fresh cookies after successful navigation
        const allCookies = await page.cookies();
        const warmaneCookies = allCookies.filter(cookie =>
            cookie.domain.includes('warmane.com') || cookie.domain.includes('.warmane.com')
        );

        if (warmaneCookies.length > 0) {
            await fs.writeFile(COOKIES_FILE, JSON.stringify(warmaneCookies, null, 2));
            console.log(`Saved ${warmaneCookies.length} fresh cookies.`);
        } else {
            console.log('No relevant cookies found to save.');
        }

        // Parse JSON from page body
        const jsonText = await page.evaluate(() => document.body.innerText.trim());

        let body;
        try {
            body = JSON.parse(jsonText);
        } catch (parseErr) {
            console.error('Failed to parse JSON from page:', parseErr.message);
            console.log('Raw response:', jsonText.substring(0, 500) + '...');
            throw new Error('Invalid JSON response – likely blocked or character not found.');
        }

        console.log('Successfully retrieved and parsed character data.');
        return { body , browser };

    } catch (err) {
        console.error('Error in RequestJSON:', err.message);
        throw err;
    } finally {
        // Always close the browser, even on error
        if (browser) {
            try {
                await browser.close();
                console.log('Browser closed successfully.');
            } catch (closeErr) {
                console.error('Error closing browser:', closeErr.message);
            }
        }
    }
}

module.exports = { RequestJSON };


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

