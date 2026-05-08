import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "test123";

// 🔹 MongoDB connection
mongoose.connect("mongodb+srv://lakshmana-gundala:Mongodb123@cluster0.mpkvh0j.mongodb.net/Message")
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.log("❌ DB error:", err));

// 🔹 Schema
const messageSchema = new mongoose.Schema({
  wa_id: String,
  name: String,
  direction: String,
  message_id: String,
  text: String,
  type: String,
  status: String,
  timestamp: Date
}, { timestamps: true });

const Message = mongoose.model("Message", messageSchema);

// 🔹 Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 🔹 Webhook receiver
app.post("/webhook", async (req, res) => {
  const body = req.body;

  console.log("📥 Incoming webhook");

  console.log(JSON.stringify(body, null, 2));

  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        console.log("Values:", value);

        if (value.messages) {
          console.log("📩 CUSTOMER MESSAGE");
          console.log(JSON.stringify(value.messages, null, 2));
        }
        
        if (value.statuses) {
          console.log("📦 MESSAGE STATUS");
          console.log(JSON.stringify(value.statuses, null, 2));
        }

        // 🔹 CONTACT INFO
        const contact = value.contacts?.[0];
        const wa_id = contact?.wa_id;
        const name = contact?.profile?.name;

        // ===============================
        // 📩 INCOMING MESSAGES
        // ===============================

        if (value.messages) {
          const contact = value.contacts?.[0];
          for (const msg of value.messages) {
            const savedMessage = await Message.create({
              wa_id: msg.from || "",
              name: contact?.profile?.name || "",
              direction: "inbound",
              message_id: msg.id || "",
              text: msg.text?.body || "",
              type: msg.type || "",
              status: "received",
              timestamp: msg.timestamp
                ? new Date(Number(msg.timestamp) * 1000)
                : new Date()
            });

            console.log("✅ MESSAGE SAVED");
            console.log(savedMessage);
          }
        }
        
        // if (value.messages) {
        //   console.log("value.messages: ", value.messages);
        //   for (const msg of value.messages) {
        //     console.log("msg:", msg);
        //     const savedMessage = await Message.create({
        //       wa_id: msg.from || "",
        //       name: contact?.profile?.name || "",
        //       direction: "inbound",
        //       message_id: msg.id || "",
        //       text: msg.text?.body || "",
        //       type: msg.type || "",
        //       status: "received",
        //       timestamp: msg.timestamp
        //         ? new Date(Number(msg.timestamp) * 1000)
        //         : new Date()
        //     });

        //     // console.log("💾 Saved INBOUND:", msg.text?.body);

        //     console.log("✅ INBOUND SAVED");
        //     console.log(savedMessage);
        //   }
        // }

        // ===============================
        // 📦 STATUS UPDATES (OUTGOING)
        // ===============================
        if (value.statuses) {
          console.log("value.statuses: ", value.statuses);
          for (const status of value.statuses) {
            console.log("status:", status);
            await Message.findOneAndUpdate(
              { message_id: status.id },
              {
                wa_id: status.recipient_id,
                direction: "outbound",
                text: status.text?.body,
                status: status.status,
                timestamp: new Date(Number(status.timestamp) * 1000)
              },
              { upsert: true, new: true }
            );

            console.log("📦 Status:", status.status);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error:", error);
    res.sendStatus(500);
  }
});

// 🔹 Start server
app.listen(process.env.PORT || 5000, () => {
  console.log("🚀 Server running");
});
