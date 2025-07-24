const express = require("express");
const axios = require("axios");
const systemPrompt = require("../prompts/faMediaPrompts");
const extractLeadInfo = require("../utils/extractLeadInfo");

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
      };
    }

    chatMemory[sessionId].history.push({ role: "user", content: message });

    const session = chatMemory[sessionId];
    const userInfo = session.userInfo;

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

    // Try to extract lead info dynamically from conversation
    const extracted = await extractLeadInfo(chatMemory[sessionId].history);
    if (extracted) {
      userInfo.name = userInfo.name || extracted.name || null;
      userInfo.email = userInfo.email || extracted.email || null;
      userInfo.phone = userInfo.phone || extracted.phone || null;
      userInfo.businessType =
        userInfo.businessType || extracted.businessType || null;
      userInfo.projectGoal =
        userInfo.projectGoal || extracted.projectGoal || null;
    }

    if (!chatMemory[sessionId].leadSaved) {
      try {
        await axios.post(`${process.env.BACKEND_URL}/api/leads`, {
          name: userInfo.name,
          email: userInfo.email,
          phone: userInfo.phone || "",
          businessType: userInfo.businessType || "",
          projectGoal: userInfo.projectGoal || "",
        });

        chatMemory[sessionId].leadSaved = true;
      } catch (error) {
        console.error("Failed to save lead:", error.message);
      }
    }
  } catch (err) {
    console.error("Chat error:", err.message);
    res
      .status(500)
      .json({ error: "AI service unavailable. Please try again shortly." });
  }
});

module.exports = router;
