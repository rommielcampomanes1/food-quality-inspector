const id =
  localStorage.getItem(
    "selectedInspectionId"
  );

const box =
  document.getElementById(
    "details"
  );

const removeInspectionBtn =
  document.getElementById(
    "removeInspectionBtn"
  );


/* =========================================================
   SAFE HTML
========================================================= */

function escapeHtml(value) {

  return String(
    value ?? ""
  ).replace(
    /[&<>'"]/g,

    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
      })[character]
  );

}


/* =========================================================
   GET HIDDEN INSPECTION IDS
========================================================= */

function getHiddenInspectionIds() {

  try {

    const hidden =
      JSON.parse(
        localStorage.getItem(
          "hiddenInspectionIds"
        ) || "[]"
      );


    return Array.isArray(hidden)
      ? hidden.map(String)
      : [];

  }

  catch (error) {

    return [];

  }

}


/* =========================================================
   SAVE HIDDEN INSPECTION IDS
========================================================= */

function saveHiddenInspectionIds(
  ids
) {

  const uniqueIds =
    [
      ...new Set(
        ids.map(String)
      )
    ];


  localStorage.setItem(
    "hiddenInspectionIds",
    JSON.stringify(
      uniqueIds
    )
  );

}


/* =========================================================
   REMOVE CURRENT INSPECTION FROM APP VIEW
========================================================= */

function removeCurrentInspection() {

  if (!id) {
    return;
  }


  const confirmed =
    confirm(
      "Remove this inspection from the app history?\n\nThe record will remain safely stored in Supabase."
    );


  if (!confirmed) {
    return;
  }


  const hiddenIds =
    getHiddenInspectionIds();


  if (
    !hiddenIds.includes(
      String(id)
    )
  ) {

    hiddenIds.push(
      String(id)
    );

  }


  saveHiddenInspectionIds(
    hiddenIds
  );


  localStorage.removeItem(
    "selectedInspectionId"
  );


  alert(
    "Inspection removed from this app. The Supabase record is still saved."
  );


  window.location.href =
    "/history";

}


/* =========================================================
   DELETE BUTTON
========================================================= */

if (removeInspectionBtn) {

  removeInspectionBtn.addEventListener(
    "click",
    removeCurrentInspection
  );

}


/* =========================================================
   STAR DISPLAY
========================================================= */

function getStarRating(
  rating
) {

  const value =
    Math.max(
      0,
      Math.min(
        5,
        Number(rating) || 0
      )
    );


  let stars = "";


  for (
    let i = 1;
    i <= 5;
    i++
  ) {

    stars +=
      i <= value
        ? "★"
        : "☆";

  }


  return stars;

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
   LOAD INSPECTION DETAILS
========================================================= */

async function loadDetails() {

  if (!id) {

    box.innerHTML = `
      <div class="card empty">
        <b>Inspection not found.</b>
      </div>
    `;

    if (removeInspectionBtn) {

      removeInspectionBtn.style.display =
        "none";

    }

    return;

  }


  try {

    box.innerHTML = `
      <div class="card empty">
        <b>Loading inspection...</b>
      </div>
    `;


    const response =
      await fetch(
        `/api/inspections/${encodeURIComponent(id)}`
      );


    const record =
      await response.json();


    if (!response.ok) {

      throw new Error(
        record.error ||
        "Inspection not found."
      );

    }


    const indicators =
      record.indicators || {};


    const decisionClass =
      String(
        record.decision || ""
      ).toLowerCase();


    const image =
      record.image ||
      "/images/placeholder.jpg";


    const sizeClassification =
      record.sizeClassification ||
      "Not Determined";


    const estimatedSize =
      safeEstimatedSize(
        record.estimatedSize
      );


    const supplierRating =
      Number(
        record.supplierRating
      ) || 0;


    const stars =
      getStarRating(
        supplierRating
      );


    box.innerHTML = `

      <div class="detail-hero">

        <img
          src="${image}"
          alt="${escapeHtml(record.product)}"
          onerror="this.src='/images/placeholder.jpg'"
        >


        <div>

          <span
            class="status-pill ${decisionClass}"
          >
            ${escapeHtml(record.decision)}
          </span>


          <strong>
            ${Number(record.score) || 0}%
          </strong>


          <h2>
            ${escapeHtml(record.product)}
          </h2>

        </div>

      </div>


      <div class="supplier-rating-detail">

        <span>
          Supplier Product Rating
        </span>

        <strong>
          ${escapeHtml(stars)}
        </strong>

      </div>


      <div class="card detail-card">

        <h3>
          QUALITY ASSESSMENT
        </h3>


        <div class="detail-classification">

          <span>
            Classification
          </span>

          <b>
            ${escapeHtml(sizeClassification)}
          </b>

        </div>


        <p>
          ${
            escapeHtml(
              record.analysis ||
              "No quality assessment available."
            )
          }
        </p>

      </div>


      <div class="indicator-grid indicator-grid-five">

        <div>
          <span>Freshness</span>

          <b>
            ${
              indicators.freshness ??
              "--"
            }%
          </b>
        </div>


        <div>
          <span>Color</span>

          <b>
            ${
              indicators.color ??
              "--"
            }%
          </b>
        </div>


        <div>
          <span>Surface</span>

          <b>
            ${
              indicators.surface ??
              "--"
            }%
          </b>
        </div>


        <div>
          <span>Damage</span>

          <b>
            ${
              indicators.damage ??
              "--"
            }%
          </b>
        </div>


        <div>
          <span>Size</span>

          <b class="detail-size-value">
            ${escapeHtml(estimatedSize)}
          </b>
        </div>

      </div>


      <div class="card info-list">

        <div>

          <span>
            LPO Number
          </span>

          <b>
            ${escapeHtml(record.lpo)}
          </b>

        </div>


        <div>

          <span>
            Supplier
          </span>

          <b>
            ${escapeHtml(record.supplier)}
          </b>

        </div>


        <div>

          <span>
            Receiving Type
          </span>

          <b>
            ${escapeHtml(record.receiving)}
          </b>

        </div>


        <div>

          <span>
            Received Date
          </span>

          <b>
            ${escapeHtml(record.received)}
          </b>

        </div>


        <div>

          <span>
            Expiry Date
          </span>

          <b>
            ${escapeHtml(record.expiry)}
          </b>

        </div>


        ${
          record.reason

            ? `

              <div class="reason-row">

                <span>
                  Rejection Reason
                </span>

                <b>
                  ${escapeHtml(record.reason)}
                </b>

              </div>

            `

            : ""
        }

      </div>


      <button
        class="btn btn-primary full"
        onclick="location.href='/camera'"
      >
        ＋ NEW INSPECTION
      </button>

    `;

  }

  catch (error) {

    console.error(
      "Details loading error:",
      error
    );


    if (removeInspectionBtn) {

      removeInspectionBtn.style.display =
        "none";

    }


    box.innerHTML = `
      <div class="card empty">

        <b>
          Inspection not found.
        </b>

        <p>
          ${escapeHtml(error.message)}
        </p>

      </div>
    `;

  }

}


loadDetails();