const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;


/* =========================================================
   SUPABASE
========================================================= */

const SUPABASE_URL =
  process.env.SUPABASE_URL?.trim();

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY?.trim();

if (!SUPABASE_URL) {
  throw new Error(
    "SUPABASE_URL is missing in .env"
  );
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error(
    "SUPABASE_SECRET_KEY is missing in .env"
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

const STORAGE_BUCKET =
  "inspection-images";


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

for (const [route, file] of Object.entries(pages)) {
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
   IMAGE HELPERS
========================================================= */

function parseBase64Image(dataUrl) {

  if (
    !dataUrl ||
    typeof dataUrl !== "string"
  ) {
    return null;
  }

  const match =
    dataUrl.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
    );

  if (!match) {
    return null;
  }

  const mimeType =
    match[1];

  const base64Data =
    match[2];

  let extension =
    "jpg";

  if (mimeType.includes("png")) {
    extension = "png";
  }

  else if (mimeType.includes("webp")) {
    extension = "webp";
  }

  return {
    mimeType,
    extension,
    buffer:
      Buffer.from(
        base64Data,
        "base64"
      )
  };
}


async function uploadInspectionImage(
  dataUrl,
  id
) {

  const image =
    parseBase64Image(
      dataUrl
    );

  if (!image) {
    return {
      publicUrl: "",
      storagePath: ""
    };
  }

  const storagePath =
    `inspections/inspection-${id}.${image.extension}`;

  const {
    error: uploadError
  } =
    await supabase
      .storage
      .from(STORAGE_BUCKET)
      .upload(
        storagePath,
        image.buffer,
        {
          contentType:
            image.mimeType,

          upsert:
            false
        }
      );

  if (uploadError) {
    throw new Error(
      `Image upload failed: ${uploadError.message}`
    );
  }

  const { data } =
    supabase
      .storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(
        storagePath
      );

  return {
    publicUrl:
      data?.publicUrl || "",

    storagePath
  };
}


/* =========================================================
   MAP DATABASE ROW → FRONTEND FORMAT
========================================================= */

function mapInspectionRow(row) {

  return {

    id:
      row.id,

    image:
      row.image_url || "",

    lpo:
      row.lpo_number || "",

    product:
      row.product_name ||
      "Unknown Product",

    supplier:
      row.supplier_farm || "",

    receiving:
      row.receiving_type || "",

    received:
      row.received_date || "",

    expiry:
      row.expiry_date || "",

    score:
      Number(
        row.quality_score
      ) || 0,

    quality:
      row.quality_result ||
      "Good Quality",

    grade:
      row.quality_result ===
      "Bad Quality"
        ? "Bad"
        : "Good",

    analysis:
      row.quality_analysis ||
      "",

    indicators:
      row.quality_indicators ||
      {},

    decision:
      row.quality_result ===
      "Bad Quality"
        ? "REJECTED"
        : "ACCEPTED",

    reason:
      row.reason_rejection ||
      "",

    createdAt:
      row.created_at
  };
}


/* =========================================================
   FPO FORMATTER
========================================================= */

async function getFinalFpo(
  enteredValue
) {

  const raw =
    String(
      enteredValue || ""
    ).trim();


  /* USER ENTERED A NUMBER */

  if (raw) {

    const cleaned =
      raw
        .replace(
          /^FPO2027/i,
          ""
        )
        .replace(
          /^FPO/i,
          ""
        )
        .replace(
          /\D/g,
          ""
        );

    if (cleaned) {
      return `FPO2027${cleaned}`;
    }
  }


  /* BLANK FIELD → GENERATE NEXT SEQUENTIAL NUMBER */

  const {
    data,
    error
  } =
    await supabase
      .from("inspections")
      .select("lpo_number")
      .like(
        "lpo_number",
        "FPO2027%"
      );

  if (error) {
    throw new Error(
      `Unable to generate FPO number: ${error.message}`
    );
  }


  let highest =
    0;


  for (const record of data || []) {

    const match =
      String(
        record.lpo_number || ""
      ).match(
        /^FPO2027(\d{4})$/i
      );

    if (!match) {
      continue;
    }

    const number =
      Number(
        match[1]
      );

    if (
      Number.isFinite(
        number
      )
    ) {
      highest =
        Math.max(
          highest,
          number
        );
    }
  }


  const next =
    highest + 1;


  return (
    `FPO2027${String(next)
      .padStart(4, "0")}`
  );
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


      const {
        image
      } =
        req.body;


      if (
        !image ||
        typeof image !==
          "string" ||
        !image.includes(",")
      ) {

        return res
          .status(400)
          .json({
            error:
              "A valid image is required."
          });

      }


      const [
        header,
        data
      ] =
        image.split(
          ",",
          2
        );


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
You are a professional food quality inspection assistant for receiving and quality-control inspections.

Your job is to inspect the ENTIRE VISIBLE PRODUCT AREA in the uploaded image.

IMPORTANT:
If the image contains multiple pieces of the same product, such as a box of tomatoes, tray of strawberries, crate of vegetables, group of fish, poultry, meat, fruits, or other food products, you MUST evaluate the WHOLE VISIBLE BATCH.

Do NOT focus only on:
- the largest item
- the closest item
- the clearest item
- the best-looking item
- the worst-looking item

Evaluate all clearly visible items together.

If only one product or item is visible, inspect that individual item normally.

BATCH INSPECTION RULES:

1. Look across the entire visible image.

2. Identify the main food product being inspected.

3. If multiple pieces of the same product are visible, treat them as ONE inspection batch.

4. Consider both good and defective visible items when calculating the result.

5. Do not mark the whole batch Good Quality just because one or several items look good.

6. Do not mark the whole batch Bad Quality just because one small defect exists.

7. The overall score must represent the general condition of the entire visible batch.

8. Look for visible differences between items, including:
   - freshness
   - color
   - bruising
   - mold
   - rot
   - cuts
   - cracks
   - dehydration
   - shriveling
   - discoloration
   - surface damage
   - pest damage
   - contamination
   - deterioration
   - other clearly visible defects

9. If good and defective products are mixed together, mention this clearly in the analysis.

10. Give more importance to defects when they appear repeatedly across the visible batch.

11. A small isolated defect should have less impact than defects affecting many visible items.

12. Never assume the condition of products that are hidden underneath other products or outside the image.

13. If some products are obscured, overlapping, blurry, dark, or not clearly visible, assess only the visible portion.

14. Never claim that you inspected every item in a container if every item cannot actually be seen.

15. Do not invent damage, mold, rot, bruising, contamination, or freshness problems that are not visibly supported by the image.

16. The analysis should describe the condition of the visible batch, not just one individual item, whenever multiple items are visible.

SCORING:

The overall score must represent the ENTIRE VISIBLE BATCH.

A batch where nearly all visible products appear fresh and undamaged should receive a high score.

A batch where most products are acceptable but several visible products have defects should receive a reduced score reflecting those defects.

A batch containing many visibly damaged, spoiled, moldy, rotten, severely discolored, or deteriorated products should receive a low score.

Do not automatically give very high scores such as 90-100 simply because the product is recognizable or generally looks fresh.

Use the full 0-100 range when appropriate.

INDICATORS:

freshness:
100 = excellent visible freshness across the batch.
0 = severe visible deterioration.

color:
100 = normal and healthy color across the visible batch.
0 = severe abnormal discoloration.

surface:
100 = clean and healthy visible surfaces.
0 = severe visible surface deterioration.

damage:
100 = no meaningful visible damage.
0 = severe visible damage affecting the batch.

QUALITY DECISION:

Use "Good Quality" when the overall visible batch appears acceptable.

Use "Bad Quality" when visible defects are sufficiently serious or widespread that the batch should be rejected.

If the image quality is insufficient to confidently assess the products, clearly state this in the analysis and avoid pretending to see defects.

Return ONLY valid JSON.

Use exactly this structure:

{
  "product": "specific visible product name",
  "score": 0,
  "quality": "Good Quality",
  "grade": "Good",
  "analysis": "brief assessment of the entire visible batch",
  "indicators": {
    "freshness": 0,
    "color": 0,
    "surface": 0,
    "damage": 0
  },
  "suggestedDecision": "ACCEPTED",
  "suggestedReason": ""
}

FINAL RULES:

- score must be 0 to 100.
- freshness must be 0 to 100.
- color must be 0 to 100.
- surface must be 0 to 100.
- damage must be 0 to 100.
- quality must be exactly "Good Quality" or "Bad Quality".
- grade must be exactly "Good" or "Bad".
- suggestedDecision must be exactly "ACCEPTED" or "REJECTED".
- suggestedReason must be empty when ACCEPTED.
- Inspect every uploaded image independently.
- Base all conclusions only on visible evidence.
`;


      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${encodeURIComponent(model)}:generateContent`;


      const response =
        await fetch(
          url,
          {

            method:
              "POST",

            headers: {

              "Content-Type":
                "application/json",

              "x-goog-api-key":
                apiKey

            },

            body:
              JSON.stringify({

                contents: [
                  {

                    role:
                      "user",

                    parts: [
                      {

                        text:
                          prompt

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

                  temperature:
                    0.2

                }

              })

          }
        );


      const payload =
        await response.json();


      if (!response.ok) {

        const googleMessage =
          payload
            ?.error
            ?.message ||
          payload
            ?.error
            ?.status ||
          "Gemini analysis failed.";


        if (
          response.status ===
          429
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
          response.status ===
            401 ||
          response.status ===
            403
        ) {

          return res
            .status(
              response.status
            )
            .json({

              error:
                "The Gemini API key is invalid, restricted, expired, or not authorized.",

              details:
                googleMessage

            });

        }


        return res
          .status(
            response.status
          )
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

      }

      catch (error) {

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
        result.grade ===
        "Bad"
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


      res.json(
        result
      );

    }

    catch (error) {

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
   SAVE INSPECTION TO SUPABASE
========================================================= */

app.post(
  "/api/inspections",
  async (req, res) => {

    let uploadedPath =
      "";

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

      } =
        req.body;


      const id =
        Date.now();


      /* FPO NUMBER */

      const finalLpo =
        await getFinalFpo(
          lpo
        );


      /* SAVE IMAGE */

      const {
        publicUrl,
        storagePath
      } =
        await uploadInspectionImage(
          image,
          id
        );


      uploadedPath =
        storagePath;


      const finalDecision =
        decision ===
        "REJECTED"
          ? "REJECTED"
          : "ACCEPTED";


      const finalQuality =
        finalDecision ===
        "REJECTED"
          ? "Bad Quality"
          : (
              quality ===
              "Bad Quality"
                ? "Bad Quality"
                : "Good Quality"
            );


      const databaseRecord = {

        id,

        lpo_number:
          finalLpo,

        product_name:
          product ||
          "Unknown Product",

        supplier_farm:
          supplier || "",

        receiving_type:
          receiving || "",

        received_date:
          received || null,

        expiry_date:
          expiry || null,

        quality_result:
          finalQuality,

        quality_score:
          clampScore(
            score
          ),

        quality_analysis:
          analysis || "",

        quality_indicators:
          indicators || {},

        reason_rejection:
          finalDecision ===
          "REJECTED"
            ? reason || ""
            : "",

        image_url:
          publicUrl || ""

      };


      const {
        data,
        error
      } =
        await supabase
          .from(
            "inspections"
          )
          .insert(
            databaseRecord
          )
          .select()
          .single();


      if (error) {

        if (
          uploadedPath
        ) {

          await supabase
            .storage
            .from(
              STORAGE_BUCKET
            )
            .remove([
              uploadedPath
            ]);

        }


        throw new Error(
          error.message
        );

      }


      res.json({

        success:
          true,

        record:
          mapInspectionRow(
            data
          )

      });

    }

    catch (error) {

      console.error(
        "Save inspection error:",
        error
      );


      res
        .status(500)
        .json({

          error:
            error.message ||
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
  async (_req, res) => {

    try {

      const {
        data,
        error
      } =
        await supabase
          .from(
            "inspections"
          )
          .select("*")
          .order(
            "created_at",
            {
              ascending:
                false
            }
          );


      if (error) {

        throw new Error(
          error.message
        );

      }


      res.json(
        (data || [])
          .map(
            mapInspectionRow
          )
      );

    }

    catch (error) {

      console.error(
        "Load history error:",
        error
      );


      res
        .status(500)
        .json({

          error:
            "Unable to load inspection history."

        });

    }

  }
);


/* =========================================================
   GET ONE INSPECTION
========================================================= */

app.get(
  "/api/inspections/:id",
  async (req, res) => {

    try {

      const {
        data,
        error
      } =
        await supabase
          .from(
            "inspections"
          )
          .select("*")
          .eq(
            "id",
            req.params.id
          )
          .maybeSingle();


      if (error) {

        throw new Error(
          error.message
        );

      }


      if (!data) {

        return res
          .status(404)
          .json({

            error:
              "Inspection not found."

          });

      }


      res.json(
        mapInspectionRow(
          data
        )
      );

    }

    catch (error) {

      console.error(
        "Load inspection error:",
        error
      );


      res
        .status(500)
        .json({

          error:
            "Unable to load inspection."

        });

    }

  }
);


/* =========================================================
   DELETE API DISABLED
========================================================= */

app.delete(
  "/api/inspections",
  async (_req, res) => {

    res
      .status(403)
      .json({

        error:
          "Deleting Supabase inspection history is disabled."

      });

  }
);


/* =========================================================
   SCORE HELPER
========================================================= */

function clampScore(
  value
) {

  const number =
    Number(
      value
    );


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
      Math.round(
        number
      )
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

    console.log(
      "Supabase database connected."
    );

  }
);