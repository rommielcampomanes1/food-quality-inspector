const express = require("express");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

const HISTORY_DIR = path.join(ROOT, "history");
const UPLOADS_DIR = path.join(ROOT, "uploads");
const HISTORY_FILE = path.join(HISTORY_DIR, "inspections.json");

/* =========================================================
   CREATE STORAGE FOLDERS
========================================================= */

if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, {
    recursive: true
  });
}

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, {
    recursive: true
  });
}

if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(
    HISTORY_FILE,
    JSON.stringify([], null, 2),
    "utf8"
  );
}

/* =========================================================
   EXPRESS
========================================================= */

app.use(
  express.json({
    limit: "20mb"
  })
);

app.use(
  express.static(
    path.join(ROOT, "public")
  )
);

/* Make saved inspection images accessible */
app.use(
  "/uploads",
  express.static(UPLOADS_DIR)
);

/* =========================================================
   HTML PAGES
========================================================= */

const pages = {
  "/": "home.html",
  "/camera": "camera.html",
  "/result": "result.html",
  "/history": "history.html",
  "/details": "details.html"
};

for (
  const [route, file]
  of Object.entries(pages)
) {
  app.get(route, (_req, res) => {
    res.sendFile(
      path.join(
        ROOT,
        "views",
        file
      )
    );
  });
}

/* =========================================================
   HISTORY HELPERS
========================================================= */

function readInspections() {
  try {
    const data = fs.readFileSync(
      HISTORY_FILE,
      "utf8"
    );

    return JSON.parse(data || "[]");
  } catch (error) {
    console.error(
      "Unable to read inspections:",
      error
    );

    return [];
  }
}

function writeInspections(records) {
  fs.writeFileSync(
    HISTORY_FILE,
    JSON.stringify(
      records,
      null,
      2
    ),
    "utf8"
  );
}

/* =========================================================
   SAVE IMAGE TO SERVER
========================================================= */

function saveBase64Image(
  dataUrl,
  id
) {
  if (
    !dataUrl ||
    typeof dataUrl !== "string"
  ) {
    return "";
  }

  const match = dataUrl.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
  );

  if (!match) {
    return "";
  }

  const mimeType = match[1];
  const base64Data = match[2];

  let extension = "jpg";

  if (mimeType.includes("png")) {
    extension = "png";
  } else if (
    mimeType.includes("webp")
  ) {
    extension = "webp";
  }

  const fileName =
    `inspection-${id}.${extension}`;

  const filePath = path.join(
    UPLOADS_DIR,
    fileName
  );

  fs.writeFileSync(
    filePath,
    Buffer.from(
      base64Data,
      "base64"
    )
  );

  return `/uploads/${fileName}`;
}

/* =========================================================
   GEMINI IMAGE ANALYSIS
========================================================= */

