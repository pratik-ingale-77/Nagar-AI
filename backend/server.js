const express = require("express");
const cors = require("cors");
const multer = require("multer");
const https = require("https");

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   IMAGE UPLOAD
========================= */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }

    cb(null, true);
  }
});


/* =========================
   HOME / HEALTH CHECK
========================= */

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Nagar-AI backend is running",
    ai: process.env.OPENAI_API_KEY
      ? "configured"
      : "not configured"
  });
});


/* =========================
   OPENAI REQUEST
========================= */

function callOpenAI(requestBody) {

  return new Promise((resolve, reject) => {

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return reject(
        new Error(
          "OPENAI_API_KEY is not configured on Render."
        )
      );
    }

    const data = JSON.stringify(requestBody);

    const options = {
      hostname: "api.openai.com",
      path: "/v1/responses",
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(data)
      }
    };

    const request = https.request(
      options,
      (response) => {

        let body = "";

        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {

          let parsed;

          try {
            parsed = JSON.parse(body);
          } catch {
            return reject(
              new Error(
                "Invalid response received from OpenAI."
              )
            );
          }

          if (
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {

            console.error(
              "OpenAI error:",
              parsed
            );

            return reject(
              new Error(
                parsed?.error?.message ||
                "OpenAI API request failed."
              )
            );
          }

          resolve(parsed);
        });
      }
    );

    request.on("error", (error) => {
      reject(error);
    });

    request.write(data);
    request.end();
  });
}


/* =========================
   EXTRACT AI TEXT
========================= */

function extractOutputText(response) {

  if (response.output_text) {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return "";
  }

  let text = "";

  for (const item of response.output) {

    if (!Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {

      if (
        content.type === "output_text" &&
        content.text
      ) {
        text += content.text;
      }
    }
  }

  return text.trim();
}


/* =========================
   AI IMAGE ANALYSIS
========================= */

app.post(
  "/api/analyze",
  upload.single("image"),
  async (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({
          success: false,
          error: "No image uploaded."
        });
      }

      if (!process.env.OPENAI_API_KEY) {

        return res.status(500).json({
          success: false,
          error:
            "OPENAI_API_KEY is not configured on Render."
        });
      }


      /* Convert image to Base64 */

      const base64Image =
        req.file.buffer.toString("base64");

      const imageData =
        `data:${req.file.mimetype};base64,${base64Image}`;


      /* Send image to OpenAI */

      const requestBody = {

        model: "gpt-5.6-luna",

        input: [

          {
            role: "system",

            content: [

              {
                type: "input_text",

                text: `
You are Nagar-AI, an AI civic problem detection
system for India.

Carefully inspect the uploaded image.

Determine whether the image actually shows
a civic/infrastructure problem.

Possible categories:

Road / Pothole
Garbage
Broken Streetlight
Water Leakage
Damaged Road
Drainage Problem
Other Civic Issue

IMPORTANT:

Do NOT classify every image as a civic issue.

If the image is unrelated, such as a selfie,
person, animal, food, normal room, random object,
ordinary scenery, screenshot or other unrelated
image, mark it as NOT a civic issue.

Return ONLY valid JSON.

For a civic issue:

{
  "is_civic_issue": true,
  "category": "Road / Pothole",
  "priority": "High",
  "confidence": 94,
  "department": "Municipal Road Department",
  "description": "Short description of the visible problem",
  "message": "Civic issue detected successfully"
}

For an unrelated image:

{
  "is_civic_issue": false,
  "category": "Not a Civic Issue",
  "priority": "None",
  "confidence": 98,
  "department": "None",
  "description": "The uploaded image does not show a recognizable civic problem.",
  "message": "Please upload a photo of a pothole, garbage, damaged road, broken streetlight, drainage issue or water leakage."
}

Never invent details that cannot be seen.
`
              }

            ]
          },

          {
            role: "user",

            content: [

              {
                type: "input_text",
                text: "Analyze this image for a civic problem."
              },

              {
                type: "input_image",
                image_url: imageData
              }

            ]
          }

        ]
      };


      const aiResponse =
        await callOpenAI(requestBody);

      const aiText =
        extractOutputText(aiResponse);


      if (!aiText) {
        throw new Error(
          "AI returned an empty response."
        );
      }


      /* Remove markdown fences if returned */

      const cleanedText =
        aiText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();


      let result;

      try {

        result = JSON.parse(cleanedText);

      } catch {

        console.error(
          "Invalid AI JSON:",
          aiText
        );

        throw new Error(
          "AI returned an invalid analysis."
        );
      }


      /* Return result to frontend */

      res.json({

        success: true,

        is_civic_issue:
          Boolean(result.is_civic_issue),

        category:
          result.category || "Unknown",

        priority:
          result.priority || "Unknown",

        confidence:
          Number(result.confidence) || 0,

        department:
          result.department ||
          "Municipal Department",

        description:
          result.description || "",

        message:
          result.message ||
          "Analysis completed successfully."

      });

    } catch (error) {

      console.error(
        "IMAGE ANALYSIS ERROR:",
        error
      );

      res.status(500).json({

        success: false,

        error:
          error.message ||
          "Unable to analyze the image."

      });
    }
  }
);


/* =========================
   REVERSE GEOCODING
   GPS → REAL ADDRESS
========================= */

app.get(
  "/api/reverse-geocode",
  async (req, res) => {

    try {

      const latitude =
        Number(req.query.lat);

      const longitude =
        Number(req.query.lon);


      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Valid latitude and longitude are required."

        });
      }


      const url =
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=18&addressdetails=1`;


      const response =
        await fetch(url, {

          headers: {
            "User-Agent":
              "Nagar-AI/1.0 civic-reporting-app"
          }

        });


      if (!response.ok) {
        throw new Error(
          "Unable to find the address."
        );
      }


      const data =
        await response.json();


      res.json({

        success: true,

        address:
          data.display_name ||
          "Address not available",

        latitude,

        longitude,

        details:
          data.address || {}

      });

    } catch (error) {

      console.error(
        "GEOCODING ERROR:",
        error
      );

      res.status(500).json({

        success: false,

        error:
          "Unable to retrieve the actual address."

      });
    }
  }
);


/* =========================
   ERROR HANDLER
========================= */

app.use(
  (error, req, res, next) => {

    console.error(error);

    res.status(500).json({

      success: false,

      error:
        error.message ||
        "Something went wrong."

    });
  }
);


/* =========================
   START SERVER
========================= */

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    `Nagar-AI backend running on port ${PORT}`
  );

  console.log(
    `OpenAI configured: ${
      process.env.OPENAI_API_KEY
        ? "YES"
        : "NO"
    }`
  );

});
