const express = require("express");
const axios = require("axios");
const systemPrompt = require("../prompts/faMediaPrompts");
const extractLeadInfo = require("../utils/extractLeadInfo");
const { validateEmail } = require("../utils/emailValidator");
const { sendPersonalizedEmail } = require("../utils/emailSender");

const router = express.Router();
const chatMemory = {};

// @route POST /api/chat
// @desc Post the chat to Groq with advanced email validation
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
        emailValidated: false,
        emailValidationAttempts: 0, // Track validation attempts
      };
    }

    console.log(`💬 New message from session ${sessionId}: ${message}`);
    chatMemory[sessionId].history.push({ role: "user", content: message });

    const session = chatMemory[sessionId];
    const userInfo = session.userInfo;

    // 📧 LOOK FOR EMAIL IN THE MESSAGE
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const foundEmails = message.match(emailRegex);

    let emailValidationResponse = null;

    // If we found an email, validate it with Hunter.io!
    if (foundEmails && foundEmails.length > 0 && !session.emailValidated) {
      const email = foundEmails[0].toLowerCase(); // Take first email and make lowercase
      session.emailValidationAttempts++;

      console.log(
        `🔍 Found email in message: ${email} (Attempt #${session.emailValidationAttempts})`
      );

      // Prevent too many validation attempts (spam protection)
      if (session.emailValidationAttempts > 5) {
        emailValidationResponse =
          "I notice you're trying many emails. Let's continue with the last valid one, or feel free to contact us directly! 😊";
      } else {
        // Validate with Hunter.io
        const validation = await validateEmail(email);

        if (validation.isValid) {
          // ✅ Email is validated!
          userInfo.email = email;
          session.emailValidated = true;
          emailValidationResponse = `${validation.message}`;

          console.log(
            `✅ Email validated and saved: ${email} (Confidence: ${validation.confidence})`
          );
        } else {
          // ❌ Email has issues
          emailValidationResponse = validation.message;

          // Add suggestions if available
          if (validation.suggestions.length > 0) {
            emailValidationResponse += ` Perhaps you meant: ${validation.suggestions[0]}?`;
          }

          console.log(`❌ Email validation failed: ${validation.message}`);

          // Return early with validation message only
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

    // Get limited chat history for AI
    const limitedHistory = chatMemory[sessionId].history.slice(-12);

    console.log(`🤖 Sending to AI with ${limitedHistory.length} messages`);

    // Get AI response from Groq
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

    let aiResponse = response.data.choices[0].message.content;

    // Add email validation message to AI response
    if (emailValidationResponse) {
      aiResponse = emailValidationResponse + "\n\n" + aiResponse;
    }

    // Save AI response to memory
    chatMemory[sessionId].history.push({
      role: "assistant",
      content: aiResponse,
    });

    // Send response to user
    res.json({ reply: aiResponse });

    // 🔍 EXTRACT LEAD INFORMATION (in background)
    try {
      const extracted = await extractLeadInfo(chatMemory[sessionId].history);
      if (extracted) {
        userInfo.name = userInfo.name || extracted.name || null;
        // Only update email if we haven't validated one yet
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
    } catch (extractError) {
      console.error("Lead extraction error:", extractError.message);
    }

    // 💾 SAVE TO GOOGLE SHEETS (only if email is validated)
    if (
      !chatMemory[sessionId].leadSaved &&
      userInfo.email &&
      session.emailValidated
    ) {
      console.log(`💾 Attempting to save lead for: ${userInfo.email}`);

      try {
        const leadData = {
          name: userInfo.name || "Unknown",
          email: userInfo.email,
          phone: userInfo.phone || "",
          businessType: userInfo.businessType || "",
          projectGoal: userInfo.projectGoal || "",
        };

        await axios.post(`${process.env.BACKEND_URL}/api/leads`, leadData);
        chatMemory[sessionId].leadSaved = true;

        console.log(`✅ Lead saved successfully for: ${userInfo.email}`);

        // 📧 SEND PERSONALIZED EMAIL (after a short delay)
        if (userInfo.name || userInfo.businessType) {
          console.log(
            `📧 Scheduling personalized email for: ${userInfo.email}`
          );

          setTimeout(async () => {
            try {
              const emailResult = await sendPersonalizedEmail(
                userInfo,
                chatMemory[sessionId].history
              );

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
          }, 3000); // Wait 3 seconds before sending email
        }
      } catch (saveError) {
        console.error("Failed to save lead:", saveError.message);
      }
    }
  } catch (err) {
    console.error("❌ Chat route error:", err.message);
    res.status(500).json({
      error: "AI service unavailable. Please try again shortly.",
    });
  }
});

module.exports = router;
