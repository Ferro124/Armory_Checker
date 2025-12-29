const { RequestJSON } = require('../../common/helpers/RequestHelper')

class Character {
    /**
     * Fetches character data from Warmane Armory API using Puppeteer.
     * Uses a visible (non-headless) browser to manually bypass any Cloudflare challenges if they appear.
     * The API endpoint returns JSON directly once accessible.
     * 
     * @param {string} realm - The realm name (e.g., 'Icecrown', 'Outland')
     * @param {string} charName - The character name
     */
    constructor(realm, charName) {
        this.realm = realm;
        this.charName = charName;
        this.valid = false;
        this.name = null;
        this.online = null;
        this.level = null;
        this.faction = null;
        this.gender = null;
        this.class = null;
        this.honorablekills = null;
        this.guild = null;
        this.achievementpoints = null;
        this.equipment = null;
        this.race = null;
        this.talents = null;
        this.professions = null;

        // Calculated properties (will be set after data is loaded)
        this.GearScore = 0;
        this.Enchants = null;
        this.Gems = null;
        this.Armory = `[${charName}](http://armory.warmane.com/character/${charName}/${realm})`;
        this.Talents = null;
        this.Summary = null;
        this.GuildLink = null;
        this.PVPGear = [];
        this.Achievements = null;
    }

    /**
     * Loads the character data.
     * This is an async method - you must await it.
     * 
     * Instructions:
     * - Run with a non-headless browser.
     * - If a Cloudflare challenge appears, manually solve it (click the checkbox, etc.).
     * - Once solved, the page will load the JSON and the script will continue.
     * 
     * @returns {Promise<void>}
     */
    async load() {
        const url = `https://armory.warmane.com/api/character/${encodeURIComponent(this.charName)}/${encodeURIComponent(this.realm)}/summary`;
        
        //Request JSOn from warmane API, can use this function always when needed
        const { body, browser } = await RequestJSON(url);
        try {

            // Populate properties from API response
            this.name = body.name || null;
            this.realm = body.realm || this.realm;
            this.online = body.online ?? null;
            this.level = body.level || null;
            this.faction = body.faction || null;
            this.gender = body.gender || null;
            this.class = body.class || null;
            this.honorablekills = body.honorablekills || null;
            this.guild = body.guild || null;
            this.achievementpoints = body.achievementpoints || null;
            this.equipment = body.equipment || null;
            this.race = body.race || null;
            this.talents = body.talents || null;
            this.professions = body.professions || null;

            if (body && body.name) {
                this.valid = true;
            }

            // Calculated fields (you can extend these as needed)
            this.GuildLink = this.guild
                ? `[${this.guild}](http://armory.warmane.com/guild/${encodeURIComponent(this.guild.replace(/ /g, '+'))}/${this.realm})`
                : null;

        } catch (err) {
            console.error('Failed to parse JSON. Page content might still be a Cloudflare challenge or error.');
            await browser.close();
            throw new Error('Invalid JSON response or Not Found 404.');
        }
        await browser.close();
        console.log('Data loaded successfully.');
    }
}

module.exports = { Character };