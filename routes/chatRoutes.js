const express = require("express");
const axios = require("axios");
const multer = require("multer");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const systemPrompt = require("../prompts/faMediaPrompts");
const extractLeadInfo = require("../utils/extractLeadInfo");
const { validateEmail } = require("../utils/emailValidator");
const { sendPersonalizedEmail } = require("../utils/emailSender");

const router = express.Router();
const chatMemory = {};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "image") {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only image files are allowed!"), false);
      }
    } else if (file.fieldname === "audio") {
      if (file.mimetype.startsWith("audio/")) {
        cb(null, true);
      } else {
        cb(new Error("Only audio files are allowed!"), false);
      }
    } else {
      cb(null, true);
    }
  },
});

// Helper function to initialize session
const initializeSession = (sessionId) => {
  if (!chatMemory[sessionId]) {
    chatMemory[sessionId] = {
      history: [{ role: "system", content: systemPrompt }],
      userInfo: {
        name: null,
        email: null,
        phone: null,
        businessType: null,
        projectGoal: null,
      },
      leadSaved: false,
      emailValidated: false,
      emailValidationAttempts: 0,
    };
  }
  return chatMemory[sessionId];
};

// Helper function for lead extraction and saving
const handleLeadProcessing = async (sessionId, history) => {
  try {
    const session = chatMemory[sessionId];
    const userInfo = session.userInfo;

    const extracted = await extractLeadInfo(history);
    if (extracted) {
      userInfo.name = userInfo.name || extracted.name || null;
      if (!session.emailValidated) {
        userInfo.email = userInfo.email || extracted.email || null;
      }
      userInfo.phone = userInfo.phone || extracted.phone || null;
      userInfo.businessType =
        userInfo.businessType || extracted.businessType || null;
      userInfo.projectGoal =
        userInfo.projectGoal || extracted.projectGoal || null;

      console.log(`📊 Extracted lead info:`, {
        name: userInfo.name,
        email: userInfo.email,
        businessType: userInfo.businessType,
        validated: session.emailValidated,
      });
    }

    // Save to Google Sheets if email is validated
    if (!session.leadSaved && userInfo.email && session.emailValidated) {
      console.log(`💾 Attempting to save lead for: ${userInfo.email}`);

      const leadData = {
        name: userInfo.name || "Unknown",
        email: userInfo.email,
        phone: userInfo.phone || "",
        businessType: userInfo.businessType || "",
        projectGoal: userInfo.projectGoal || "",
      };

      await axios.post(`${process.env.BACKEND_URL}/api/leads`, leadData);
      session.leadSaved = true;

      console.log(`✅ Lead saved successfully for: ${userInfo.email}`);

      // Send personalized email after delay
      if (userInfo.name || userInfo.businessType) {
        console.log(`📧 Scheduling personalized email for: ${userInfo.email}`);

        setTimeout(async () => {
          try {
            const emailResult = await sendPersonalizedEmail(userInfo, history);

            if (emailResult.success) {
              console.log(`✅ Personalized email sent to ${userInfo.email}`);
            } else {
              console.error(
                `❌ Failed to send email to ${userInfo.email}:`,
                emailResult.error
              );
            }
          } catch (emailError) {
            console.error("Email sending error:", emailError.message);
          }
        }, 3000);
      }
    }
  } catch (error) {
    console.error("Lead processing error:", error.message);
  }
};

