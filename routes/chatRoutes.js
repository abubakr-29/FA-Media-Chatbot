const express = require("express");
const axios = require("axios");
const systemPrompt = require("../prompts/faMediaPrompts");

const router = express.Router();
const chatMemory = {};

// @route POST /api/chat
// @desc Post the chat to Groq
// @access Public
router.post("/", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required." });
    }

    // 🧠 Initialize memory if session doesn't exist
    if (!chatMemory[sessionId]) {
      chatMemory[sessionId] = {
        history: [{ role: "system", content: systemPrompt }],
        userInfo: {
          name: null,
          email: null,
          phone: null,
        },
        leadSaved: false,
        leadStep: 0, // 0 = ask name, 1 = ask email, 2 = ask phone, 3 = done
      };
    }

    chatMemory[sessionId].history.push({ role: "user", content: message });

    const session = chatMemory[sessionId];
    const userInfo = session.userInfo;

    if (session.leadStep === 0) {
      if (!session.askedName) {
        session.askedName = true;
        return res.json({
          reply: "Hey there! Just before we begin, could I get your name?",
        });
      } else {
        userInfo.name = message.trim();
        session.leadStep = 1;
        return res.json({
          reply: "Great, and what email should I use in case we follow up?",
        });
      }
    }

    if (session.leadStep === 1) {
      userInfo.email = message.trim();
      session.leadStep = 2;
      return res.json({
        reply: "Thanks! Lastly, your phone number (feel free to skip)?",
      });
    }

    if (session.leadStep === 2) {
      userInfo.phone = message.trim();
      session.leadStep = 3;

      // Save to leads
      if (!session.leadSaved) {
        try {
          await axios.post(`${process.env.BACKEND_URL}/api/leads`, {
            name: userInfo.name,
            email: userInfo.email,
            phone: userInfo.phone || "",
          });
          session.leadSaved = true;
        } catch (error) {
          console.error("Failed to save lead:", error.message);
        }
      }

      return res.json({
        reply: `Awesome, ${userInfo.name}! How can I help you today?`,
      });
    }

    if (!chatMemory[sessionId].leadSaved) {
      try {
        await axios.post(`${process.env.BACKEND_URL}/api/leads`, {
          name: userInfo.name,
          email: userInfo.email,
          phone: userInfo.phone || "",
        });

        chatMemory[sessionId].leadSaved = true;
      } catch (error) {
        console.error("Failed to save lead:", error.message);
      }
    }

    if (session.leadStep < 3) {
      return; // We already returned during the lead collection
    }

    const limitedHistory = chatMemory[sessionId].history.slice(-12);

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: limitedHistory,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    chatMemory[sessionId].history.push({
      role: "assistant",
      content: aiResponse,
    });

    res.json({ reply: aiResponse });
  } catch (err) {
    console.error("Chat error:", err.message);
    res
      .status(500)
      .json({ error: "AI service unavailable. Please try again shortly." });
  }
});

module.exports = router;
