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


/* =========================================================
   ACCEPT / REJECT
========================================================= */

function setDecision(value) {

  decision = value;

  document
    .querySelectorAll(
      "[data-decision]"
    )
    .forEach((button) => {

      button.classList.toggle(
        "active",
        button.dataset.decision === value
      );

    });

  $("rejectBox").classList.toggle(
    "hidden",
    value !== "REJECTED"
  );
}


document
  .querySelectorAll(
    "[data-decision]"
  )
  .forEach((button) => {

    button.onclick = () => {

      setDecision(
        button.dataset.decision
      );

    };

  });


/* =========================================================
   AI ANALYSIS
========================================================= */

async function analyze() {

  try {

    const response =
      await fetch(
        "/api/analyze",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
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


    aiResult = data;


    /* SCORE */

    $("score").textContent =
      `${data.score}%`;


    /* QUALITY */

    $("quality").textContent =
      data.quality;


    /* GRADE */

    $("grade").textContent =
      data.grade;


    /* AI ANALYSIS */

    $("analysisText").textContent =
      data.analysis;


    /* PRODUCT */

    $("product").value =
      data.product ||
      "Fresh Product";


    /* INDICATORS */

    $("freshness").textContent =
      `${data.indicators.freshness}%`;

    $("color").textContent =
      `${data.indicators.color}%`;

    $("surface").textContent =
      `${data.indicators.surface}%`;

    $("damage").textContent =
      `${data.indicators.damage}%`;


    /* DECISION */

    const bad =
      data.suggestedDecision ===
        "REJECTED" ||
      data.score < 60;


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


    /* AUTO SELECT REJECTION REASON */

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
              .toLowerCase() ===
            data.suggestedReason
              .toLowerCase()
        );


      if (match) {

        $("reason").value =
          match.value;

      }

    }


    /* SHOW RESULT */

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
      error.message;


    $("errorBox")
      .classList.remove(
        "hidden"
      );

  }

}


/* =========================================================
   COMPRESS IMAGE BEFORE SERVER SAVE
========================================================= */

function compressImage(
  dataUrl,
  maxWidth = 1200,
  quality = 0.75
) {

  return new Promise(
    (resolve, reject) => {

      const img =
        new Image();


      img.onload = () => {

        const scale =
          Math.min(
            1,
            maxWidth / img.width
          );


        const width =
          Math.round(
            img.width * scale
          );


        const height =
          Math.round(
            img.height * scale
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


      img.onerror = () => {

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
   SAVE INSPECTION TO SERVER
========================================================= */

$("saveBtn").onclick =
  async () => {

    if (
      isSaving ||
      !aiResult
    ) {
      return;
    }


    /* FIELD VALUES */

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
      decision === "REJECTED"
        ? $("reason").value
        : "";


    /* VALIDATION */

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
      decision ===
        "REJECTED" &&
      !reason
    ) {

      alert(
        "Please select a rejection reason."
      );

      return;

    }


    /* PREVENT MULTIPLE SAVES */

    isSaving =
      true;


    const saveBtn =
      $("saveBtn");


    saveBtn.disabled =
      true;


    saveBtn.textContent =
      "SAVING...";


    try {

      /* COMPRESS IMAGE */

      const compressedImage =
        await compressImage(
          image,
          1200,
          0.75
        );


      /* CREATE RECORD */

      const inspection = {

        image:
          compressedImage,

        /*
          IMPORTANT:

          We send the LPO field exactly as entered.

          If blank:
          server.js creates:
          FPO20270001
          FPO20270002
          FPO20270003
          etc.

          If user enters 8888:
          server.js creates:
          FPO20278888
        */

        lpo:
          lpo,

        product:
          product ||
          aiResult.product,

        supplier,

        receiving,

        received,

        expiry,

        score:
          aiResult.score,

        quality:
          aiResult.quality,

        grade:
          aiResult.grade,

        analysis:
          aiResult.analysis,

        indicators:
          aiResult.indicators,

        decision,

        reason

      };


      /* SEND TO SERVER */

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


      /* SAVE ONLY ID LOCALLY */

      localStorage.setItem(
        "selectedInspectionId",
        String(
          data.record.id
        )
      );


      /* DELETE LARGE TEMP IMAGE */

      localStorage.removeItem(
        "inspectionImage"
      );


      /* GO TO HISTORY */

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
        "SAVE INSPECTION";

    }

  };


/* =========================================================
   START ANALYSIS
========================================================= */

analyze();