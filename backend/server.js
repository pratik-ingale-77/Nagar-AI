const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Nagar-AI backend is running"
  });
});

app.post("/api/analyze", (req, res) => {
  res.json({
    category: "Road / Pothole",
    priority: "High",
    confidence: 94,
    department: "Municipal Road Department"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Nagar-AI backend running on port ${PORT}`);
});
