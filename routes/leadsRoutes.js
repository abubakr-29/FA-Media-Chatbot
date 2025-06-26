const express = require("express");
const { writeToSheet } = require("../utils/googleSheetsAPI");

const router = express.Router();

// @route POST /api/leads
// @desc Post the details in Google Sheets
// @access Public
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    if (!name || !email) {
      return res
        .status(400)
        .json({ success: false, message: "Name and email are required." });
    }

    const timestamp = `${new Date().toLocaleDateString()} | ${new Date().toLocaleTimeString()}`;

    const result = await writeToSheet([
      [name, email, phone || "", message || "", timestamp],
    ]);

    if (result.success) {
      return res
        .status(200)
        .json({ success: true, message: "Lead saved to Google Sheet!" });
    } else {
      return res.status(500).json({
        success: false,
        message: `${result?.response} Failed to save lead. Please try again.`,
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to save lead. Please try again.",
    });
  }
});

module.exports = router;
