import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import axios from "axios";
// import Minio from "minio";
import * as Minio from "minio";
import mime from "mime-types";

dotenv.config();
const app = express();
app.use(express.json());

// ============================================
// MONGODB
// ============================================

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log(err));

// ============================================
// MINIO
// ============================================

// const minioClient = new Minio.Client({
//   endPoint: process.env.MINIO_ENDPOINT,
//   port: Number(process.env.MINIO_PORT),
//   useSSL: process.env.MINIO_USE_SSL === "true",
//   accessKey: process.env.MINIO_ACCESS_KEY,
//   secretKey: process.env.MINIO_SECRET_KEY
// });

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: Number(process.env.MINIO_PORT),
  useSSL: true,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY
});


// ============================================
// CREATE BUCKET
// ============================================

const bucket = process.env.MINIO_BUCKET;

minioClient.bucketExists(bucket, (err, exists) => {
  if (err) return console.log(err);
  if (!exists) {
    minioClient.makeBucket(bucket);
    console.log("✅ MinIO Bucket Created");
  }
});

// ============================================
// SCHEMA
// ============================================

const messageSchema = new mongoose.Schema({
  wa_id: String,
  name: String,
  direction: String,
  message_id: String,
  type: String,
  text: String,
  media: [{
    media_id: String,
    mime_type: String,
    file_name: String,
    minio_path: String,
    public_url: String
  }],
  status: String,
  timestamp: Date
}, { timestamps: true });

const Message = mongoose.model("Message", messageSchema);

// ============================================
// DOWNLOAD MEDIA FROM WHATSAPP
// ============================================

const downloadMedia = async (mediaId) => {
  console.log("Download Media function")
  try {
    // ========================================
    // GET MEDIA URL
    // ========================================
    const mediaResponse = await axios.get(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      {
        headers: {
          Authorization:
            `Bearer ${process.env.ACCESS_TOKEN}`
        }
      }
    );
    const mediaUrl = mediaResponse.data.url;
    console.log("Media URL - ", mediaUrl);

    // ========================================
    // DOWNLOAD FILE
    // ========================================

    const fileResponse = await axios.get(
      mediaUrl,
      {
        responseType: "arraybuffer",
        headers: {
          Authorization:
            `Bearer ${process.env.ACCESS_TOKEN}`
        }
      }
    );

    // ========================================
    // UPLOAD TO MINIO
    // ========================================

    const contentType = fileResponse.headers["content-type"];
    const extension = mime.extension(contentType);
    const fileName = `${mediaId}.${extension}`;
    const fileBuffer = Buffer.from(fileResponse.data);
    console.log("Bucket:", bucket);
    console.log("File:", fileName);
    console.log("Buffer Length:", fileBuffer.length);
  
    await minioClient.putObject(
      bucket,
      fileName,
      fileBuffer,
      fileBuffer.length,
      {
        "Content-Type": contentType
      }
    );
  
    console.log("✅ FILE UPLOADED TO MINIO");
    
    // await minioClient.putObject(
    //   bucket,
    //   fileName,
    //   fileResponse.data,
    //   {
    //     "Content-Type": contentType
    //   }
    // );

    const publicUrl = `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${bucket}/${fileName}`;
    console.log("PublicURL:", publicUrl);
    
    return {
      media_id: mediaId,
      mime_type: contentType,
      file_name: fileName,
      minio_path: `${bucket}/${fileName}`,
      public_url: publicUrl
    };

  } catch (error) {
    console.log("❌ MEDIA DOWNLOAD ERROR");
    console.log(error.response?.data || error.message);
    return null;
  }
};


// ============================================
// WEBHOOK VERIFICATION
// ============================================

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (
    mode === "subscribe" &&
    token === process.env.VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});


