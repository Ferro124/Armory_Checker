const { GetItems } = require('../infrastructure/ItemManager')
const { GetParams } = require("../common/helpers/GenericHelper")
const { RequestElementsFromHTML, RequestArchievementsFromHTML } = require('../common/helpers/RequestHelper')
const { Character } = require('../domain/entities/Character')
const { ItemTypeEnum, ItemTypeEnumToString } = require('../domain/enums/ItemTypeEnum')
const { WarmaneItemTypeEnum } = require('../domain/enums/WarmaneItemTypeEnum')
const { GetCamelToe } = require('../common/helpers/GenericHelper')


async function GetCharacter(realm, name) {
    return new Promise(async (resolve, reject) => {
        (async () => {
            const char = new Character(GetCamelToe(realm), GetCamelToe(name));
            try {
                await char.load(); // This opens a browser window
                if (char.valid) {
                    await GetGearScore(char);
                    await AnalyzeGear(char);
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

async function AnalyzeGear(character) {

    if (!character || !character.name || !character.realm) {
        throw new Error('Invalid character object');
    }
    const equippedItems = []; // For DB lookup (gems only)
    const actualItems = [];   // For gem comparison
    let i = 0;
    const missingGems = [];
    const missingEnchants = [];

    const bannedSlots = [1, 5, 6, 9, 14, 15];; // Neck, Shirt, Tabard, etc. - no enchants


    const url = `https://armory.warmane.com/character/${encodeURIComponent(character.name)}/${encodeURIComponent(character.realm)}/`;

    // This function returns { gearData: { rels, professions, classText }, browser }
    const { htmlData, browser } = await RequestElementsFromHTML(character, url);
    // === ADD THIS SAFETY BLOCK ===

    if (!htmlData || !htmlData.rels || htmlData.rels.length === 0) {
        await browser.close();
        throw new Error(`Character "${character.name}" on ${character.realm} not found or armory page failed to load properly.`);
    }

    if (!htmlData.classText || htmlData.classText.trim() === '') {
        await browser.close();
        throw new Error(`Could not detect class/race/level for ${character.name}. Page may be invalid or not fully loaded.`);
    }


    const characterClass = htmlData.classText.toLowerCase(); // e.g., "druid"
    const professions = htmlData.professions || []; // array of strings, e.g., ["Leatherworking", "Jewelcrafting"]
    const hasEnchanting = professions.includes("Enchanting");
    const hasBlacksmithing = character.professions?.some(p => p.name === "Blacksmithing") || false;
    // Note: If you want to use scraped professions for blacksmithing too, add || professions.includes("Blacksmithing")
    htmlData.rels.forEach((rel) => {
        const slotType = WarmaneItemTypeEnum[i];

        if (rel && rel.trim()) {
            const params = GetParams(rel);

            if (params && params.item) {
                const itemID = Number(params.item);

                // === GEMS ===
                let gemCount = 0;
                if (params.gems) {
                    gemCount = params.gems
                        .split(":")
                        .filter(x => x && x !== "0").length;
                }

                equippedItems.push(itemID);
                actualItems.push({
                    itemID,
                    gems: gemCount,
                    type: slotType
                });

                // === ENCHANTS (for equipped slots) ===
                if (!bannedSlots.includes(i)) {
                    const hasStandardEnchant = !!params.ench; // Normal enchanter enchants + Engineering tinkers (they use ench=)
                    const hasLegPatch = !!params.pch || rel.includes('pch='); // Tailor/LW leg threads (Brilliant Spellthread, Frosthide Leg Armor, etc.)
                    const hasFurLining = !!params.perm_ench || rel.includes('perm_ench='); // Leatherworking Fur Lining on bracers
                    const hasExtraEnchant = !!params.extra || !!params.rand || rel.includes('extra=') || rel.includes('rand='); // Fallback for any unusual bonuses

                    const hasAnyEnchant = hasStandardEnchant || hasLegPatch || hasFurLining || hasExtraEnchant;

                    if (!hasAnyEnchant) {
                        const slotType = WarmaneItemTypeEnum[i];

                        // Your existing special rules (hunter ranged, enchanting rings, etc.)
                        let shouldFlag = true;

                        if (slotType === "Ranged" && !characterClass.includes("hunter")) {
                            shouldFlag = false; // Hunters need scope, others don't
                        } else if ((slotType === "Ring #1" || slotType === "Ring #2") && !hasEnchanting) {
                            shouldFlag = false; // Only flag rings if they have Enchanting prof
                        } else if (slotType === "Off-hand" &&
                            ["mage", "warlock", "druid", "priest"].some(c => characterClass.includes(c))) {
                            shouldFlag = false; // Casters don't need off-hand enchant
                        }

                        if (shouldFlag && !["Ranged", "Ring #1", "Ring #2", "Off-hand"].includes(slotType)) {
                            missingEnchants.push(slotType);
                        } else if (!shouldFlag) {
                            // Special case slots - only add if rule requires it
                            if ((slotType === "Ranged" && characterClass.includes("hunter")) ||
                                ((slotType === "Ring #1" || slotType === "Ring #2") && hasEnchanting) ||
                                (slotType === "Off-hand" && !["mage", "warlock", "druid", "priest"].some(c => characterClass.includes(c)))) {
                                missingEnchants.push(slotType);
                            }
                        }
                    }
                }
            }
        } else {
            // Empty slot - still check if it needs enchant (rare, but Off-hand/Ranged/Rings can be empty)
            // Usually no need, as missing item > missing enchant, but you can add logic if wanted
        }

        i++; // Increment for every slot
    });

    // === FINALIZE GEMS (requires DB lookup) ===
    let gemsMessage = `${character.name} has gemmed all items! ✅`;

    if (equippedItems.length > 0) {
        const itemsDB = await new Promise((resolve, reject) => {
            GetItems(equippedItems, (err, data) => {
                if (err) return reject(err);
                resolve(data);
            });
        });

        itemsDB.forEach(dbItem => {
            const equipped = actualItems.find(x => x.itemID === dbItem.itemID);
            if (!equipped) return;

            const isExtraSocket = (equipped.type === "Belt") ||
                (["Gloves", "Bracer"].includes(equipped.type) && hasBlacksmithing);

            const expectedGems = isExtraSocket ? dbItem.gems + 1 : dbItem.gems;

            if (expectedGems > equipped.gems) {
                missingGems.push(equipped.type);
            }
        });

        if (missingGems.length > 0) {
            gemsMessage = `${character.name} needs to gem: ${missingGems.join(", ")} ❌`;
        }
    }

    character.Gems = gemsMessage;

    // === FINALIZE ENCHANTS (no DB needed) ===
    const enchantsMessage = missingEnchants.length === 0
        ? `${character.name} has all enchants! ✅`
        : `${character.name} is missing enchants on: ${missingEnchants.join(", ")} ❌`;

    character.Enchants = enchantsMessage;

    await browser.close();
    // Return combined message for Discord
    return `**${character.name}** gear check:\n\n` +
        `**Gems:** ${gemsMessage}\n` +
        `**Enchants:** ${enchantsMessage}`;
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
    if (!character || !character.name || !character.realm) {
        throw new Error('Invalid character object');
    }
    const url = `https://armory.warmane.com/character/${encodeURIComponent(character.name)}/${encodeURIComponent(character.realm)}/achievements`;
    return RequestArchievementsFromHTML(character, url);
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