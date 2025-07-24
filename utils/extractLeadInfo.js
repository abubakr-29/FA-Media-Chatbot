const { OpenAI } = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const extractLeadInfo = async (messages) => {
  const tools = [
    {
      type: "function",
      function: {
        name: "extract_lead_info",
        description: "Extracts lead data from chat messages",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "User's name" },
            email: { type: "string", description: "User's email" },
            phone: { type: "string", description: "User's phone (optional)" },
            businessType: { type: "string", description: "Type of business" },
            projectGoal: {
              type: "string",
              description: "User's goal or project",
            },
          },
          required: [],
        },
      },
    },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools,
      tool_choice: "auto",
    });

    const choice = response.choices[0];

    // Check if AI used the tool
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      if (toolCall.function.name === "extract_lead_info") {
        const args = JSON.parse(toolCall.function.arguments);

        // Fallback: infer name if missing
        if (!args.name && args.email) {
          const localPart = args.email.split("@")[0];
          const parts = localPart.split(/[._\-]/);
          const inferredName = parts
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(" ");
          args.name = inferredName;
        }

        console.log("Final lead data:", args);

        return args;
      }
    }

    return null;
  } catch (error) {
    console.error("Error extracting lead info:", error);
    return null;
  }
};

module.exports = extractLeadInfo;
