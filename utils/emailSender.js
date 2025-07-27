const nodemailer = require("nodemailer");

/**
 * Email sender - Like having a robot mail carrier! 📮
 */

// Hostinger SMTP Configuration (from your panel settings)
const createTransporter = () => {
  console.log("🔧 Setting up Hostinger SMTP transporter...");

  return nodemailer.createTransport({
    host: "smtp.hostinger.com", // From your Hostinger panel
    port: 465, // SSL port from your panel
    secure: true, // true for port 465 (SSL)
    auth: {
      user: process.env.EMAIL_USER, // support@famedia.co.in
      pass: process.env.EMAIL_PASS, // your support email password
    },
    debug: true, // Show detailed logs
    logger: true, // Enable logging
  });
};

/**
 * Send personalized email based on chat conversation
 */
const sendPersonalizedEmail = async (userInfo, chatHistory) => {
  console.log(`📧 Preparing to send email to: ${userInfo.email}`);

  try {
    const transporter = createTransporter();

    // Test connection first
    await transporter.verify();
    console.log("✅ Email server connection verified");

    // Create personalized content
    const emailContent = createPersonalizedContent(userInfo, chatHistory);

    const mailOptions = {
      from: `"${process.env.COMPANY_NAME || "Your Friendly Chatbot"}" <${
        process.env.EMAIL_USER
      }>`,
      to: userInfo.email,
      subject: `Great chatting with you, ${userInfo.name || "there"}! 🎉`,
      html: emailContent,
      text: stripHtml(emailContent),
    };

    console.log(`📤 Sending email to ${userInfo.email}...`);
    const result = await transporter.sendMail(mailOptions);

    console.log(`✅ Email sent successfully! Message ID: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("❌ Failed to send email:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Create personalized email content based on user info and chat
 */
function createPersonalizedContent(userInfo, chatHistory) {
  const { name, email, businessType, projectGoal } = userInfo;
  const userName = name || email.split("@")[0].replace(/[._]/g, " ");
  const currentTime = new Date().toLocaleString();

  // Get conversation topics
  const topics = extractConversationTopics(chatHistory);

  let emailHtml = `
    <div style="font-family: 'Arial', sans-serif; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; padding: 20px;">
      <div style="background-color: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c3e50; margin: 0; font-size: 28px;">Hi ${userName}! 👋</h1>
          <p style="color: #7f8c8d; margin: 5px 0 0 0; font-size: 16px;">Thanks for our awesome chat!</p>
        </div>
        
        <!-- Main Content -->
        <div style="color: #555; line-height: 1.6; font-size: 16px;">
          <p>It was wonderful getting to know you! I really enjoyed our conversation and learning about your interests.</p>`;

  // Add business-specific content
  if (businessType) {
    emailHtml += `
          <p>I'm excited that you're working in <strong style="color: #3498db;">${businessType}</strong>! That's such an interesting and dynamic field.</p>`;
  }

  // Add project goals
  if (projectGoal) {
    emailHtml += `
          <p>Your goal of <em>"${projectGoal}"</em> sounds amazing! 🚀 I'd love to help you achieve that vision.</p>`;
  }

  // Add conversation topics
  if (topics.length > 0) {
    emailHtml += `
          <p>Based on our chat, I can see you're interested in: <strong style="color: #27ae60;">${topics.join(
            ", "
          )}</strong></p>`;
  }

  // Call to action section
  emailHtml += `
        </div>
        
        <!-- Call to Action -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; border-radius: 10px; margin: 25px 0; text-align: center;">
          <h3 style="color: white; margin-top: 0; font-size: 22px;">What's Next? 🌟</h3>
          <p style="color: #f8f9fa; margin-bottom: 20px; font-size: 16px;">
            I'm here whenever you need help! Feel free to continue our conversation anytime.
          </p>`;

  if (process.env.WEBSITE_URL) {
    emailHtml += `
          <a href="${process.env.WEBSITE_URL}" 
             style="background-color: #ffffff; color: #667eea; padding: 14px 28px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold; font-size: 16px; transition: all 0.3s ease;">
            🌐 Visit Our Website
          </a>`;
  }

  emailHtml += `
        </div>
        
        <!-- Personal Touch -->
        <div style="border-top: 2px solid #ecf0f1; padding-top: 20px; margin-top: 20px;">
          <p style="color: #7f8c8d; font-size: 14px; margin: 0;">
            📧 Sent with ❤️ on ${currentTime}<br>
            <em>This personalized email was created based on our chat conversation.</em>
          </p>
        </div>
        
      </div>
      
      <!-- Footer -->
      <div style="text-align: center; margin-top: 20px;">
        <p style="color: #95a5a6; font-size: 12px;">
          © ${new Date().getFullYear()} ${
    process.env.COMPANY_NAME || "Your Company"
  }. Made with 🤖 and ❤️
        </p>
      </div>
    </div>`;

  return emailHtml;
}

/**
 * Extract topics from chat history
 */
function extractConversationTopics(chatHistory) {
  const topics = [];
  const userMessages = chatHistory
    .filter((msg) => msg.role === "user")
    .slice(-8) // Last 8 user messages
    .map((msg) => msg.content.toLowerCase());

  const topicKeywords = {
    "business growth": ["business", "growth", "marketing", "sales", "revenue"],
    "web development": [
      "website",
      "web",
      "development",
      "coding",
      "programming",
    ],
    "mobile apps": ["app", "mobile", "ios", "android", "application"],
    "digital marketing": [
      "marketing",
      "social media",
      "seo",
      "advertising",
      "promotion",
    ],
    design: ["design", "ui", "ux", "graphics", "branding"],
    technology: ["tech", "technology", "software", "system", "digital"],
  };

  userMessages.forEach((message) => {
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some((keyword) => message.includes(keyword))) {
        if (!topics.includes(topic)) {
          topics.push(topic);
        }
      }
    });
  });

  return topics.slice(0, 3); // Max 3 topics
}

/**
 * Remove HTML tags for plain text version
 */
function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { sendPersonalizedEmail };