// @route POST /api/chat
// @desc Regular text chat with OpenAI
// @access Public
router.post("/", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required." });
    }

    // Initialize session
    const session = initializeSession(sessionId);
    const userInfo = session.userInfo;

    console.log(`💬 New message from session ${sessionId}: ${message}`);
    session.history.push({ role: "user", content: message });

    // Email validation logic
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const foundEmails = message.match(emailRegex);
    let emailValidationResponse = null;

    if (foundEmails && foundEmails.length > 0 && !session.emailValidated) {
      const email = foundEmails[0].toLowerCase();
      session.emailValidationAttempts++;

      console.log(
        `🔍 Found email in message: ${email} (Attempt #${session.emailValidationAttempts})`
      );

      if (session.emailValidationAttempts > 5) {
        emailValidationResponse =
          "I notice you're trying many emails. Let's continue with the last valid one, or feel free to contact us directly! 😊";
      } else {
        const validation = await validateEmail(email, true); // Pass true for voice input

        if (validation.isValid) {
          userInfo.email = email;
          session.emailValidated = true;
          emailValidationResponse = `${validation.message}`;
          console.log(
            `✅ Email validated and saved: ${email} (Confidence: ${validation.confidence})`
          );
        } else {
          emailValidationResponse = validation.message;
          if (validation.suggestions.length > 0) {
            emailValidationResponse += ` Perhaps you meant: ${validation.suggestions[0]}?`;
          }
          console.log(`❌ Email validation failed: ${validation.message}`);

          return res.json({
            reply: emailValidationResponse,
            emailValidation: {
              isValid: false,
              message: validation.message,
              suggestions: validation.suggestions,
            },
          });
        }
      }
    }

    // Get limited history and send to OpenAI
    const limitedHistory = session.history.slice(-12);
    console.log(`🤖 Sending to OpenAI with ${limitedHistory.length} messages`);

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: limitedHistory,
        max_tokens: 1000,
        temperature: 0.7,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    let aiResponse = response.data.choices[0].message.content;

    if (emailValidationResponse) {
      aiResponse = emailValidationResponse + "\n\n" + aiResponse;
    }

    session.history.push({
      role: "assistant",
      content: aiResponse,
    });

    res.json({ reply: aiResponse });

    // Background lead processing
    await handleLeadProcessing(sessionId, session.history);
  } catch (err) {
    console.error("❌ Chat route error:", err.message);
    res.status(500).json({
      error: "AI service unavailable. Please try again shortly.",
    });
  }
});