// ============================================
// WEBHOOK RECEIVER
// ============================================

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("📥 WEBHOOK");
    console.log(JSON.stringify(body, null, 2));
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        
        console.log("Value:", value);
        
        // ====================================
        // CUSTOMER → BUSINESS
        // ====================================

        if (value.messages) {
          // const contact = value.contacts?.[0];
          // console.log("Contact: ",contact);
          
          for (const msg of value.messages) {
            let mediaFiles = [];
            // console.log("Msg: ", msg);
            console.log("Msg - ", JSON.stringify(msg, null, 2));
            
            // =================================
            // IMAGE
            // =================================
            
            if (msg.image?.id) {
              const uploaded = await downloadMedia(
                  msg.image.id
                );
              if (uploaded)
                mediaFiles.push(uploaded);
            }

            // =================================
            // DOCUMENT
            // =================================

            if (msg.document?.id) {
              const uploaded = await downloadMedia(
                  msg.document.id
                );
              if (uploaded)
                mediaFiles.push(uploaded);
            }

            // =================================
            // VIDEO
            // =================================

            if (msg.video?.id) {
              const uploaded =
                await downloadMedia(
                  msg.video.id
                );
              if (uploaded)
                mediaFiles.push(uploaded);
            }

            // =================================
            // AUDIO
            // =================================

            if (msg.audio?.id) {
              const uploaded =
                await downloadMedia(
                  msg.audio.id
                );
              if (uploaded)
                mediaFiles.push(uploaded);
            }

            // =================================
            // SAVE MESSAGE
            // =================================

            const savedMessage =
              await Message.create({
                wa_id: msg.from,
                // name: contact?.profile?.name || "",
                name: "Lakshmana Rao G",
                direction: "inbound",
                message_id: msg.id,
                type: msg.type,
                text: msg.text?.body || msg.caption || "",
                media: mediaFiles,
                status: "received",
                timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date()
              });
            console.log("✅ MESSAGE SAVED");
            console.log(savedMessage);
          }
        }

        // ====================================
        // STATUS EVENTS
        // ====================================

        if (value.statuses) {
          for (const status of value.statuses) {
            const updated =
              await Message.findOneAndUpdate(
                {message_id: status.id}, {status: status.status,timestamp: status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date()},{new: true}
              );

            console.log("📦 STATUS UPDATED");
            console.log(updated);
          }
        }
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.log("❌ WEBHOOK ERROR");
    console.log(error);
    return res.sendStatus(500);
  }
});


// ============================================
// SEND MESSAGE API
// ============================================

app.post("/send-message", async (req, res) => {
  try {
    const {
      to,
      text,
      mediaLink,
      mediaType
    } = req.body;

    let payload = {
      messaging_product: "whatsapp",
      to
    };

    // ========================================
    // TEXT ONLY
    // ========================================

    if (text && !mediaLink) {
      payload.type = "text";
      payload.text = {
        body: text
      };
    }

    // ========================================
    // MEDIA ONLY / TEXT + MEDIA
    // ========================================

    if (mediaLink && mediaType) {
      payload.type = mediaType;
      payload[mediaType] = {
        link: mediaLink
      };

      if (text) {
        payload[mediaType].caption = text;
      }
    }

    // ========================================
    // SEND TO WHATSAPP
    // ========================================

    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    const messageId = response.data.messages[0].id;

    // ========================================
    // STORE OUTGOING MESSAGE
    // ========================================

    const saved =
      await Message.create({
        wa_id: to,
        direction: "outbound",
        message_id: messageId,
        type: mediaType || "text",
        text: text || "",
        media: mediaLink ? [{ public_url: mediaLink }] : [],
        status: "sent",
        timestamp: new Date()
      });

    console.log("✅ OUTGOING SAVED");
    console.log(saved);
    return res.json(response.data);
  } catch (error) {
    console.log(error.response?.data || error.message);
    return res.status(500).json({
      error: error.message
    });
  }
});


// ============================================
// START SERVER
// ============================================

app.listen(process.env.PORT || 5000, () => {
  console.log(
    `🚀 Server Running`
  );
});
