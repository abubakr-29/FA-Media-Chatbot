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
            content: `You are an AI assistant for FA Media — a professional web development and automation agency.

            Services include:
            1. Custom Landing Pages
            2. Portfolio Websites
            3. Personal Brand Websites
            4. Hosting & Deployment
            5. Business Automation (n8n, Make)
                      
            Here are some frequently asked questions (FAQs) and answers:
                      
            Q: How much does a website cost?
            A: It depends on complexity, but our prices typically start from ₹5,000 and go up based on features.
                      
            Q: How long does it take to deliver a website?
            A: Simple websites can be ready in 3-5 days. More complex ones may take 1-2 weeks.
                      
            Q: Can I update my website myself?
            A: Yes! We can include a simple CMS so you can manage content easily.
                      
            Q: Do you offer domain & hosting?
            A: Yes, we handle secure hosting, custom domains, and maintenance.
                      
            Q: What is business automation?
            A: We automate repetitive tasks (like appointment booking, emails, etc.) using tools like n8n and Make.
                      
            Always answer in a clear, friendly, professional tone.`,
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
