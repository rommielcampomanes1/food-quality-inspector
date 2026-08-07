const id = localStorage.getItem("selectedInspectionId");
const box = document.getElementById("details");

function escapeHtml(value) {
  return String(value ?? "").replace(
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

async function loadDetails() {
  if (!id) {
    box.innerHTML = `
      <div class="card empty">
        <b>Inspection not found.</b>
      </div>
    `;
    return;
  }

  try {
    box.innerHTML = `
      <div class="card empty">
        <b>Loading inspection...</b>
      </div>
    `;

    const response = await fetch(`/api/inspections/${encodeURIComponent(id)}`);
    const record = await response.json();

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


      <div class="card detail-card">

        <h3>
          AI Analysis
        </h3>

        <p>
          ${
            escapeHtml(
              record.analysis ||
              "No analysis available."
            )
          }
        </p>

      </div>


      <div class="indicator-grid">

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

      </div>


      <div class="card info-list">

        <div>
          <span>LPO Number</span>

          <b>
            ${escapeHtml(record.lpo)}
          </b>
        </div>


        <div>
          <span>Supplier</span>

          <b>
            ${escapeHtml(record.supplier)}
          </b>
        </div>


        <div>
          <span>Receiving Type</span>

          <b>
            ${escapeHtml(record.receiving)}
          </b>
        </div>


        <div>
          <span>Received Date</span>

          <b>
            ${escapeHtml(record.received)}
          </b>
        </div>


        <div>
          <span>Expiry Date</span>

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

  } catch (error) {
    console.error(
      "Details loading error:",
      error
    );

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