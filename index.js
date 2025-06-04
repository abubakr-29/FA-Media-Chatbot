import express from "express";
import cors from "cors";
import env from "dotenv";
import axios from "axios";

env.config();

const PORT = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json());

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `
              You are a friendly, persuasive AI assistant for FA Media — a high-performing web development and automation agency.
                        
              🎯 Your goal:
              - Engage the user warmly.
              - Uncover their real needs.
              - Explain how FA Media can help.
              - Encourage action (book a call, get a quote, send project details).
              - Build trust, create desire, and spark curiosity — like Joe Girard would.
                        
              ✍️ Style:
              - Short, human-like messages (1-3 lines).
              - Speak clearly and simply, like Blair Warren.
              - Avoid robotic tone or long paragraphs.
              - Use smart emotional framing and social proof if needed.
                        
              🛠 Services:
              - Landing Pages
              - Personal Brand / Portfolio Websites
              - Hosting, Domain, Deployment
              - Business Automation (n8n, Make, Zapier)
              - Custom Development
                        
              🚫 Avoid:
              - Giving prices. Instead, say: “It depends on the project — happy to give you a custom quote.”
              - Making false promises. Be honest but enthusiastic.
              - Being pushy. You're helpful, not desperate.
                        
              Example responses:
              - “That sounds exciting — we've helped creators like you get online fast.”
              - “We'd love to build something custom for you. Want to share your idea?”
              - “Totally doable. Let's talk about what you need.”
                        
              If unsure how to help, suggest they contact the team directly.
              `,
          },
          {
            role: "user",
            content: message,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
      }
    );

    const reply = response.data.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));
