const express = require("express");
const cors = require("cors");
const multer = require("multer");
const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Nagar-AI backend is running"
  });
});

app.post("/api/analyze", upload.single("image"), async (req, res) => {

  try {

    if (!req.file) {
      return res.status(400).json({
        error: "No image uploaded"
      });
    }

    const base64Image =
      req.file.buffer.toString("base64");

    const mimeType =
      req.file.mimetype || "image/jpeg";

    const response = await client.responses.create({

      model: "gpt-4.1-mini",

      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
You are Nagar-AI, an AI assistant for reporting civic problems in India.

Analyze the uploaded image and identify whether it shows a civic problem.

Choose the most appropriate category from:
- Road / Pothole
- Garbage
- Broken Streetlight
- Water Leakage
- Damaged Road
- Drainage Problem
- Other

Return ONLY valid JSON in this exact format:

{
  "category": "Road / Pothole",
  "priority": "High",
  "confidence": 94,
  "department": "Municipal Road Department",
  "message": "Brief explanation of what was detected."
}

Rules:
- confidence must be a number from 0 to 100.
- priority must be Low, Medium, or High.
- Do not invent details that cannot be seen.
- If there is no clear civic problem, use category "Other".
`
            },
            {
              type: "input_image",
              image_url:
                `data:${mimeType};base64,${base64Image}`
            }
          ]
        }
      ]

    });


    const text =
      response.output_text || "";

    let result;


    try {

      result = JSON.parse(text);

    } catch (parseError) {

      const cleaned =
        text
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim();

      result = JSON.parse(cleaned);

    }


    res.json({
      success: true,
      category: result.category || "Other",
      priority: result.priority || "Medium",
      confidence: Number(result.confidence) || 0,
      department:
        result.department ||
        "Concerned Municipal Department",
      message:
        result.message ||
        "Civic issue analyzed successfully."
    });


  } catch (error) {

    console.error("AI analysis error:", error);

    res.status(500).json({
      success: false,
      error:
        "Unable to analyze the image. Please try again."
    });

  }

});


const PORT =
  process.env.PORT || 3000;


app.listen(PORT, () => {

  console.log(
    `Nagar-AI backend running on port ${PORT}`
  );

});
