import express from "express";

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

app.post("/webhook", (req, res) => {
  console.log("Webhook:", req.body);

  console.log("FULL QUERY:", req.query);

  res.sendStatus(200);
  
  return res.status(200).send(req.query["hub.challenge"]);
});

app.listen(process.env.PORT || 5000);
