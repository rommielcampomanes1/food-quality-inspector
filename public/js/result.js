const $ = (id) => document.getElementById(id);


/* =========================================================
   GET CAPTURED IMAGE
========================================================= */

const image =
  localStorage.getItem("inspectionImage");

if (!image) {
  window.location.href = "/camera";
}

$("productImage").src = image;


/* =========================================================
   DEFAULT DATES
========================================================= */

const today =
  new Date();

const expiryDate =
  new Date(
    Date.now() + 7 * 864e5
  );

const iso = (date) =>
  date.toISOString().slice(0, 10);

$("received").value =
  iso(today);

$("expiry").value =
  iso(expiryDate);


/* =========================================================
   VARIABLES
========================================================= */

let aiResult = null;

let decision =
  "ACCEPTED";

let isSaving =
  false;

let supplierRating =
  0;


/* =========================================================
   SUPPLIER STAR RATING
========================================================= */

const starButtons =
  document.querySelectorAll(
    ".star-btn"
  );


function updateStars(
  rating
) {

  starButtons.forEach(
    (star) => {

      const starValue =
        Number(
          star.dataset.rating
        );

      star.classList.toggle(
        "selected",
        starValue <= rating
      );

    }
  );

}


starButtons.forEach(
  (star) => {

    star.addEventListener(
      "click",
      () => {

        supplierRating =
          Number(
            star.dataset.rating
          );

        updateStars(
          supplierRating
        );

      }
    );

  }
);


/* =========================================================
   ACCEPT / REJECT
========================================================= */

function setDecision(
  value
) {

  decision =
    value;


  document
    .querySelectorAll(
      "[data-decision]"
    )
    .forEach(
      (button) => {

        button.classList.toggle(
          "active",
          button.dataset.decision === value
        );

      }
    );


  $("rejectBox")
    .classList.toggle(
      "hidden",
      value !== "REJECTED"
    );

}


document
  .querySelectorAll(
    "[data-decision]"
  )
  .forEach(
    (button) => {

      button.onclick =
        () => {

          setDecision(
            button.dataset.decision
          );

        };

    }
  );


/* =========================================================
   SAFE NUMBER
========================================================= */

function safeNumber(
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
   SAFE ESTIMATED SIZE
========================================================= */

function safeEstimatedSize(
  value
) {

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {

    return "Unable to Estimate";

  }


  const cleaned =
    value.trim();


  /*
    Prevent percentage from showing
    in the Size field.
  */

  if (
    /^\d+(?:\.\d+)?\s*%$/.test(
      cleaned
    )
  ) {

    return "Unable to Estimate";

  }


  return cleaned;

}


/* =========================================================
   AI ANALYSIS
========================================================= */

async function analyze() {

  try {

    const response =
      await fetch(
        "/api/analyze",
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({
              image
            })

        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Analysis failed."
      );

    }


    aiResult =
      data;


    /* =====================================================
       MAIN SCORE
    ====================================================== */

    $("score").textContent =
      `${safeNumber(
        data.score
      )}%`;


    /* =====================================================
       QUALITY
    ====================================================== */

    $("quality").textContent =
      data.quality ||
      "Unknown Quality";


    /* =====================================================
       GRADE
    ====================================================== */

    $("grade").textContent =
      data.grade ||
      "--";


    /* =====================================================
       QUALITY ASSESSMENT TEXT
    ====================================================== */

    $("analysisText").textContent =
      data.analysis ||
      "No quality assessment available.";


    /* =====================================================
       PRODUCT
    ====================================================== */

    $("product").value =
      data.product ||
      "Fresh Product";


    /* =====================================================
       INDICATORS
    ====================================================== */

    const indicators =
      data.indicators ||
      {};


    $("freshness").textContent =
      `${safeNumber(
        indicators.freshness
      )}%`;


    $("color").textContent =
      `${safeNumber(
        indicators.color
      )}%`;


    $("surface").textContent =
      `${safeNumber(
        indicators.surface
      )}%`;


    $("damage").textContent =
      `${safeNumber(
        indicators.damage
      )}%`;


    /* =====================================================
       SIZE — NOW DISPLAY CM / ESTIMATED SIZE
    ====================================================== */

    $("sizeScore").textContent =
      safeEstimatedSize(
        data.estimatedSize
      );


    /* =====================================================
       SIZE CLASSIFICATION
    ====================================================== */

    $("sizeClassification").textContent =
      data.sizeClassification ||
      "Not Determined";


    /*
      sizeScore is still kept internally.

      Example:
      sizeScore = 82

      But the user now sees:
      Approx. 18–22 cm

      instead of:
      82%
    */


    /* =====================================================
       DECISION
    ====================================================== */

    const bad =
      data.suggestedDecision ===
        "REJECTED" ||
      safeNumber(
        data.score
      ) < 60;


    document.body
      .classList.toggle(
        "bad-result",
        bad
      );


    setDecision(
      bad
        ? "REJECTED"
        : "ACCEPTED"
    );


    /* =====================================================
       AUTO SELECT REJECTION REASON
    ====================================================== */

    if (
      bad &&
      data.suggestedReason
    ) {

      const match =
        [
          ...$("reason").options
        ].find(
          (option) =>

            option.text
              .trim()
              .toLowerCase() ===

            String(
              data.suggestedReason
            )
              .trim()
              .toLowerCase()
        );


      if (match) {

        $("reason").value =
          match.value;

      }

    }


    /* =====================================================
       SHOW RESULT
    ====================================================== */

    $("analyzing")
      .classList.add(
        "hidden"
      );


    $("resultContent")
      .classList.remove(
        "hidden"
      );

  }

  catch (error) {

    console.error(
      "Analysis error:",
      error
    );


    $("analyzing")
      .classList.add(
        "hidden"
      );


    $("errorText").textContent =
      error.message ||
      "Analysis failed.";


    $("errorBox")
      .classList.remove(
        "hidden"
      );

  }

}


