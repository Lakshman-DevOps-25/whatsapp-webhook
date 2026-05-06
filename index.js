import express from "express";
import mongoose from "mongoose";

mongoose.connect("mongodb+srv://lakshmana-gundala:Mongodb123@cluster0.mpkvh0j.mongodb.net");

const MessageSchema = new mongoose.Schema({
  from: String,
  text: String,
  time: Date
});

const Message = mongoose.model("Message", MessageSchema);

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "test123";

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  const body = req.body;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;

      // 📩 Incoming messages
      if (value.messages) {
        for (const msg of value.messages) {
          await Message.create({
            from: msg.from,
            text: msg.text?.body,
            timestamp: new Date()
          });

          console.log("💾 Message saved:", msg.text?.body);
        }
      }

      // 📦 Status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          await Message.create({
            from: status.recipient_id,
            status: status.status,
            timestamp: new Date()
          });

          console.log("📦 Status saved:", status.status);
        }
      }
    }
  }

  res.sendStatus(200);
});

// app.post("/webhook", (req, res) => {
//   try {
//     console.log("🔥 FULL BODY:");
//     console.log(JSON.stringify(req.body, null, 2));
  
//     const body = req.body;
  
//     body.entry?.forEach(entry => {
//       entry.changes?.forEach(change => {
//         console.log("👉 CHANGE FIELD:", change.field);
//         console.log("👉 VALUE:", JSON.stringify(change.value, null, 2));
//       });
//     });
  
//     const savedMessage = await Message.create({
//       from: msg.from,
//       text: msg.text?.body,
//       time: new Date()
//     });
  
//     res.sendStatus(200);
//   } catch (err) {
//     console.error("❌ ERROR:", err.response?.data || err.message);

//     return res.status(500).json({
//       success: false,
//       error: err.response?.data || err.message
//     });
//   }  
// });

app.listen(process.env.PORT || 5000);
