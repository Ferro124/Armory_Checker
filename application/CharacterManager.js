const cheerio = require("cheerio");
const request = require("request-promise");
const { GetItems } = require('../infrastructure/ItemManager')
const { GetParams } = require("../common/helpers/GenericHelper")
const { RequestHTML } = require('../common/helpers/RequestHelper')
const { Character } = require('../domain/entities/Character')
const { ItemTypeEnum, ItemTypeEnumToString } = require('../domain/enums/ItemTypeEnum')
const { WarmaneItemTypeEnum } = require('../domain/enums/WarmaneItemTypeEnum')
const { GetCamelToe } = require('../common/helpers/GenericHelper')
const { Builder, By, until } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const Achievements = require('../common/constants/Achievements');

async function GetCharacter(realm, name) {
    return new Promise(async (resolve, reject) => {
        (async () => {
            const char = new Character(GetCamelToe(realm), GetCamelToe(name));
            try {
                await char.load(); // This opens a browser window
                if (char.valid) {
                    console.log('Character found:', char.name, char.level, char.guild);
                    await GetGearScore(char);
                    //await GetEnchants(char);
                    await GetEnchantsAndGems(char);
                    await GetTalents(char);
                    await GetSummary(char);

                    resolve(char);
                } else {
                    console.log('Character not found or invalid.');
                    reject(`Unfortunately, Warmane's API didn't return any information about ${name} from realm ${realm}. Try again, please.`);
                }
            } catch (err) {
                console.error('Error loading character:', err);
                reject(`Unfortunately, Warmane's API didn't return any information about ${name} from realm ${realm}. Try again, please.`);
            }
        })();
    })
}

async function GetGearScore(character) {
    let gearScore = 0;

    if (character && character.equipment && character.equipment.length > 0) {
        return new Promise((resolve) => {
            let equippedItems = [];

            character.equipment.forEach(item => {
                equippedItems.push(Number(item.item));
            });

            GetItems(equippedItems, (err, itemsDB) => {
                if (err) {
                    console.log("Error:", err);
                    return;
                }

                const hunterWeaponTypes =
                    [
                        ItemTypeEnum["OneHand"],
                        ItemTypeEnum["TwoHand"],
                        ItemTypeEnum["MainHand"],
                        ItemTypeEnum["OffHand"]
                    ];
                let weapons = [];

                equippedItems.forEach(equippedItem => {
                    const item = itemsDB.find(element => element.itemID === equippedItem);

                    if (item.PVP === 1) {
                        character.PVPGear.push(ItemTypeEnumToString(item.type) + ":\n\t\t\t\t\t" + item.name);
                    }

                    if (character.class === "Hunter" && item.type === 26) {
                        gearScore += item.GearScore * 5.3224;
                    } else if (character.class === "Hunter" && hunterWeaponTypes.indexOf(item.type) > -1) {
                        gearScore += item.GearScore * 0.3164;
                    } else if (item.class === 2 && (item.subclass === 1 || item.subclass === 5 || item.subclass === 8)) {
                        weapons.push(item.GearScore);
                    } else {
                        gearScore += item.GearScore;
                    }
                });

                // Probably a warrior with Titan's Grip
                if (weapons.length === 2) {
                    gearScore += Math.floor(((weapons[0] + weapons[1]) / 2));
                } else if (weapons.length === 1) {
                    gearScore += weapons[0];
                }
                character.GearScore = Math.ceil(gearScore);

                resolve(character);
            });
        });
    }
}

async function GetEnchantsAndGems(character) {
    if (!character || !character.name || !character.realm) {
        throw new Error('Invalid character object');
    }

    const url = `https://armory.warmane.com/character/${encodeURIComponent(character.name)}/${encodeURIComponent(character.realm)}/`;
    const { html, browser } = await RequestHTML(character, url)
    const $ = cheerio.load(html);

    //Gems
    let equippedItems = [];
    let actualItems = [];
    let i = 0;
    let missingGems = [];

    //Enchants
    const bannedItems = [1, 5, 6, 9, 14, 15];
    let missingEnchants = [];


    $(".item-model a").each(function () {
        let rel = $(this).attr("rel");

        if (rel) {
            const params = GetParams(rel); // Assuming this function exists elsewhere in your code

            if (params["gems"]) {
                const gemCount = params["gems"].split(":").filter(x => x != 0 && x !== "").length;
                equippedItems.push(Number(params["item"]));

                actualItems.push({
                    itemID: Number(params["item"]),
                    gems: gemCount,
                    type: WarmaneItemTypeEnum[i] // Assuming this enum is defined
                });
            }
        }
        i++;
    });



    // Now fetch item data from DB (your existing logic)
    return new Promise((resolve, reject) => {
        GetItems(equippedItems, async (err, itemsDB) => {
            if (err) {
                console.log("Error fetching items from DB:", err);
                await browser.close();
                return reject(err);
            }

            itemsDB.forEach(item => {
                let foundItem = actualItems.find(x => x.itemID === item.itemID);
                if (!foundItem) return;

                const hasBlacksmithing = character.professions?.some(p => p.name === "Blacksmithing") || false;
                const isExtraSocketSlot = (foundItem.type === "Belt") ||
                    (["Gloves", "Bracer"].includes(foundItem.type) && hasBlacksmithing);

                const expectedGems = isExtraSocketSlot ? item.gems + 1 : item.gems;

                if (expectedGems > foundItem.gems) {
                    missingGems.push(foundItem.type);
                }
            });

            if (missingGems.length === 0) {
                character.Gems = `${character.name} has gemmed all his items! ✅`;
            } else {
                character.Gems = `${character.name} needs to gem ${missingGems.join(", ")} ❌`;
            }

            resolve(character.Gems);

            let items = [];
            let characterClass = $(".level-race-class").text().toLowerCase();
            let professions = [];
            $(".profskills").find(".text").each(function () {
                professions.push($(this).clone().children().remove().end().text().trim());
            });
            $(".item-model a").each(function () {
                $(this).attr("href");
                let rel = $(this).attr("rel");
                items.push(rel);
            });

            for (let i = 0; i < items.length; i++) {
                if (items[i]) {
                    if (!bannedItems.includes(i)) {
                        if (items[i].indexOf("ench") === -1) {
                            if (WarmaneItemTypeEnum[i] === "Ranged") {
                                if (characterClass.indexOf("hunter") >= 0) {
                                    missingEnchants.push(WarmaneItemTypeEnum[i]);
                                }
                            } else if (WarmaneItemTypeEnum[i] === "Ring #1" || WarmaneItemTypeEnum[i] === "Ring #2") {
                                if (professions.includes("Enchanting")) {
                                    missingEnchants.push(WarmaneItemTypeEnum[i]);
                                }
                            } else if (WarmaneItemTypeEnum[i] === "Off-hand") {
                                if (characterClass.indexOf("mage") < 0 && characterClass.indexOf("warlock") < 0 && characterClass.indexOf("druid") < 0 && characterClass.indexOf("priest") < 0) {
                                    missingEnchants.push(WarmaneItemTypeEnum[i]);
                                }
                            } else {
                                missingEnchants.push(WarmaneItemTypeEnum[i]);
                            }
                        }
                    }
                }
            }

            if (missingEnchants.length === 0) character.Enchants = `${character.name} has all enchants! :white_check_mark:`;
            else character.Enchants = `${character.name} is missing enchants from: ${missingEnchants.join(", ")} :x:`;

            
            await browser.close();
            console.log('Browser closed. Gems check complete.');
            resolve(character.Enchants);
        });
    });
}

