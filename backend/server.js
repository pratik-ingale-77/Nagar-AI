const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Nagar-AI backend is running"
  });
});

app.post("/api/analyze", upload.single("image"), (req, res) => {

  if (!req.file) {
    return res.status(400).json({
      error: "No image uploaded"
    });
  }

  /*
    Demo AI response.

    Later, this endpoint will be connected
    to a real computer-vision model.
  */

  res.json({
    success: true,
    category: "Road / Pothole",
    priority: "High",
    confidence: 94,
    department: "Municipal Road Department",
    message: "Civic issue detected successfully"
  });

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Nagar-AI backend running on port ${PORT}`);
});
