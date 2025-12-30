const Achievements = require('../constants/Achievements');

async function buildAchievementsTable(page) {
    const raids = Achievements.Raids; // Seu objeto com os caminhos e IDs

    const results = {
        ICC25HC: await getSingleAchievement(page, raids.ICC25HC),
        ICC25: await getSingleAchievement(page, raids.ICC25),
        ICC10HC: await getSingleAchievement(page, raids.ICC10HC),
        ICC10: await getSingleAchievement(page, raids.ICC10),

        RS25HC: await getSingleAchievement(page, raids.RS25HC),
        RS25: await getSingleAchievement(page, raids.RS25),
        RS10HC: await getSingleAchievement(page, raids.RS10HC),
        RS10: await getSingleAchievement(page, raids.RS10),

        TOC25HC: await getSingleAchievement(page, raids.TOC25HC),
        TOC25: await getSingleAchievement(page, raids.TOC25),
        TOC10HC: await getSingleAchievement(page, raids.TOC10HC),
        // TOC10NM geralmente não existe ou é automático → deixei como ⬛
    };

    return `\`\`\`fix
Raid   | 25HC  25NM  10HC  10NM
----------------------------
ICC    |  ${results.ICC25HC}     ${results.ICC25}      ${results.ICC10HC}     ${results.ICC10}
RS     |  ${results.RS25HC}     ${results.RS25}      ${results.RS10HC}     ${results.RS10}
TOC    |  ${results.TOC25HC}     ${results.TOC25}      ${results.TOC10HC}     ⬛
\`\`\``;
}

async function getSingleAchievement(page, raid) {
    try {
        // Navega até a categoria correta
        await page.click(`a:text("${raid.path1}")`);
        await page.waitForTimeout(800); // Pequena pausa para animação

        await page.click(`a:text("${raid.path2}")`);
        await page.waitForTimeout(800);

        // Procura pelo achievement específico
        const achievement = await page.$(`#${raid.id}`);

        if (!achievement) return "❌";

        const dateElements = await achievement.$$('.date');

        return dateElements.length > 0 ? "✅" : "❌";
    } catch (err) {
        // Se falhar (elemento não encontrado, timeout, etc.)
        return "❌";
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

module.exports = { buildAchievementsTable, GetSingleAchievement };