async function GetTalents(character) {
    let res = "";

    if (character.talents != null) {
        for (let i = 0; i < character.talents.length; i++) {
            if (i === 1) res += " and ";

            res += character.talents[i].tree;

            if (character.talents[i].points != null) {
                res += "(" + character.talents[i].points.map(p => p).join("/") + ")";
            }
        }
    }

    character.Talents = res;
}

async function GetAchievements(character) {
    let driver;

    try {
        const options = new firefox.Options();
        options.windowSize({ width: 1000, height: 700 });
        options.addArguments('-hideToolbar');
        // options.addArguments('--headless');

        driver = new Builder().forBrowser('firefox').setFirefoxOptions(options).build();
        await driver.get(`http://armory.warmane.com/character/${character.name}/${character.realm}/achievements`);

        character.Achievements = `\`\`\`fix
Raid   | 25HC 25NM 10HC 10NM
----------------------------
ICC    |  ${await GetSingleAchievement(driver, Achievements.Raids.ICC25HC)}  ${await GetSingleAchievement(driver, Achievements.Raids.ICC25)}   ${await GetSingleAchievement(driver, Achievements.Raids.ICC10HC)}  ${await GetSingleAchievement(driver, Achievements.Raids.ICC10)}
RS     |  ${await GetSingleAchievement(driver, Achievements.Raids.RS25HC)}  ${await GetSingleAchievement(driver, Achievements.Raids.RS25)}   ${await GetSingleAchievement(driver, Achievements.Raids.RS10HC)}  ${await GetSingleAchievement(driver, Achievements.Raids.RS10)}
TOC    |  ${await GetSingleAchievement(driver, Achievements.Raids.TOC25HC)}  ${await GetSingleAchievement(driver, Achievements.Raids.TOC25)}   ${await GetSingleAchievement(driver, Achievements.Raids.TOC10HC)}  ⬛  \`\`\``;
    } finally {
        if (driver) {
            try {
                await driver.quit();
            } catch (err) {
                console.log(err);
            }
        }
    }
}

async function GetSingleAchievement(driver, raid) {
    await driver.wait(until.elementLocated(By.xpath(`//a[contains(text(), '${raid.path1}')]`)), 10000).click();
    await driver.wait(until.elementLocated(By.xpath(`//a[contains(text(), '${raid.path2}')]`)), 10000).click();

    try {
        await driver.manage().setTimeouts({ implicit: 700 });
        let achievementDiv = await driver.findElement(By.id(raid.id));
        let date = await achievementDiv.findElements(By.className('date'));

        return date && date.length > 0 ? "✅" : "❌";
    } catch {
        return "❌";
    }
}

async function GetSummary(character) {
    const listPattern = "\n\t\t";
    const pvpGearPattern = listPattern + ":exclamation:";

    character.Summary =
        `
    Here is a summary for **${character.name}**:
    **Status**: ${character.online ? "Online :green_circle:" : "Offline :red_circle:"}
    **Character**: ${"Level " + character.level + " " + character.race + " " + character.class + " - " + character.faction + " " + (character.faction === "Alliance" ? ":blue_heart:" : ":heart:")}
    **Guild**: ${character.guild ? character.GuildLink : `${character.name} doesn't have a guild`}
    **Specs**: ${character.Talents}
    **Professions**: ${character.professions ? character.professions.map(profession => (profession.skill + " " + profession.name)).join(" and ") + " :tools:" : "No professions to show"}
    **Achievement points**: ${character.achievementpoints} :trophy:
    **Honorable kills**: ${character.honorablekills} :skull_crossbones:
    **GearScore**: ${character.GearScore}
    **Enchants**: ${character.Enchants}
    **Gems**: ${character.Gems}
    **Armory**: ${character.Armory}
    **PVP items**: ${character.PVPGear.length === 0 ? "None" : pvpGearPattern + character.PVPGear.join(pvpGearPattern)}
    `
}

module.exports = { GetCharacter, GetAchievements }