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


const supabase =
  createClient(
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
    path.join(
      ROOT,
      "public"
    )
  )
);


/* =========================================================
   HTML PAGES
========================================================= */

const pages = {

  "/":
    "home.html",

  "/camera":
    "camera.html",

  "/result":
    "result.html",

  "/history":
    "history.html",

  "/details":
    "details.html"

};


for (
  const [route, file]
  of Object.entries(pages)
) {

  app.get(
    route,
    (_req, res) => {

      res.sendFile(
        path.join(
          ROOT,
          "views",
          file
        )
      );

    }
  );

}


/* =========================================================
   IMAGE HELPERS
========================================================= */

function parseBase64Image(
  dataUrl
) {

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


  if (
    mimeType.includes(
      "png"
    )
  ) {

    extension =
      "png";

  }

  else if (
    mimeType.includes(
      "webp"
    )
  ) {

    extension =
      "webp";

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


/* =========================================================
   UPLOAD IMAGE TO SUPABASE STORAGE
========================================================= */

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
      .from(
        STORAGE_BUCKET
      )
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


  const {
    data
  } =
    supabase
      .storage
      .from(
        STORAGE_BUCKET
      )
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
   DATABASE ROW → FRONTEND FORMAT
========================================================= */

function mapInspectionRow(
  row
) {

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


    quantity:
      row.quantity === null ||
      row.quantity === undefined
        ? null
        : Number(row.quantity),


    uom:
      row.uom || "",


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


    sizeScore:
      Number(
        row.size_score
      ) || 0,


    sizeClassification:
      row.size_classification ||
      "Not Determined",


    sizeAnalysis:
      row.size_analysis ||
      "",


    estimatedSize:
      row.estimated_size ||
      "Unable to Estimate",


    supplierRating:
      Number(
        row.supplier_rating
      ) || 0,


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

      return (
        `FPO2027${cleaned}`
      );

    }

  }


  const {
    data,
    error
  } =
    await supabase
      .from(
        "inspections"
      )
      .select(
        "lpo_number"
      )
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


  for (
    const record
    of data || []
  ) {

    const match =
      String(
        record.lpo_number || ""
      )
        .match(
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
      .padStart(
        4,
        "0"
      )}`
  );

}


/* =========================================================
   QC MEMORY CACHE
========================================================= */

let qcMemoryCache =
  "";

let qcMemoryCacheTime =
  0;

const QC_MEMORY_CACHE_MS =
  30 * 60 * 1000;


/* =========================================================
   QC MEMORY
========================================================= */

async function buildQcMemory() {

  try {

    const now =
      Date.now();


    if (
      qcMemoryCache &&
      now - qcMemoryCacheTime <
        QC_MEMORY_CACHE_MS
    ) {

      return qcMemoryCache;

    }


    const {
      data,
      error
    } =
      await supabase
        .from(
          "inspections"
        )
        .select(`
          product_name,
          quality_result,
          quality_score,
          size_classification,
          estimated_size,
          supplier_rating,
          reason_rejection,
          created_at
        `)
        .order(
          "created_at",
          {
            ascending:
              false
          }
        )
        .limit(
          150
        );


    if (error) {

      console.error(
        "QC Memory load error:",
        error.message
      );

      return "";

    }


    if (
      !Array.isArray(data) ||
      data.length === 0
    ) {

      return "";

    }


    const products =
      new Map();


    for (
      const row
      of data
    ) {

      const normalizedProduct =
        String(
          row.product_name || ""
        )
          .trim()
          .toLowerCase();


      if (!normalizedProduct) {

        continue;

      }


      if (
        !products.has(
          normalizedProduct
        )
      ) {

        products.set(
          normalizedProduct,
          {

            name:
              row.product_name,

            count:
              0,

            accepted:
              0,

            rejected:
              0,

            scoreTotal:
              0,

            scoreCount:
              0,

            ratingTotal:
              0,

            ratingCount:
              0,

            classifications:
              {},

            rejectionReasons:
              {},

            estimatedSizes:
              []

          }
        );

      }


      const item =
        products.get(
          normalizedProduct
        );


      item.count++;


      if (
        row.quality_result ===
        "Bad Quality"
      ) {

        item.rejected++;

      }

      else {

        item.accepted++;

      }


      const score =
        Number(
          row.quality_score
        );


      if (
        Number.isFinite(
          score
        )
      ) {

        item.scoreTotal +=
          score;

        item.scoreCount++;

      }


      const rating =
        Number(
          row.supplier_rating
        );


      if (
        Number.isFinite(
          rating
        ) &&
        rating >= 1 &&
        rating <= 5
      ) {

        item.ratingTotal +=
          rating;

        item.ratingCount++;

      }


      const classification =
        String(
          row.size_classification ||
          ""
        ).trim();


      if (classification) {

        item.classifications[
          classification
        ] =
          (
            item.classifications[
              classification
            ] || 0
          ) + 1;

      }


      const estimatedSize =
        String(
          row.estimated_size ||
          ""
        ).trim();


      if (
        estimatedSize &&
        estimatedSize !==
          "Unable to Estimate"
      ) {

        if (
          !item.estimatedSizes
            .includes(
              estimatedSize
            )
        ) {

          item.estimatedSizes
            .push(
              estimatedSize
            );

        }

      }


      const reason =
        String(
          row.reason_rejection ||
          ""
        ).trim();


      if (reason) {

        item.rejectionReasons[
          reason
        ] =
          (
            item.rejectionReasons[
              reason
            ] || 0
          ) + 1;

      }

    }


    const profiles =
      [];


    for (
      const item
      of products.values()
    ) {

      if (
        item.count < 3
      ) {

        continue;

      }


      const acceptanceRate =
        Math.round(
          (
            item.accepted /
            item.count
          ) * 100
        );


      const averageScore =
        item.scoreCount > 0

          ? Math.round(
              item.scoreTotal /
              item.scoreCount
            )

          : null;


      const averageRating =
        item.ratingCount > 0

          ? (
              item.ratingTotal /
              item.ratingCount
            ).toFixed(
              1
            )

          : null;


      const commonClassification =
        Object.entries(
          item.classifications
        )
          .sort(
            (a, b) =>
              b[1] - a[1]
          )[0]?.[0] ||
        "";


      const commonReason =
        Object.entries(
          item.rejectionReasons
        )
          .sort(
            (a, b) =>
              b[1] - a[1]
          )[0]?.[0] ||
        "";


      profiles.push({

        name:
          item.name,

        count:
          item.count,

        acceptanceRate,

        averageScore,

        averageRating,

        commonClassification,

        commonReason,

        estimatedSizes:
          item.estimatedSizes
            .slice(
              0,
              3
            )

      });

    }


    profiles.sort(
      (a, b) =>
        b.count - a.count
    );


    const memoryLines =
      profiles
        .slice(
          0,
          10
        )
        .map(
          (profile) => {

            let line =
              `Product: ${profile.name}` +
              ` | Previous inspections: ${profile.count}` +
              ` | Acceptance rate: ${profile.acceptanceRate}%`;


            if (
              profile.averageScore !==
              null
            ) {

              line +=
                ` | Average previous quality score: ${profile.averageScore}%`;

            }


            if (
              profile.averageRating !==
              null
            ) {

              line +=
                ` | Average human supplier rating: ${profile.averageRating}/5`;

            }


            if (
              profile.commonClassification
            ) {

              line +=
                ` | Common size classification: ${profile.commonClassification}`;

            }


            if (
              profile.commonReason
            ) {

              line +=
                ` | Common rejection reason: ${profile.commonReason}`;

            }


            if (
              profile.estimatedSizes.length > 0
            ) {

              line +=
                ` | Previous estimated sizes: ` +
                profile.estimatedSizes.join(", ");

            }


            return line;

          }
        );


    qcMemoryCache =
      memoryLines.join(
        "\n"
      );


    qcMemoryCacheTime =
      now;


    return qcMemoryCache;

  }

  catch (error) {

    console.error(
      "QC Memory error:",
      error
    );


    return "";

  }

}


/* =========================================================
   GEMINI RETRY / FALLBACK HELPERS
========================================================= */

function sleep(
  milliseconds
) {

  return new Promise(
    (resolve) => {

      setTimeout(
        resolve,
        milliseconds
      );

    }
  );

}


function isTemporaryGeminiError(
  status
) {

  return [
    429,
    500,
    502,
    503,
    504
  ].includes(
    Number(status)
  );

}


/* =========================================================
   CALL ONE GEMINI MODEL
========================================================= */

async function callGeminiModel(
  {
    model,
    apiKey,
    prompt,
    mimeType,
    imageData,
    timeoutMs = 15000
  }
) {

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent`;


  console.log(
    `Trying Gemini model: ${model}`
  );


  const controller =
    new AbortController();


  const timeoutId =
    setTimeout(
      () => {

        controller.abort();

      },
      timeoutMs
    );


  try {

    const response =
      await fetch(
        url,
        {

          method:
            "POST",

          signal:
            controller.signal,

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

                        data:
                          imageData

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


    let payload =
      {};


    try {

      payload =
        await response.json();

    }

    catch {

      payload =
        {};

    }


    if (!response.ok) {

      const googleMessage =
        payload
          ?.error
          ?.message ||
        payload
          ?.error
          ?.status ||
        `Gemini request failed with HTTP ${response.status}.`;


      const requestError =
        new Error(
          googleMessage
        );


      requestError.status =
        response.status;


      requestError.model =
        model;


      throw requestError;

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

      const emptyError =
        new Error(
          "Gemini returned an empty result."
        );


      emptyError.status =
        502;


      emptyError.model =
        model;


      throw emptyError;

    }


    console.log(
      `Gemini analysis successful using ${model}`
    );


    return {

      text,

      model

    };

  }

  catch (error) {

    if (
      error.name ===
      "AbortError"
    ) {

      const timeoutError =
        new Error(
          `${model} took too long to respond.`
        );


      timeoutError.status =
        504;


      timeoutError.model =
        model;


      throw timeoutError;

    }


    throw error;

  }

  finally {

    clearTimeout(
      timeoutId
    );

  }

}


/* =========================================================
   GEMINI AUTOMATIC RETRY + FALLBACK
========================================================= */

async function analyzeWithGeminiFallback(
  {
    apiKey,
    preferredModel,
    prompt,
    mimeType,
    imageData
  }
) {

  const models =
    [
      preferredModel,
    ]
      .filter(
        Boolean
      )
      .filter(
        (
          model,
          index,
          array
        ) =>
          array.indexOf(
            model
          ) === index
      );


  let lastError =
    null;


  for (
    let index = 0;
    index < models.length;
    index++
  ) {

    const model =
      models[index];


    try {

      const timeoutMs = 60000;

      console.log(
        `Gemini model attempt: ${model}`
      );


      return await callGeminiModel(
        {

          model,

          apiKey,

          prompt,

          mimeType,

          imageData,

          timeoutMs

        }
      );

    }

    catch (error) {

      lastError =
        error;


      console.error(
        `Gemini failed | model=${model} | status=${error.status || "unknown"} | ${error.message}`
      );


      if (
        error.status ===
          401 ||
        error.status ===
          403
      ) {

        throw error;

      }


      if (
        index <
        models.length - 1
      ) {

        console.log(
          `Switching immediately to backup model: ${models[index + 1]}`
        );

      }

    }

  }


  throw (
    lastError ||
    new Error(
      "All Gemini models failed."
    )
  );

}


/* =========================================================
   GEMINI IMAGE ANALYSIS
========================================================= */

app.post(
  "/api/analyze",
  async (
    req,
    res
  ) => {

    try {

      const apiKey =
        process.env
          .GEMINI_API_KEY
          ?.trim();


      const preferredModel =
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


      const qcMemory =
        await buildQcMemory();


      const prompt = `
You are a professional food quality inspection assistant.

Analyze the uploaded food product image carefully and objectively.

Your assessment must be based primarily on what is clearly visible in the CURRENT IMAGE.


=========================================================
QC MEMORY — SECONDARY REFERENCE ONLY
=========================================================

You may receive historical QC reference information from
previous inspections.

Historical QC information is NOT proof of the condition
of the current product.

The CURRENT IMAGE is always the primary evidence.

Never change a clearly visible current defect just because
previous inspections were good.

Never assume the current product is bad just because
previous inspections were bad.

Use historical information only to improve consistency
and product-specific context when it is relevant.

Only use a historical profile if it clearly refers to
the SAME TYPE OF PRODUCT visible in the current image.

Ignore historical information for unrelated products.

Do not mention QC Memory, historical inspections,
previous inspections, database records, averages,
acceptance rates, supplier history, or learning data
in the user-facing QUALITY ASSESSMENT.


=========================================================
AVAILABLE INTERNAL QC MEMORY
=========================================================

${
  qcMemory
    ? qcMemory
    : "No sufficient previous QC memory is currently available."
}


=========================================================
CORE PRINCIPLE
=========================================================

Describe what you actually see.

Do NOT automatically call multiple products a "batch".

Use natural wording based on the image.


=========================================================
ANALYZE EVERYTHING CLEARLY VISIBLE
=========================================================

Inspect ALL clearly visible pieces of the main food product.

If multiple pieces of the same product are visible,
evaluate the WHOLE visible group.

Do NOT judge the image using only one piece.

Do NOT focus only on:

- the largest piece
- the nearest piece
- the clearest piece
- the best-looking piece
- the worst-looking piece

Consider the condition of all clearly visible pieces.

If both good and defective products are visible,
the overall assessment must represent the complete
visible group.

Do not ignore visible defective products simply because
many other pieces appear acceptable.

At the same time, do not automatically reject the entire
visible group because of one very small isolated cosmetic
defect.

Consider how widespread and how severe the visible
defects appear to be.

If many pieces show the same defect,
give that defect greater importance.

If only a small minority appears affected,
describe that honestly in the assessment.

If products overlap or are hidden,
evaluate only what is actually visible.

If only one product is visible,
inspect that individual product.


=========================================================
VISUAL HONESTY
=========================================================

Never claim to see something that is not clearly visible.

Do NOT invent:

- mold
- rot
- bruising
- cuts
- cracks
- contamination
- pest damage
- discoloration
- dehydration
- freshness problems
- surface damage
- spoilage
- size problems

unless there is visible evidence supporting the conclusion.

Never claim smell, taste, internal condition,
temperature, firmness, or exact shelf life from an image.


=========================================================
PRODUCT IDENTIFICATION
=========================================================

Identify the main visible food product as specifically
as reasonably possible.


=========================================================
FRESHNESS
=========================================================

freshness must be scored from 0 to 100.

100 =
excellent apparent visible freshness.

0 =
severe visible deterioration.


=========================================================
COLOR
=========================================================

color must be scored from 0 to 100.

100 =
healthy and appropriate visible coloration.

0 =
severe abnormal discoloration.


=========================================================
SURFACE
=========================================================

surface must be scored from 0 to 100.

100 =
clean and healthy visible surfaces with no meaningful defects.

0 =
severe visible surface deterioration.


=========================================================
PHYSICAL CONDITION
=========================================================

The JSON field remains named:

damage

damage must be scored from 0 to 100.

IMPORTANT:

A HIGH damage score means GOOD PHYSICAL CONDITION.

100 =
no meaningful visible physical damage.

0 =
severe visible physical damage.

Consider:

- bruising
- crushing
- splitting
- cuts
- holes
- broken areas
- severe scars
- physical deterioration


=========================================================
SIZE INSPECTION
=========================================================

You must evaluate:

1. SIZE CATEGORY
2. SIZE UNIFORMITY
3. ESTIMATED PHYSICAL SIZE


=========================================================
SIZE CATEGORY
=========================================================

sizeCategory must be EXACTLY one of:

"Small"
"Medium"
"Large"
"Mixed"
"Unable to Determine"


=========================================================
SIZE UNIFORMITY
=========================================================

sizeUniformity must be EXACTLY one of:

"Uniform"
"Mostly Uniform"
"Mixed Size"
"Highly Mixed Size"
"Single Product"

sizeScore must be between 0 and 100.


=========================================================
ESTIMATED PHYSICAL SIZE
=========================================================

Return:

estimatedSize

Prefer a RANGE instead of one exact number.

Examples:

"Approx. 18–22 cm"
"Approx. 6–8 cm diameter"
"Approx. 10–14 cm"
"Unable to Estimate"

This is only a visual estimate.

Never claim the size is exact.

Do NOT return a percentage for estimatedSize.


=========================================================
SIZE ANALYSIS
=========================================================

Return:

sizeAnalysis

Keep it brief and factual.


=========================================================
QUALITY ASSESSMENT
=========================================================

The "analysis" field is the MAIN QUALITY ASSESSMENT
shown to the QC user.

It must be ONE complete natural paragraph.

When relevant, discuss:

- product
- visible quantity
- freshness
- coloration
- surface
- physical condition
- apparent size
- size consistency
- estimated size
- visible defects
- overall quality

When multiple pieces are visible,
the assessment must represent the entire visible group,
not only one individual product.

If quality varies across the visible products,
mention that variation naturally.

Do not mention historical QC data or QC Memory.

The output must sound like a direct assessment of
the CURRENT IMAGE.


=========================================================
OVERALL SCORE
=========================================================

score must be between 0 and 100.

Use the full score range when justified.

When multiple pieces are visible,
the score must represent their overall visible condition.

A small number of minor defects should reduce the score
proportionally.

Repeated or severe defects across multiple visible pieces
should reduce the score more significantly.


=========================================================
QUALITY DECISION
=========================================================

quality must be exactly:

"Good Quality"

or

"Bad Quality"

grade must be exactly:

"Good"

or

"Bad"

suggestedDecision must be exactly:

"ACCEPTED"

or

"REJECTED"


=========================================================
REJECTION REASON
=========================================================

If ACCEPTED:

suggestedReason must be an empty string.

If REJECTED:

Prefer one of:

"Damaged"
"Rotten"
"Mold"
"Bruised"
"Poor Color"
"Poor Texture"
"Pest Damage"
"Foreign Object"
"Packaging Damage"
"Other"


=========================================================
RETURN FORMAT
=========================================================

Return ONLY valid JSON.

{
  "product": "specific visible product name",
  "score": 0,
  "quality": "Good Quality",
  "grade": "Good",
  "analysis": "one complete natural quality assessment",
  "indicators": {
    "freshness": 0,
    "color": 0,
    "surface": 0,
    "damage": 0
  },
  "sizeScore": 0,
  "sizeCategory": "Medium",
  "sizeUniformity": "Mostly Uniform",
  "estimatedSize": "Approx. 18–22 cm",
  "sizeAnalysis": "brief size assessment",
  "suggestedDecision": "ACCEPTED",
  "suggestedReason": ""
}
`;


      let geminiResponse;


      try {

        geminiResponse =
          await analyzeWithGeminiFallback(
            {

              apiKey,

              preferredModel,

              prompt,

              mimeType,

              imageData:
                data

            }
          );

      }

      catch (error) {

        console.error(
          "All Gemini attempts failed:",
          error
        );


        if (
          error.status ===
            401 ||
          error.status ===
            403
        ) {

          return res
            .status(
              error.status
            )
            .json({

              error:
                "The Gemini API key is invalid, restricted, expired, or not authorized.",

              details:
                error.message

            });

        }


        if (
          error.status ===
          429
        ) {

          return res
            .status(503)
            .json({

              error:
                "The AI inspection service is temporarily busy. Please try again in a moment.",

              details:
                error.message

            });

        }


        if (
          isTemporaryGeminiError(
            error.status
          )
        ) {

          return res
            .status(503)
            .json({

              error:
                "The AI inspection service is temporarily unavailable. Please try again shortly.",

              details:
                error.message

            });

        }


        return res
          .status(500)
          .json({

            error:
              error.message ||
              "AI analysis failed."

          });

      }


      const text =
        geminiResponse.text;


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


      result.sizeScore =
        clampScore(
          result.sizeScore
        );


      const allowedSizeCategories =
        [
          "Small",
          "Medium",
          "Large",
          "Mixed",
          "Unable to Determine"
        ];


      const allowedSizeUniformities =
        [
          "Uniform",
          "Mostly Uniform",
          "Mixed Size",
          "Highly Mixed Size",
          "Single Product"
        ];


      result.sizeCategory =
        allowedSizeCategories.includes(
          result.sizeCategory
        )
          ? result.sizeCategory
          : "Unable to Determine";


      result.sizeUniformity =
        allowedSizeUniformities.includes(
          result.sizeUniformity
        )
          ? result.sizeUniformity
          : "Mixed Size";


      result.sizeClassification =
        `${result.sizeCategory} — ${result.sizeUniformity}`;


      result.estimatedSize =
        typeof result.estimatedSize ===
          "string" &&
        result.estimatedSize.trim()
          ? result.estimatedSize.trim()
          : "Unable to Estimate";


      if (
        /^\s*\d+(?:\.\d+)?\s*%\s*$/.test(
          result.estimatedSize
        )
      ) {

        result.estimatedSize =
          "Unable to Estimate";

      }


      result.sizeAnalysis =
        typeof result.sizeAnalysis ===
          "string" &&
        result.sizeAnalysis.trim()
          ? result.sizeAnalysis.trim()
          : "Size could not be reliably assessed from the visible image.";


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
          : "No detailed quality assessment was returned.";


      if (
        result
          .suggestedDecision ===
        "ACCEPTED"
      ) {

        result.suggestedReason =
          "";

      }


      result.aiModelUsed =
        geminiResponse.model;


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
  async (
    req,
    res
  ) => {

    let uploadedPath =
      "";


    try {

      const {

        image,

        lpo,

        product,

        supplier,

        receiving,

        quantity,

        uom,

        received,

        expiry,

        score,

        quality,

        grade,

        analysis,

        indicators,

        sizeScore,

        sizeClassification,

        sizeAnalysis,

        estimatedSize,

        supplierRating,

        decision,

        reason

      } =
        req.body;


      const id =
        Date.now();


      /* =====================================================
         QUANTITY / UOM VALIDATION
      ====================================================== */

      const quantityNumber =
        Number(
          quantity
        );


      if (
        !Number.isFinite(
          quantityNumber
        ) ||
        quantityNumber <= 0
      ) {

        return res
          .status(400)
          .json({

            error:
              "Quantity must be greater than 0."

          });

      }


      const finalUom =
        String(
          uom || ""
        )
          .trim()
          .toUpperCase();


      const allowedUoms =
        [
          "KG",
          "GRAM",
          "PCS",
          "BOX",
          "CRATE",
          "BAG",
          "BUNCH",
          "TRAY",
          "LITER",
          "ML",
          "PUNNET",
          "PKTS"
        ];


      if (
        !allowedUoms.includes(
          finalUom
        )
      ) {

        return res
          .status(400)
          .json({

            error:
              "Please select a valid UOM."

          });

      }


      /* =====================================================
         SUPPLIER RATING
      ====================================================== */

      const ratingNumber =
        Number(
          supplierRating
        );


      if (
        !Number.isFinite(
          ratingNumber
        ) ||
        ratingNumber < 1 ||
        ratingNumber > 5
      ) {

        return res
          .status(400)
          .json({

            error:
              "Supplier rating must be between 1 and 5."

          });

      }


      const finalSupplierRating =
        Math.round(
          ratingNumber
        );


      /* =====================================================
         FPO NUMBER
      ====================================================== */

      const finalLpo =
        await getFinalFpo(
          lpo
        );


      /* =====================================================
         UPLOAD IMAGE
      ====================================================== */

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


      /* =====================================================
         FINAL DECISION / QUALITY
      ====================================================== */

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


      /* =====================================================
         DATABASE RECORD
      ====================================================== */

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


        quantity:
          quantityNumber,


        uom:
          finalUom,


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


        size_score:
          clampScore(
            sizeScore
          ),


        size_classification:
          sizeClassification ||
          "Not Determined",


        size_analysis:
          sizeAnalysis ||
          "",


        estimated_size:
          estimatedSize ||
          "Unable to Estimate",


        supplier_rating:
          finalSupplierRating,


        reason_rejection:
          finalDecision ===
          "REJECTED"
            ? reason || ""
            : "",


        image_url:
          publicUrl || ""

      };


      /* =====================================================
         INSERT INTO SUPABASE
      ====================================================== */

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


      /* =====================================================
         RESET QC MEMORY CACHE
      ====================================================== */

      qcMemoryCache =
        "";

      qcMemoryCacheTime =
        0;


      /* =====================================================
         RETURN SAVED RECORD
      ====================================================== */

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
  async (
    _req,
    res
  ) => {

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
  async (
    req,
    res
  ) => {

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
   DELETE SUPABASE HISTORY DISABLED
========================================================= */

app.delete(
  "/api/inspections",
  async (
    _req,
    res
  ) => {

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


    console.log(
      "QC Memory enabled."
    );

  }
);