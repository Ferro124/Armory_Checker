require("dotenv").config();
const { Client, Intents } = require("discord.js");
const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});
const crypto = require("crypto");
const CharacterManager = require("./application/CharacterManager");
const CI = require("./common/constants/CommandInfo");
const { RealmEnum } = require("./domain/enums/RealmEnum");
const { GetCamelToe } = require("./common/helpers/GenericHelper");
const express = require("express");
const hAchievCmd = require("./cmd/achievements");

const app = express();
const port = 2001;

client.on("ready", () => {
  console.log(
    `[${new Date().toLocaleString()}]:> Logged in as: ${client.user.tag}`
  );
});

client.on("messageCreate", async (msg) => {
  let guid = crypto.randomUUID();
  try {
    if (msg.content[0] === "!") {
      console.log(`[${new Date().toLocaleString()}]:> ${msg.content}`);

      let command = msg.content.split(" ")[0];
      let name =
        msg.content.split(" ")[1] !== undefined
          ? msg.content.split(" ")[1]
          : null;
      let realm =
        msg.content.split(" ")[2] !== undefined
          ? GetCamelToe(msg.content.split(" ")[2])
          : RealmEnum[0];

      msg = await msg.channel.messages.fetch(msg.id);

      if (command === CI.Commands.help) msg.reply(CI.Help);
      else if (
        Object.values(CI.Commands).includes(command) &&
        Object.values(RealmEnum).includes(realm) &&
        name != null
      ) {
        CharacterManager.GetCharacter(realm, name)
          .then(async (character) => {
            switch (command) {
              case CI.Commands.guild:
                msg.reply(
                  character.guild
                    ? `${character.name}'s guild: ${character.GuildLink}`
                    : `${character.name} doesn't have a guild`
                );
                break;
              case CI.Commands.gs:
                msg.reply(
                  `${character.name}'s gear score is: ${character.GearScore}`
                );
                break;
              case CI.Commands.ench:
                msg.reply(character.Enchants);
                break;
              case CI.Commands.gems:
                msg.reply(character.Gems);
                break;
              case CI.Commands.armory:
                msg.reply(`${character.name}'s armory: ${character.Armory}`);
                break;
              case CI.Commands.summary:
                msg.reply(character.Summary);
                hAchievCmd(msg);
                break;
              case CI.Commands.s:
                msg.reply(character.Summary);
                hAchievCmd(msg);
                break;
              case CI.Commands.achievements:
                break;
              case CI.Commands.achi:
                await CharacterManager.GetAchievements(character).then(
                  async () => {
                    msg.reply(
                      `**${character.name}'s achievements**:\n${character.Achievements}`
                    );
                  }
                );
                break;
            }
          })
          .catch((err) => {
            msg.reply(err);
            console.log(err);
          });
      } else msg.reply(CI.InvalidCommand);
    }
  } catch (e) {
    console.log(`[${new Date().toLocaleString()}: ${guid}]:> ${e.message}`);
    msg.reply(CI.InvalidCommand);
  }
});

//client.login(process.env.discord_bot_id);

app.get("/healthcheck", (req, res) => {
  res.sendStatus(200); // OK
});

// Handle Discord errors and reconnects
client.on("error", (error) => {
  console.error("Client error:", error);
  //Restart the bot after a delay to avoid rapid looping
  client.destroy();
  setTimeout(() => {
    console.log("Attempting to restart bot...");
    startBot();
  }, 5000); // 5-second delay before restart
});

client.on("shardDisconnect", (event, id) => {
  console.warn(
    `Shard ${id} disconnected. Code: ${event.code}. Attempting to reconnect...`
  );
  //Restart the bot after a delay to avoid rapid looping
  client.destroy();
  setTimeout(() => {
    console.log("Attempting to restart bot...");
    startBot();
  }, 5000); // 5-second delay before restart
});

client.on("shardReconnecting", (id) => {
  console.log(`Shard ${id} is reconnecting...`);
//Restart the bot after a delay to avoid rapid looping
client.destroy();
setTimeout(() => {
  console.log("Attempting to restart bot...");
  startBot();
}, 5000); // 5-second delay before restart
});

client.on("shardResume", (id, replayedEvents) => {
  console.log(`Shard ${id} resumed. Replayed ${replayedEvents} events.`);
    //Restart the bot after a delay to avoid rapid looping
    client.destroy();
    setTimeout(() => {
      console.log("Attempting to restart bot...");
      startBot();
    }, 5000); // 5-second delay before restart
});

// Graceful shutdown handling
process.on("SIGINT", () => {
  console.log("Bot shutting down gracefully...");
  client.destroy();
  process.exit(0);
});

// Unhandled promise rejection handling
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  //Restart the bot after a delay to avoid rapid looping
  client.destroy();
  setTimeout(() => {
    console.log("Attempting to restart bot...");
    startBot();
  }, 5000); // 5-second delay before restart
});

// Uncaught exception handling
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  // Optionally restart the bot here if critical
  client.destroy();

  //Restart the bot after a delay to avoid rapid looping
  setTimeout(() => {
    console.log("Attempting to restart bot...");
    startBot();
  }, 5000); // 5-second delay before restart
});

// Log in to Discord
async function startBot() {
  try {
    await client.login(process.env.discord_bot_id);
  } catch (error) {
    console.error("Failed to login:", error);
    // Retry after a delay
    setTimeout(startBot, 5000); // Retry after 5 seconds
  }
}

startBot();

// Start the express server
app.listen(port, () => {
  console.log(
    `[${new Date().toLocaleString()}]:> Server is running on port: ${port}`
  );
});
