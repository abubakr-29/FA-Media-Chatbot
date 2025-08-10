const axios = require("axios");
const validator = require("validator");

/**
 * Clean up email from voice transcription
 */
const cleanVoiceEmail = (email) => {
  return email
    .toLowerCase()
    .replace(/\s+/g, "") // Remove spaces
    .replace(/at/g, "@") // "at" -> "@"
    .replace(/dot/g, ".") // "dot" -> "."
    .replace(/[^\w@.-]/g, ""); // Remove special chars except valid email chars
};

/**
 * Professional email validator for sales conversations
 */
const validateEmail = async (email, isFromVoice = false) => {
  // Clean up voice transcription if needed
  if (isFromVoice) {
    email = cleanVoiceEmail(email);
    console.log(`🎤 Cleaned voice email: ${email}`);
  }

  console.log(`🔍 Validating email: ${email}`);

  const result = {
    isValid: false,
    message: "",
    suggestions: [],
    confidence: "low",
    shouldContinueSales: false,
  };

  // Step 1: Basic format check
  if (!email || !validator.isEmail(email)) {
    result.message = isFromVoice
      ? "I heard an email but couldn't quite catch it clearly. Could you spell it out for me?"
      : "Could you double-check that email address?";
    console.log(`❌ Invalid format: ${email}`);
    return result;
  }

  // Step 2: Check for common typos
  const [localPart, domain] = email.split("@");
  const commonDomains = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "icloud.com",
    "protonmail.com",
  ];

  const suggestion = findClosestDomain(domain, commonDomains);
  if (suggestion && suggestion !== domain) {
    result.message = `Did you mean ${localPart}@${suggestion}?`;
    result.suggestions.push(`${localPart}@${suggestion}`);
    console.log(`💡 Suggested correction: ${localPart}@${suggestion}`);
    return result;
  }

  // Step 3: Use Hunter.io for professional verification
  if (process.env.HUNTER_API_KEY) {
    try {
      console.log(`🌐 Verifying with Hunter.io...`);

      const response = await axios.get(
        `https://api.hunter.io/v2/email-verifier`,
        {
          params: {
            email: email,
            api_key: process.env.HUNTER_API_KEY,
          },
          timeout: 10000,
        }
      );

      const data = response.data.data;
      console.log(`📊 Hunter.io result: ${data.result}`);

      if (data.result === "deliverable") {
        result.isValid = true;
        result.message = isFromVoice
          ? "Perfect! I got your email. A team member will reach out within 24 hours with your personalized strategy."
          : "Perfect. A team member will reach out within 24 hours with your personalized strategy.";
        result.confidence = "high";
        result.shouldContinueSales = true;
        console.log(`✅ Email verified: ${email}`);
        return result;
      } else if (data.result === "undeliverable") {
        result.message = isFromVoice
          ? "I heard an email but it doesn't seem to be active. Could you try saying another one?"
          : "That email doesn't seem to be active. Mind trying another one?";
        result.confidence = "high";
        console.log(`❌ Email undeliverable: ${email}`);
        return result;
      } else if (data.result === "risky") {
        result.isValid = true;
        result.message = isFromVoice
          ? "Got it! Our team will reach out shortly with next steps."
          : "Got it. Our team will reach out shortly with next steps.";
        result.confidence = "medium";
        result.shouldContinueSales = true;
        console.log(`⚠️ Email risky but accepted: ${email}`);
        return result;
      } else {
        // Unknown result - accept but be cautious
        result.isValid = true;
        result.message = isFromVoice
          ? "Thanks! A team member will be in touch within 24 hours."
          : "Thanks. A team member will be in touch within 24 hours.";
        result.confidence = "medium";
        result.shouldContinueSales = true;
        console.log(`❓ Email unknown but accepted: ${email}`);
        return result;
      }
    } catch (error) {
      console.error(`❌ Hunter.io API error:`, error.message);

      // Fallback - accept email but note the issue
      result.isValid = true;
      result.message = isFromVoice
        ? "Thanks! Our team will contact you within 24 hours."
        : "Thanks. Our team will contact you within 24 hours.";
      result.confidence = "low";
      result.shouldContinueSales = true;
      return result;
    }
  } else {
    // No Hunter.io API key - basic validation only
    console.log(`⚠️ No Hunter.io API key, using basic validation`);
    result.isValid = true;
    result.message = isFromVoice
      ? "Perfect! A team member will reach out shortly."
      : "Perfect. A team member will reach out shortly.";
    result.confidence = "low";
    result.shouldContinueSales = true;
    return result;
  }
};

/**
 * Find closest matching domain for typo correction
 */
function findClosestDomain(domain, commonDomains) {
  const threshold = 2; // Maximum character differences allowed

  for (const commonDomain of commonDomains) {
    if (getEditDistance(domain, commonDomain) <= threshold) {
      return commonDomain;
    }
  }
  return null;
}

/**
 * Calculate edit distance between two strings (Levenshtein distance)
 */
function getEditDistance(str1, str2) {
  const matrix = Array(str2.length + 1)
    .fill()
    .map(() => Array(str1.length + 1).fill(0));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i - 1] + 1, // substitution
          matrix[j][i - 1] + 1, // insertion
          matrix[j - 1][i] + 1 // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Enhanced validation with business context
 */
const validateBusinessEmail = async (email, userContext = {}) => {
  const baseResult = await validateEmail(email);

  // Add business-specific enhancements
  if (baseResult.isValid && baseResult.shouldContinueSales) {
    const { name, projectType, urgency } = userContext;

    // Customize message based on context
    if (urgency === "urgent") {
      baseResult.message = `Got it${
        name ? `, ${name}` : ""
      }. Given the urgency, someone from our team will reach out today.`;
    } else if (projectType) {
      baseResult.message = `Perfect${
        name ? `, ${name}` : ""
      }. Our ${projectType} specialist will contact you within 24 hours with a tailored strategy.`;
    }
  }

  return baseResult;
};

module.exports = {
  validateEmail,
  validateBusinessEmail,
};
