const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const chatRoutes = require("./routes/chatRoutes");

dotenv.config();

const leadRoutes = require("./routes/leadsRoutes");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Welcome to FA Media API!");
});

// API Routes
app.use("/api/chat", chatRoutes);
app.use("/api/leads", leadRoutes);

app.listen(PORT, () =>
  console.log(`Server is running on http://localhost:${PORT}`)
);
