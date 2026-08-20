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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Nagar-AI backend is running",
    ai: GEMINI_API_KEY ? "configured" : "missing"
  });
});

app.post("/api/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No image uploaded"
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Gemini API key is not configured on the server."
      });
    }

    const base64Image = req.file.buffer.toString("base64");

    const prompt = `
You are Nagar-AI, an AI assistant for reporting civic problems in India.

Analyze the uploaded image carefully.

Determine whether the image actually shows a recognizable civic or public infrastructure problem.

Examples:
- Road pothole
- Damaged road
- Garbage or waste
- Broken streetlight
- Water leakage
- Drainage problem
- Damaged public property

If it is NOT a civic problem, do not pretend that it is one.

Return ONLY valid JSON with these fields:

{
  "isCivicIssue": true,
  "category": "Road / Pothole",
  "priority": "High",
  "confidence": 94,
  "department": "Municipal Road Department",
  "message": "Civic issue detected successfully"
}

For a non-civic image return:

{
  "isCivicIssue": false,
  "category": "Not a Civic Issue",
  "priority": "Low",
  "confidence": 0,
  "department": "N/A",
  "message": "The uploaded image does not appear to show a recognizable civic problem."
}

Return JSON only.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(GEMINI_API_KEY),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                },
                {
                  inline_data: {
                    mime_type: req.file.mimetype,
                    data: base64Image
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(500).json({
        error:
          data?.error?.message ||
          "Gemini AI analysis failed."
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({
        error: "Gemini returned no analysis."
      });
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch (error) {
      console.error("Invalid Gemini response:", text);

      return res.status(500).json({
        error: "AI returned an invalid response."
      });
    }

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error("Server error:", error);

    res.status(500).json({
      error: "Unable to analyze the image. Please try again."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Nagar-AI backend running on port ${PORT}`);
});
