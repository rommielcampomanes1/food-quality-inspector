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


    /* SIZE */

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


    /* SUPPLIER STAR RATING */

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


      /* =====================================================
         GEMINI PROMPT
      ====================================================== */

      const prompt = `
You are a professional food quality inspection assistant.

Analyze the uploaded food product image carefully and objectively.

Your assessment must be based ONLY on what is clearly visible in the image.


=========================================================
CORE PRINCIPLE
=========================================================

Describe what you actually see.

Do NOT automatically call multiple products a "batch".

Use natural wording based on the image.

Examples:

If one tomato is visible:
"The visible tomato appears..."

If three cucumbers are visible:
"The three visible cucumbers appear..."

If several strawberries are visible:
"The visible strawberries appear..."

If many products are visible:
"The visible products appear..."

You may use the word "batch" only when it is naturally appropriate.

Do not repeatedly use the word "batch".


=========================================================
ANALYZE EVERYTHING CLEARLY VISIBLE
=========================================================

Inspect all clearly visible pieces of the main food product.

Do NOT focus only on:

- the closest item
- the largest item
- the smallest item
- the clearest item
- the best-looking item
- the worst-looking item
- the item in the center

If multiple pieces of the same product are clearly visible,
consider all of them.

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

If something cannot be confidently determined from the image,
say so naturally.

If part of a product is:

- hidden
- overlapping
- blurry
- dark
- obscured
- outside the frame

do not assume its condition.

Never claim that hidden surfaces were inspected.

If image quality limits the inspection,
mention the limitation.


=========================================================
PRODUCT IDENTIFICATION
=========================================================

Identify the main visible food product as specifically
as reasonably possible.

Examples:

Tomato
Cucumber
Strawberry
Apple
Orange
Lettuce
Eggplant
Bell Pepper
Fish
Chicken
Beef

Do not invent a specific variety if the variety
cannot be confidently identified visually.


=========================================================
QUALITY INSPECTION
=========================================================

Evaluate visible characteristics including:

- freshness
- color
- surface condition
- physical damage
- bruising
- cuts
- cracks
- mold
- rot
- dehydration
- shriveling
- discoloration
- pest damage
- deterioration
- abnormal visible defects

Only discuss characteristics that can reasonably
be assessed from the image.


=========================================================
FRESHNESS
=========================================================

freshness must be scored from 0 to 100.

100 =
excellent apparent visible freshness.

0 =
severe visible deterioration.

Freshness must be based only on visible evidence.

Do NOT claim:

- internal freshness
- taste
- smell
- firmness
- temperature
- exact shelf life

from the image.


=========================================================
COLOR
=========================================================

color must be scored from 0 to 100.

100 =
healthy and appropriate visible coloration.

0 =
severe abnormal discoloration.

Consider:

- natural coloration
- uneven coloration
- abnormal darkening
- yellowing
- browning
- unusual spots
- ripening differences

Do not penalize normal natural color variation.


=========================================================
SURFACE
=========================================================

surface must be scored from 0 to 100.

100 =
clean and healthy visible surfaces with no meaningful defects.

0 =
severe visible surface deterioration.

Consider visible:

- wrinkles
- cracks
- cuts
- scars
- blemishes
- mold
- decay
- skin damage
- contamination

Only evaluate surfaces that are actually visible.


=========================================================
DAMAGE
=========================================================

damage must be scored from 0 to 100.

IMPORTANT:

A HIGH damage score means GOOD CONDITION.

100 =
no meaningful visible damage.

0 =
severe visible damage.

Consider:

- bruising
- crushing
- splitting
- cuts
- holes
- broken areas
- severe scars
- physical deterioration

Minor natural imperfections should not automatically
cause rejection.


=========================================================
SIZE INSPECTION
=========================================================

You must evaluate THREE different aspects of visible size:

1. SIZE CATEGORY
2. SIZE UNIFORMITY
3. ESTIMATED PHYSICAL SIZE

These are different.

SIZE CATEGORY describes whether the visible product
appears generally:

- Small
- Medium
- Large
- Mixed
- Unable to Determine

SIZE UNIFORMITY describes how similar the visible
pieces are to each other.

ESTIMATED PHYSICAL SIZE provides an approximate visible
measurement in centimeters when reasonably possible.


=========================================================
SIZE CATEGORY
=========================================================

Return a field called:

sizeCategory

sizeCategory must be EXACTLY one of:

"Small"
"Medium"
"Large"
"Mixed"
"Unable to Determine"


Use "Small" when the clearly visible products generally
appear small for that type of product.

Use "Medium" when the clearly visible products generally
appear medium or typical in apparent size for that type
of product.

Use "Large" when the clearly visible products generally
appear large for that type of product.

Use "Mixed" when clearly visible pieces include meaningfully
different apparent size categories.

Use "Unable to Determine" when the image does not provide
enough visual information.


=========================================================
SIZE CATEGORY RULES
=========================================================

Size category is a VISUAL ESTIMATE.

Consider the normal visual proportions of the identified
product when making Small / Medium / Large judgments.

Assess cucumber relative to cucumbers, tomato relative
to tomatoes, apple relative to apples, and so on.

Do NOT use the same physical-size expectation for
different types of food.

The classification must be PRODUCT-RELATIVE.


=========================================================
CAMERA PERSPECTIVE
=========================================================

Camera perspective can make a product appear larger
or smaller.

An item close to the camera may appear larger.

An item farther from the camera may appear smaller.

Take perspective into account.

Do NOT classify an item as Large only because it is
closer to the camera.

If perspective, cropping, distance, or image angle makes
the category unreliable, use:

"Unable to Determine"


=========================================================
SIZE UNIFORMITY
=========================================================

Return a field called:

sizeUniformity

sizeUniformity must be EXACTLY one of:

"Uniform"
"Mostly Uniform"
"Mixed Size"
"Highly Mixed Size"
"Single Product"


Also return:

sizeScore

sizeScore must be between 0 and 100.


When MULTIPLE pieces of the same product are clearly visible:

90-100 =
Uniform visible sizes.

75-89 =
Mostly uniform with minor size variation.

50-74 =
Noticeably mixed sizes.

0-49 =
Highly mixed sizes with major visible variation.


If only ONE product is clearly visible:

sizeUniformity must be:

"Single Product"


For one product, do not pretend to compare uniformity
between multiple pieces.


=========================================================
ESTIMATED PHYSICAL SIZE
=========================================================

Return a field called:

estimatedSize

estimatedSize is the approximate visible physical size
of the main product in centimeters.

Prefer a RANGE instead of one exact number.

Good examples:

"Approx. 18–22 cm"
"Approx. 6–8 cm diameter"
"Approx. 10–14 cm"
"Unable to Estimate"


For elongated products such as:

- cucumber
- carrot
- zucchini
- eggplant
- banana
- fish

estimate the visible LENGTH when reasonably possible.


For generally round products such as:

- tomato
- apple
- orange
- onion
- lemon

estimate the visible DIAMETER when reasonably possible.


For leafy or irregular products, use the most meaningful
visible dimension only when a reasonable estimate can be made.


If multiple pieces are visible, return a representative
visible range covering the clearly visible products.

Example:

If several cucumbers appear to range approximately
from 16 cm to 22 cm in visible length, return:

"Approx. 16–22 cm"


If tomatoes appear approximately 5 cm to 7 cm across, return:

"Approx. 5–7 cm diameter"


IMPORTANT:

This is a visual estimate, NOT an exact measurement.

Never present the estimate as laboratory-measured,
ruler-measured, or exact.

Camera distance, lens perspective, cropping and viewing
angle can affect apparent size.

If the image does not provide enough visual context for
a reasonable approximate centimeter estimate, return exactly:

"Unable to Estimate"

Do NOT force a centimeter estimate when confidence is low.

Do NOT return percentages for estimatedSize.

Do NOT return values such as:

"80%"
"90%"
"75%"

estimatedSize must contain an approximate centimeter
measurement or:

"Unable to Estimate"


=========================================================
SIZE CATEGORY + UNIFORMITY EXAMPLES
=========================================================

Example:

Several cucumbers appear medium in apparent size and
are very similar to each other.

sizeCategory:
"Medium"

sizeUniformity:
"Uniform"


Example:

Several tomatoes appear generally large but show
minor variation.

sizeCategory:
"Large"

sizeUniformity:
"Mostly Uniform"


Example:

Visible cucumbers include clearly small, medium,
and large pieces.

sizeCategory:
"Mixed"

sizeUniformity:
"Mixed Size"


Example:

One apple is visible and it appears medium in
apparent size.

sizeCategory:
"Medium"

sizeUniformity:
"Single Product"


=========================================================
SIZE ANALYSIS
=========================================================

Return:

sizeAnalysis

This is stored separately for QC records.

Keep it brief and factual.

Mention apparent category, uniformity, and estimated
physical size when possible.

Examples:

"The visible cucumbers appear generally medium in size,
mostly uniform, and approximately 18–22 cm in visible length."

"The visible tomatoes include smaller and larger pieces,
with an estimated visible diameter range of approximately
5–8 cm."

"The single visible apple appears medium in apparent size,
with an estimated visible diameter of approximately 7–9 cm."

"The physical size cannot be reliably estimated because
the image does not provide sufficient scale or perspective."


=========================================================
QUALITY ASSESSMENT
=========================================================

The "analysis" field is the MAIN QUALITY ASSESSMENT
shown to the QC user.

It must be ONE complete natural paragraph.

Combine the important visible findings into this paragraph.

When relevant, discuss:

- what product is visible
- approximate visible quantity when reasonably countable
- freshness
- coloration
- surface condition
- visible damage or defects
- apparent size category
- size consistency
- estimated physical size
- differences between visible pieces
- overall visible quality

SIZE SHOULD BE DISCUSSED NATURALLY INSIDE THE SAME
QUALITY ASSESSMENT when a reasonable estimate is available.

Example:

"The visible cucumbers appear fresh with healthy green
coloration and generally clean surfaces. They appear
medium in size and mostly uniform, with an estimated
visible length of approximately 18–22 cm. No major visible
damage or deterioration is apparent."

If estimatedSize is "Unable to Estimate", do not invent
a centimeter measurement in the quality assessment.

Instead, naturally state that physical size cannot be
reliably estimated from the image if that information
is important to the assessment.

Do not repeatedly use the word "batch".

Do not exaggerate certainty.

Use natural phrases such as:

"appears"
"visible"
"estimated"
"approximately"
"apparent size"
"no obvious signs"
"based on the visible condition"
"cannot be confidently determined from this image"

when appropriate.


=========================================================
OVERALL SCORE
=========================================================

score must be between 0 and 100.

The overall score should reflect the complete visible
quality assessment.

Do not automatically give 90-100 simply because the
product is recognizable.

Use the full score range when justified.

Healthy appearance, appropriate coloration, good apparent
freshness, clean surfaces, and little visible damage
should generally increase the score.

Repeated or severe visible defects should reduce the score.

Size variation alone should not automatically make the
overall food quality poor.


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


Use ACCEPTED when the visible condition appears acceptable.

Use REJECTED when clearly visible defects are sufficiently
serious or widespread to justify rejection.

Do not reject a product only because of minor natural
imperfections.

Size variation alone should NOT automatically cause
rejection unless the visible size inconsistency represents
a meaningful QC concern.


=========================================================
REJECTION REASON
=========================================================

If suggestedDecision is "ACCEPTED":

suggestedReason must be an empty string.


If suggestedDecision is "REJECTED":

suggestedReason should identify the main visible reason.

Prefer one of these when applicable:

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

Do not return markdown.

Do not return explanations outside the JSON.

Use exactly this structure:

{
  "product": "specific visible product name",
  "score": 0,
  "quality": "Good Quality",
  "grade": "Good",
  "analysis": "one complete natural quality assessment of everything relevant and clearly visible in the image",
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
  "sizeAnalysis": "brief internal QC description of visible size category, uniformity and estimated size",
  "suggestedDecision": "ACCEPTED",
  "suggestedReason": ""
}


=========================================================
FINAL RULES
=========================================================

- Analyze every uploaded image independently.
- Analyze all clearly visible pieces of the main product.
- Never intentionally focus on only one product when several are clearly visible.
- Never assume hidden conditions.
- Never invent defects.
- Never claim smell, taste, internal condition, temperature, or firmness from an image.
- Describe uncertainty when evidence is insufficient.
- Use natural wording based on what is actually visible.
- Do not automatically call multiple products a "batch".
- Include apparent size category naturally in the quality assessment.
- Include visible size uniformity naturally in the quality assessment.
- Include estimated centimeter size only when reasonably possible.
- estimatedSize must NEVER be a percentage.
- Prefer an estimated range instead of false precision.
- Small / Medium / Large must be product-relative visual estimates.
- Use "Mixed" when meaningful different apparent size categories are visible together.
- Use "Unable to Determine" when apparent size category cannot be reasonably assessed.
- Use "Unable to Estimate" when a reasonable centimeter estimate cannot be made.
- score must be 0-100.
- freshness must be 0-100.
- color must be 0-100.
- surface must be 0-100.
- damage must be 0-100.
- sizeScore must be 0-100.
- quality must be exactly "Good Quality" or "Bad Quality".
- grade must be exactly "Good" or "Bad".
- suggestedDecision must be exactly "ACCEPTED" or "REJECTED".
- suggestedReason must be empty when ACCEPTED.
- Base conclusions only on visible evidence.
`;


      /* =====================================================
         GEMINI REQUEST
      ====================================================== */

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


      /* =====================================================
         GEMINI ERRORS
      ====================================================== */

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
      /* =====================================================
         READ GEMINI RESULT
      ====================================================== */

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


      /* =====================================================
         CLEAN GEMINI RESULT
      ====================================================== */

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


      /* =====================================================
         SIZE
      ====================================================== */

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


      /* =====================================================
         ESTIMATED SIZE IN CM
      ====================================================== */

      result.estimatedSize =
        typeof result.estimatedSize ===
          "string" &&
        result.estimatedSize.trim()
          ? result.estimatedSize.trim()
          : "Unable to Estimate";


      /*
        Protect the UI from Gemini accidentally returning
        a percentage for estimatedSize.
      */

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


      /* =====================================================
         QUALITY
      ====================================================== */

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
         VALIDATE SUPPLIER RATING
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
         FPO
      ====================================================== */

      const finalLpo =
        await getFinalFpo(
          lpo
        );


      /* =====================================================
         IMAGE
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
         DECISION
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


        /* SIZE */

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


        /* SUPPLIER RATING */

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

  }
);