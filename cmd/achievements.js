const { argsHandler, baseURL } = require("../global");
const cheerio = require("cheerio");
const fetch = require('node-fetch'); // Add this
const { RequestCheckAndSaveCookiesFromArchievementsPage } = require("../common/helpers/RequestHelper");

const catgAch = [
  [14922, [4817, 4818]], // Lich King 10-Player Raid
  [14923, [4815, 4816]], // Lich King 25-Player Raid
  [14961, [2984, 3159]], // Secrets of Ulduar 10
  [14962, [2895, 3164]], // SoU 25
  [15001, [3917, 3918]], // Call of the Crusade 10
  [15002, [3916, 3812]], // CotC 25
  [15041, [4532, 4636]], // Fall of the Lich King 10
  [15042, [4608, 4637]], // FotLK 25
];

async function hAchievCmd(msg) {
  const { args, realm } = argsHandler(msg.content);
  const character = args[1]; // Assuming args[1] is character name

  const b = Array.from({ length: 8 }, () => ["❌", "❌"]);
  let error = false, notFound = false;

  const COOKIES = RequestCheckAndSaveCookiesFromArchievementsPage();

  for (let i = 0; i < catgAch.length; i++) {
    if (error || notFound) break;

    try {
      const res = await fetch(`${baseURL}/character/${character}/${realm}/achievements`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "cookie": COOKIES, // Key: send the cookies here
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", // Match your browser's UA
          "accept": "application/json",
          "origin": baseURL,
          "referer": `${baseURL}/character/${character}/${realm}/achievements`
        },
        body: `category=${catgAch[i][0]}`
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();

      const $ = cheerio.load(json.content);
      for (let j = 0; j < 2; j++) {
        if ($(`#ach${catgAch[i][1][j]} > .date`).length) b[i][j] = "✅";
      }
    } catch (err) {
      if (err.message.includes("Unexpected token") || err.message.includes("JSON")) notFound = true;
      else {
        console.error(err);
        error = true;
      }
    }
  }

  if (error) return msg.channel.send("An error occurred. Please try again later.");
  if (notFound) return msg.reply("The character you are looking for does not exist or does not meet the minimum required level.");

  let table = `Raid   | 10NM 25NM 10HC 25HC
${"-".repeat(28)}
ICC    |  ${b[6][0]}   ${b[7][0]}   ${b[6][1]}   ${b[7][1]}
RS     |  ${b[0][0]}   ${b[1][0]}   ${b[0][1]}   ${b[1][1]}
TOC    |  ${b[4][0]}   ${b[5][0]}   ${b[4][1]}   ${b[5][1]}
ULDUAR |  ${b[2][0]}   ${b[3][0]}   ${b[2][1]}   ${b[3][1]}`;

  msg.channel.send(`**${character}**'s Achievements:` + "```fix\n" + table + "```");
}

module.exports = hAchievCmd;