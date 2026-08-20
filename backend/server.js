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

First determine whether the image actually contains a recognizable civic/public infrastructure problem.

Possible civic problems include:
- Road pothole
- Damaged road
- Garbage/waste
- Broken streetlight
- Water leakage
- Drainage problem
- Damaged public property
- Other genuine civic infrastructure issue

If the image is unrelated to a civic problem, such as a person, animal, food, random object, scenery, selfie, vehicle without a civic issue, etc., DO NOT pretend that it is a civic complaint.

Return ONLY valid JSON in exactly this format:

{
  "isCivicIssue": true,
  "category": "Road / Pothole",
  "priority": "High",
  "confidence": 94,
  "department": "Municipal Road Department",
  "message": "Civic issue detected successfully"
}

If it is NOT a civic problem, return:

{
  "isCivicIssue": false,
  "category": "Not a Civic Issue",
  "priority": "Low",
  "confidence": 0,
  "department": "N/A",
  "message": "The uploaded image does not appear to show a recognizable civic problem."
}

Do not include markdown.
Do not include ```json.
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
    } catch (parseError) {
      console.error("Gemini JSON parsing error:", text);

      return res.status(500).json({
        error: "AI returned an invalid response."
      });
    }

    return res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Unable to analyze the image. Please try again."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Nagar-AI backend running on port ${PORT}`);
});