/* =========================================================
   COMPRESS IMAGE
========================================================= */

function compressImage(
  dataUrl,
  maxWidth = 1200,
  quality = 0.75
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      const img =
        new Image();


      img.onload =
        () => {

          const scale =
            Math.min(
              1,
              maxWidth /
              img.width
            );


          const width =
            Math.round(
              img.width *
              scale
            );


          const height =
            Math.round(
              img.height *
              scale
            );


          const canvas =
            document.createElement(
              "canvas"
            );


          canvas.width =
            width;

          canvas.height =
            height;


          const context =
            canvas.getContext(
              "2d"
            );


          context.drawImage(
            img,
            0,
            0,
            width,
            height
          );


          const compressed =
            canvas.toDataURL(
              "image/jpeg",
              quality
            );


          resolve(
            compressed
          );

        };


      img.onerror =
        () => {

          reject(
            new Error(
              "Unable to process inspection image."
            )
          );

        };


      img.src =
        dataUrl;

    }
  );

}


/* =========================================================
   SAVE INSPECTION
========================================================= */

$("saveBtn").onclick =
  async () => {

    if (
      isSaving ||
      !aiResult
    ) {

      return;

    }


    /* =====================================================
       VALUES
    ====================================================== */

    const lpo =
      $("lpo")
        .value
        .trim();


    const product =
      $("product")
        .value
        .trim();


    const supplier =
      $("supplier").value;


    const receiving =
      $("receiving").value;


    const received =
      $("received").value;


    const expiry =
      $("expiry").value;


    const reason =
      decision ===
        "REJECTED"
        ? $("reason").value
        : "";


    /* =====================================================
       VALIDATION
    ====================================================== */

    if (!supplier) {

      alert(
        "Please select the farm or supplier."
      );

      return;

    }


    if (!receiving) {

      alert(
        "Please select the receiving type."
      );

      return;

    }


    if (
      !received ||
      !expiry
    ) {

      alert(
        "Please select the received and expiry dates."
      );

      return;

    }


    if (
      supplierRating < 1 ||
      supplierRating > 5
    ) {

      alert(
        "Please select a supplier product rating."
      );

      return;

    }


    if (
      decision ===
        "REJECTED" &&
      !reason
    ) {

      alert(
        "Please select a rejection reason."
      );

      return;

    }


    /* =====================================================
       SAVING STATE
    ====================================================== */

    isSaving =
      true;


    const saveBtn =
      $("saveBtn");


    saveBtn.disabled =
      true;


    saveBtn.textContent =
      "SAVING...";


    try {

      /* ===================================================
         COMPRESS IMAGE
      ==================================================== */

      const compressedImage =
        await compressImage(
          image,
          1200,
          0.75
        );


      /* ===================================================
         CREATE INSPECTION
      ==================================================== */

      const inspection = {

        image:
          compressedImage,


        lpo,


        product:
          product ||
          aiResult.product,


        supplier,


        receiving,


        received,


        expiry,


        /* QUALITY */

        score:
          safeNumber(
            aiResult.score
          ),


        quality:
          aiResult.quality,


        grade:
          aiResult.grade,


        analysis:
          aiResult.analysis,


        indicators:
          aiResult.indicators,


        /* SIZE SCORE — INTERNAL */

        sizeScore:
          safeNumber(
            aiResult.sizeScore
          ),


        /* SIZE CLASSIFICATION */

        sizeClassification:
          aiResult.sizeClassification ||
          "Not Determined",


        /* SIZE ANALYSIS */

        sizeAnalysis:
          aiResult.sizeAnalysis ||
          "",


        /* ESTIMATED CM SIZE */

        estimatedSize:
          safeEstimatedSize(
            aiResult.estimatedSize
          ),


        /* SUPPLIER RATING */

        supplierRating,


        /* DECISION */

        decision,


        reason

      };


      /* ===================================================
         SEND TO SERVER
      ==================================================== */

      const response =
        await fetch(
          "/api/inspections",
          {

            method:
              "POST",

            headers: {

              "Content-Type":
                "application/json"

            },

            body:
              JSON.stringify(
                inspection
              )

          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        throw new Error(
          data.error ||
          "Unable to save inspection."
        );

      }


      /* ===================================================
         SAVE ID
      ==================================================== */

      localStorage.setItem(
        "selectedInspectionId",
        String(
          data.record.id
        )
      );


      /* ===================================================
         REMOVE TEMP IMAGE
      ==================================================== */

      localStorage.removeItem(
        "inspectionImage"
      );


      /* ===================================================
         HISTORY
      ==================================================== */

      window.location.href =
        "/history";

    }

    catch (error) {

      console.error(
        "Save inspection error:",
        error
      );


      alert(
        error.message ||
        "The inspection could not be saved."
      );


      isSaving =
        false;


      saveBtn.disabled =
        false;


      saveBtn.textContent =
        "▣ SAVE INSPECTION";

    }

  };


/* =========================================================
   START
========================================================= */

updateStars(0);

analyze();