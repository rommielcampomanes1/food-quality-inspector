let records = [];

const box =
  document.getElementById(
    "records"
  );

const total =
  document.getElementById(
    "total"
  );

const searchInput =
  document.getElementById(
    "searchInput"
  );

const clearHistoryBtn =
  document.getElementById(
    "clearHistoryBtn"
  );


/* =========================================================
   SAFE HTML
========================================================= */

const escapeHtml = (value) =>
  String(value ?? "").replace(
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


/* =========================================================
   HIDDEN INSPECTIONS
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
   OPEN DETAILS
========================================================= */

function openDetails(id) {

  localStorage.setItem(
    "selectedInspectionId",
    String(id)
  );


  window.location.href =
    "/details";

}


/* =========================================================
   LOAD HISTORY FROM SUPABASE
========================================================= */

async function loadRecords() {

  try {

    box.innerHTML = `
      <div class="empty card">

        <b>
          Loading inspections...
        </b>

      </div>
    `;


    const response =
      await fetch(
        "/api/inspections"
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Unable to load inspection history."
      );

    }


    const hiddenIds =
      getHiddenInspectionIds();


    records =
      (
        Array.isArray(data)
          ? data
          : []
      ).filter(
        (record) =>
          !hiddenIds.includes(
            String(record.id)
          )
      );


    render(
      searchInput.value
    );

  }

  catch (error) {

    console.error(
      "History loading error:",
      error
    );


    box.innerHTML = `
      <div class="empty card">

        <b>
          Unable to load inspections
        </b>

        <p>
          ${escapeHtml(error.message)}
        </p>

      </div>
    `;


    total.textContent =
      "";

  }

}


/* =========================================================
   DISPLAY HISTORY
========================================================= */

function render(
  queryText = ""
) {

  const query =
    queryText
      .toLowerCase()
      .trim();


  const list =
    records.filter(
      (record) =>

        [
          record.lpo,
          record.product,
          record.supplier,
          record.receiving,
          record.decision
        ]

          .join(" ")

          .toLowerCase()

          .includes(query)

    );


  box.innerHTML =

    list
      .map(
        (record) => `

          <button
            class="record card"
            onclick="openDetails(${Number(record.id)})"
          >

            <img
              src="${
                record.image ||
                "/images/placeholder.jpg"
              }"
              alt="${escapeHtml(record.product)}"
              onerror="this.src='/images/placeholder.jpg'"
            >


            <div class="record-main">

              <h3>
                ${escapeHtml(record.lpo)}
              </h3>


              <p class="product-name">
                ${escapeHtml(record.product)}
              </p>


              <p>
                ${escapeHtml(record.supplier)}
              </p>


              <p>
                ${escapeHtml(record.receiving)}
              </p>


              <div class="dates">

                <span>
                  Received:
                  ${escapeHtml(record.received)}
                </span>

                <span>
                  Expiry:
                  ${escapeHtml(record.expiry)}
                </span>

              </div>

            </div>


            <div
              class="status ${
                String(
                  record.decision || ""
                ).toLowerCase()
              }"
            >

              <span>
                ${escapeHtml(record.decision)}
              </span>


              <small>
                Score
              </small>


              <strong>
                ${Number(record.score) || 0}%
              </strong>

            </div>


            ${
              record.reason

                ? `

                  <p class="reason">

                    Reason:
                    ${escapeHtml(record.reason)}

                  </p>

                `

                : ""
            }

          </button>

        `
      )

      .join("") ||

    `

      <div class="empty card">

        <b>
          No inspections found
        </b>

        <p>
          Capture and save a product inspection first.
        </p>

      </div>

    `;


  total.textContent =
    `Total ${list.length} Record${
      list.length === 1
        ? ""
        : "s"
    }`;

}


/* =========================================================
   SEARCH
========================================================= */

searchInput.addEventListener(
  "input",
  (event) => {

    render(
      event.target.value
    );

  }
);


/* =========================================================
   CLEAR HISTORY FROM APP ONLY
========================================================= */

clearHistoryBtn.addEventListener(
  "click",
  () => {

    if (
      records.length === 0
    ) {

      alert(
        "There is no inspection history to clear."
      );

      return;

    }


    const confirmed =
      confirm(
        "Clear all current inspections from this app history?\n\nThe original records will remain safely stored in Supabase."
      );


    if (!confirmed) {
      return;
    }


    const hiddenIds =
      getHiddenInspectionIds();


    records.forEach(
      (record) => {

        hiddenIds.push(
          String(record.id)
        );

      }
    );


    saveHiddenInspectionIds(
      hiddenIds
    );


    records = [];


    searchInput.value =
      "";


    localStorage.removeItem(
      "selectedInspectionId"
    );


    localStorage.removeItem(
      "inspectionImage"
    );


    render();


    alert(
      "History cleared from this app. The original inspection records remain saved in Supabase."
    );

  }
);


/* =========================================================
   START
========================================================= */

loadRecords();