// @route POST /api/chat/image
// @desc Handle image messages with OpenAI Vision
// @access Public
router.post("/image", upload.single("image"), async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const imageFile = req.file;

    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required." });
    }

    if (!imageFile) {
      return res.status(400).json({ error: "No image file provided." });
    }

    // Initialize session
    const session = initializeSession(sessionId);

    console.log(
      `🖼️ Image message from session ${sessionId}: ${message || "Image only"}`
    );

    // Convert image to base64
    const imageBuffer = fs.readFileSync(imageFile.path);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = imageFile.mimetype;

    // Create message for OpenAI with image
    const userMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: message || "What do you see in this image?",
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64Image}`,
          },
        },
      ],
    };

    session.history.push(userMessage);

    // Get limited history and send to OpenAI
    const limitedHistory = session.history.slice(-10);
    console.log(
      `🤖 Sending image to OpenAI with ${limitedHistory.length} messages`
    );

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o", // gpt-4o supports vision
        messages: limitedHistory,
        max_tokens: 1000,
        temperature: 0.7,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const aiResponse = response.data.choices[0].message.content;

    session.history.push({
      role: "assistant",
      content: aiResponse,
    });

    // Clean up uploaded file
    fs.unlinkSync(imageFile.path);

    res.json({ reply: aiResponse });

    // Background lead processing
    await handleLeadProcessing(sessionId, session.history);
  } catch (err) {
    console.error("❌ Image chat route error:", err.message);

    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error("Error cleaning up file:", cleanupError.message);
      }
    }

    res.status(500).json({
      error: "Failed to process image. Please try again.",
    });
  }
});

// @route POST /api/chat/voice
// @desc Handle voice messages with speech-to-text
// @access Public
router.post("/voice", upload.single("audio"), async (req, res) => {
  try {
    const { sessionId } = req.body;
    const audioFile = req.file;

    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required." });
    }

    if (!audioFile) {
      return res.status(400).json({ error: "No audio file provided." });
    }

    // Initialize session
    const session = initializeSession(sessionId);

    console.log(`🎤 Voice message from session ${sessionId}`);

    // Convert audio to text using OpenAI Whisper
    const formData = new FormData();
    formData.append("file", fs.createReadStream(audioFile.path));
    formData.append("model", "whisper-1");
    formData.append("language", "en"); // Force English transcription
    formData.append(
      "prompt",
      "This is a conversation in English about business, marketing, and web development."
    ); // Context hint

    const transcriptionResponse = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const transcribedText = transcriptionResponse.data.text;
    console.log(`📝 Transcribed text: ${transcribedText}`);

    if (!transcribedText.trim()) {
      fs.unlinkSync(audioFile.path);
      return res.json({
        reply:
          "I couldn't hear anything in your voice message. Please try again.",
      });
    }

    // Add transcribed message to chat history
    session.history.push({
      role: "user",
      content: transcribedText,
    });

    // 📧 EMAIL VALIDATION FOR VOICE MESSAGES (same logic as text chat)
    const userInfo = session.userInfo;
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const foundEmails = transcribedText.match(emailRegex);
    let emailValidationResponse = null;

    if (foundEmails && foundEmails.length > 0 && !session.emailValidated) {
      const email = foundEmails[0].toLowerCase();
      session.emailValidationAttempts++;

      console.log(
        `🔍 Found email in voice message: ${email} (Attempt #${session.emailValidationAttempts})`
      );

      if (session.emailValidationAttempts > 5) {
        emailValidationResponse =
          "I notice you're trying many emails. Let's continue with the last valid one, or feel free to contact us directly! 😊";
      } else {
        const validation = await validateEmail(email);

        if (validation.isValid) {
          userInfo.email = email;
          session.emailValidated = true;
          emailValidationResponse = `${validation.message}`;
          console.log(
            `✅ Email validated and saved from voice: ${email} (Confidence: ${validation.confidence})`
          );
        } else {
          emailValidationResponse = validation.message;
          if (validation.suggestions.length > 0) {
            emailValidationResponse += ` Perhaps you meant: ${validation.suggestions[0]}?`;
          }
          console.log(
            `❌ Voice email validation failed: ${validation.message}`
          );

          // Clean up uploaded file
          fs.unlinkSync(audioFile.path);

          return res.json({
            reply: emailValidationResponse,
            transcribedText: transcribedText,
            emailValidation: {
              isValid: false,
              message: validation.message,
              suggestions: validation.suggestions,
            },
          });
        }
      }
    }

    // Get AI response using the transcribed text
    const limitedHistory = session.history.slice(-12);

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: limitedHistory,
        max_tokens: 1000,
        temperature: 0.7,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const aiResponse = response.data.choices[0].message.content;

    // Add email validation message to AI response if present
    let finalResponse = aiResponse;
    if (emailValidationResponse) {
      finalResponse = emailValidationResponse + "\n\n" + aiResponse;
    }

    session.history.push({
      role: "assistant",
      content: finalResponse,
    });

    // Clean up uploaded file
    fs.unlinkSync(audioFile.path);

    res.json({
      reply: finalResponse,
      transcribedText: transcribedText,
    });

    // Background lead processing
    await handleLeadProcessing(sessionId, session.history);
  } catch (err) {
    console.error("❌ Voice chat route error:", err.message);

    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error("Error cleaning up file:", cleanupError.message);
      }
    }

    res.status(500).json({
      error: "Failed to process voice message. Please try again.",
    });
  }
});

// @route POST /api/chat/text-to-speech
// @desc Convert text to speech (optional feature)
// @access Public
router.post("/text-to-speech", async (req, res) => {
  try {
    const { text, voice = "alloy" } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required." });
    }

    console.log(`🗣️ Converting text to speech: ${text.substring(0, 50)}...`);

    const response = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "tts-1",
        input: text,
        voice: voice, // alloy, echo, fable, onyx, nova, shimmer
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      }
    );

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": response.data.length,
    });

    res.send(Buffer.from(response.data));
  } catch (err) {
    console.error("❌ Text-to-speech error:", err.message);
    res.status(500).json({
      error: "Failed to convert text to speech.",
    });
  }
});

module.exports = router;