app.post(
  "/api/analyze",
  async (req, res) => {
    try {
      const apiKey =
        process.env
          .GEMINI_API_KEY
          ?.trim();

      const model =
        process.env
          .GEMINI_MODEL
          ?.trim() ||
        "gemini-3.6-flash";

      if (!apiKey) {
        return res
          .status(500)
          .json({
            error:
              "GEMINI_API_KEY is missing in .env"
          });
      }

      const { image } = req.body;

      if (
        !image ||
        typeof image !== "string" ||
        !image.includes(",")
      ) {
        return res
          .status(400)
          .json({
            error:
              "A valid image is required."
          });
      }

      const [header, data] =
        image.split(",", 2);

      const mimeTypeMatch =
        header.match(
          /data:(.*?);base64/
        );

      const mimeType =
        mimeTypeMatch?.[1] ||
        "image/jpeg";

      if (!data) {
        return res
          .status(400)
          .json({
            error:
              "The image data is empty."
          });
      }

      const prompt = `
You are a professional food quality inspection assistant.

Inspect only what is visibly supported by the uploaded image.

Do not invent damage, mold, rot, bruising, dehydration, cuts, contamination, or freshness issues that are not clearly visible.

Return ONLY valid JSON.

Use exactly this structure:

{
  "product": "specific visible product name",
  "score": 0,
  "quality": "Good Quality",
  "grade": "Good",
  "analysis": "brief visible-condition assessment",
  "indicators": {
    "freshness": 0,
    "color": 0,
    "surface": 0,
    "damage": 0
  },
  "suggestedDecision": "ACCEPTED",
  "suggestedReason": ""
}

Rules:

1. score must be 0 to 100.
2. freshness must be 0 to 100.
3. color must be 0 to 100.
4. surface must be 0 to 100.
5. damage:
   100 = no visible damage.
   0 = severe visible damage.
6. quality must be:
   "Good Quality"
   or
   "Bad Quality".
7. grade must be:
   "Good"
   or
   "Bad".
8. suggestedDecision must be:
   "ACCEPTED"
   or
   "REJECTED".
9. suggestedReason must be empty when accepted.
10. Inspect every image independently.
11. If the image is unclear, blurry, dark or does not clearly show food, explain that the image is insufficient.
12. Base the result only on visible freshness, color, surface quality, bruising, mold, rot, cuts, dehydration, pest damage and other visible defects.
`;

      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${encodeURIComponent(model)}:generateContent`;

      const response =
        await fetch(url, {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-goog-api-key":
              apiKey
          },

          body: JSON.stringify({
            contents: [
              {
                role: "user",

                parts: [
                  {
                    text: prompt
                  },

                  {
                    inline_data: {
                      mime_type:
                        mimeType,

                      data
                    }
                  }
                ]
              }
            ],

            generationConfig: {
              responseMimeType:
                "application/json",

              temperature: 0.2
            }
          })
        });

      const payload =
        await response.json();

      if (!response.ok) {
        const googleMessage =
          payload?.error?.message ||
          payload?.error?.status ||
          "Gemini analysis failed.";

        if (
          response.status === 429
        ) {
          return res
            .status(429)
            .json({
              error:
                "Gemini quota exceeded. Please wait briefly and try again.",

              details:
                googleMessage
            });
        }

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          return res
            .status(response.status)
            .json({
              error:
                "The Gemini API key is invalid, restricted, expired, or not authorized.",

              details:
                googleMessage
            });
        }

        return res
          .status(response.status)
          .json({
            error:
              googleMessage
          });
      }

      const text =
        payload
          ?.candidates?.[0]
          ?.content?.parts
          ?.map(
            (part) =>
              part.text || ""
          )
          .join("")
          .trim();

      if (!text) {
        throw new Error(
          "Gemini returned an empty result."
        );
      }

      let result;

      try {
        const cleanedText =
          text
            .replace(
              /^```json\s*/i,
              ""
            )
            .replace(
              /^```\s*/i,
              ""
            )
            .replace(
              /```$/i,
              ""
            )
            .trim();

        result =
          JSON.parse(
            cleanedText
          );
      } catch (error) {
        console.error(
          "Gemini raw response:",
          text
        );

        return res
          .status(500)
          .json({
            error:
              "Gemini returned invalid JSON."
          });
      }

      result.product =
        typeof result.product ===
          "string" &&
        result.product.trim()
          ? result.product.trim()
          : "Unknown Product";

      result.score =
        clampScore(
          result.score
        );

      result.indicators =
        result.indicators &&
        typeof result.indicators ===
          "object"
          ? result.indicators
          : {};

      result.indicators.freshness =
        clampScore(
          result.indicators
            .freshness
        );

      result.indicators.color =
        clampScore(
          result.indicators
            .color
        );

      result.indicators.surface =
        clampScore(
          result.indicators
            .surface
        );

      result.indicators.damage =
        clampScore(
          result.indicators
            .damage
        );

      result.quality =
        result.quality ===
        "Bad Quality"
          ? "Bad Quality"
          : "Good Quality";

      result.grade =
        result.grade === "Bad"
          ? "Bad"
          : "Good";

      result.suggestedDecision =
        result
          .suggestedDecision ===
        "REJECTED"
          ? "REJECTED"
          : "ACCEPTED";

      result.suggestedReason =
        typeof result
          .suggestedReason ===
        "string"
          ? result
              .suggestedReason
              .trim()
          : "";

      result.analysis =
        typeof result.analysis ===
          "string" &&
        result.analysis.trim()
          ? result.analysis.trim()
          : "No detailed analysis was returned.";

      if (
        result
          .suggestedDecision ===
        "ACCEPTED"
      ) {
        result.suggestedReason =
          "";
      }

      res.json(result);
    } catch (error) {
      console.error(
        "Analysis error:",
        error
      );

      res
        .status(500)
        .json({
          error:
            error.message ||
            "Analysis failed."
        });
    }
  }
);

