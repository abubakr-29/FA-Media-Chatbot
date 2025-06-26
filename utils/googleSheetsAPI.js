const { google } = require("googleapis");
const creds = JSON.parse(process.env.GOOGLE_SERVICE_CREDS);

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: creds.client_email,
    private_key: creds.private_key.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const writeToSheet = async (values, range = "Sheet1!A1") => {
  try {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: authClient });
    const name = values[0][0];
    const email = values[0][1];

    const read = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "Sheet1!A2:B", // Adjust based on your data layout
    });

    const existingEmails = read.data.values?.map((row) => row[1]) || [];

    if (existingEmails.includes(email)) {
      return { success: false, response: "Email already exists." };
    }

    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range,
      valueInputOption: "USER_ENTERED",
      resource: {
        values,
      },
    });
    console.log("✅ Data written:", res.statusText);
    return { success: true, response: res };
  } catch (error) {
    console.error("❌ Google Sheets Error:", error.message);
    return { success: false, error };
  }
};

module.exports = { writeToSheet };
