const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

console.log("Bot Token:", TELEGRAM_BOT_TOKEN ? "Set" : "NOT SET");

let links = {}; // { id: { url, chatId } }

app.use(bodyParser.json());

// Home route
app.get("/", (req, res) => {
  res.send("✅ Backend is running!");
});

// Endpoint: redirect + notify
app.get("/:id", async (req, res) => {
  const id = req.params.id;
  const linkData = links[id];
  console.log("Redirect request for ID:", id);

  if (!linkData) return res.status(404).send("Link not found");

  // Collect visitor info
  const visitorInfo = {
    ip: req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    userAgent: req.headers["user-agent"],
    time: new Date().toISOString()
  };

  console.log("Sending visitor info to chat:", linkData.chatId);

  // Send visitor info to the owner
  await sendMessage(
    linkData.chatId,
    `👀 New visitor on your link!\n\n🔗 Original URL: ${linkData.url}\n🌍 IP: ${visitorInfo.ip}\n📱 User Agent: ${visitorInfo.userAgent}\n⏰ Time: ${visitorInfo.time}`
  );

  // Redirect visitor
  res.redirect(linkData.url);
});

// Helper to send message to Telegram
async function sendMessage(chatId, text) {
  try {
    console.log("Attempting to send message to chat:", chatId);
    const response = await axios.post(`${TELEGRAM_API}/sendMessage`, { 
      chat_id: chatId, 
      text,
      parse_mode: "HTML"
    });
    console.log("Message sent successfully");
    return response.data;
  } catch (err) {
    console.error("Telegram error:", err.response?.data || err.message);
    throw err;
  }
}

// Polling function to get updates
async function pollUpdates() {
  let offset = 0;
  console.log("Starting polling...");
  
  while (true) {
    try {
      console.log("Checking for updates...");
      const response = await axios.get(`${TELEGRAM_API}/getUpdates`, {
        params: { offset, timeout: 10 }
      });
      
      if (response.data.ok && response.data.result.length > 0) {
        console.log("Found", response.data.result.length, "updates");
        for (const update of response.data.result) {
          offset = update.update_id + 1;
          
          if (update.message && update.message.text) {
            const chatId = update.message.chat.id;
            const text = update.message.text.trim();
            console.log("Received message:", text, "from chat:", chatId);
            
            if (text.startsWith("/shorten")) {
              const url = text.split(" ")[1];
              if (!url) {
                await sendMessage(chatId, "❌ Please provide a URL, e.g. /shorten https://example.com");
                continue;
              }

              const id = crypto.randomBytes(4).toString("hex");
              links[id] = { url, chatId };
              console.log("Created link:", id, "->", url, "for chat:", chatId);

              const shortLink = `http://localhost:3000/${id}`;
              await sendMessage(chatId, `✅ Short link created:\n${shortLink}\n\nID: ${id}`);
            }
          }
        }
      } else {
        console.log("No updates found");
      }
    } catch (error) {
      console.error("Polling error:", error.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Start polling
pollUpdates();

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🤖 Bot polling for messages...`);
});