/* =========================================================
   SAVE INSPECTION
========================================================= */

app.post(
  "/api/inspections",
  (req, res) => {
    try {
      const {
        image,
        lpo,
        product,
        supplier,
        receiving,
        received,
        expiry,
        score,
        quality,
        grade,
        analysis,
        indicators,
        decision,
        reason
      } = req.body;

      const id = Date.now();

      const imageUrl =
        saveBase64Image(
          image,
          id
        );

      const record = {
        id,

        image: imageUrl,

        lpo:
          lpo ||
          `LPO-${id
            .toString()
            .slice(-7)}`,

        product:
          product ||
          "Unknown Product",

        supplier:
          supplier || "",

        receiving:
          receiving || "",

        received:
          received || "",

        expiry:
          expiry || "",

        score:
          clampScore(score),

        quality:
          quality ||
          "Good Quality",

        grade:
          grade || "Good",

        analysis:
          analysis || "",

        indicators:
          indicators || {},

        decision:
          decision ||
          "ACCEPTED",

        reason:
          decision ===
          "REJECTED"
            ? reason || ""
            : "",

        createdAt:
          new Date()
            .toISOString()
      };

      const records =
        readInspections();

      records.unshift(record);

      writeInspections(records);

      res.json({
        success: true,
        record
      });
    } catch (error) {
      console.error(
        "Save inspection error:",
        error
      );

      res
        .status(500)
        .json({
          error:
            "Unable to save inspection."
        });
    }
  }
);

/* =========================================================
   GET ALL INSPECTIONS
========================================================= */

app.get(
  "/api/inspections",
  (_req, res) => {
    const records =
      readInspections();

    res.json(records);
  }
);

/* =========================================================
   GET ONE INSPECTION
========================================================= */

app.get(
  "/api/inspections/:id",
  (req, res) => {
    const records =
      readInspections();

    const record =
      records.find(
        (item) =>
          String(item.id) ===
          String(
            req.params.id
          )
      );

    if (!record) {
      return res
        .status(404)
        .json({
          error:
            "Inspection not found."
        });
    }

    res.json(record);
  }
);

/* =========================================================
   CLEAR ALL HISTORY
========================================================= */

app.delete(
  "/api/inspections",
  (_req, res) => {
    try {
      const records =
        readInspections();

      for (
        const record
        of records
      ) {
        if (
          record.image &&
          record.image.startsWith(
            "/uploads/"
          )
        ) {
          const fileName =
            path.basename(
              record.image
            );

          const filePath =
            path.join(
              UPLOADS_DIR,
              fileName
            );

          if (
            fs.existsSync(
              filePath
            )
          ) {
            fs.unlinkSync(
              filePath
            );
          }
        }
      }

      writeInspections([]);

      res.json({
        success: true,
        message:
          "Inspection history cleared."
      });
    } catch (error) {
      console.error(
        "Clear history error:",
        error
      );

      res
        .status(500)
        .json({
          error:
            "Unable to clear history."
        });
    }
  }
);

/* =========================================================
   SCORE HELPER
========================================================= */

function clampScore(value) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(number)
    )
  );
}

/* =========================================================
   ERROR HANDLING
========================================================= */

app.use(
  (
    error,
    _req,
    res,
    _next
  ) => {
    console.error(
      "Server error:",
      error
    );

    if (
      error?.type ===
      "entity.too.large"
    ) {
      return res
        .status(413)
        .json({
          error:
            "The selected image is too large."
        });
    }

    res
      .status(500)
      .json({
        error:
          "Unexpected server error."
      });
  }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Food Quality Inspector running at http://localhost:${PORT}`
    );
  }
);