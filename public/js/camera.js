const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const galleryInput = document.getElementById("galleryInput");
const cameraInput = document.getElementById("cameraInput");
const instruction = document.querySelector(".instruction");
const captureBtn = document.getElementById("captureBtn");
const galleryBtn = document.getElementById("galleryTop");

let cameraReady = false;
let stream = null;

async function startCamera() {
  if (
    !window.isSecureContext ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    instruction.innerHTML =
      "Tap the shutter<br>to open your camera";
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();
    cameraReady = true;
  } catch (error) {
    console.warn("Live camera unavailable:", error);
    instruction.innerHTML =
      "Tap the shutter<br>to open your camera";
  }
}

function stopCamera() {
  if (!stream) return;

  stream.getTracks().forEach(track => track.stop());
  stream = null;
  cameraReady = false;
}

function compressImage(source, maxWidth = 900, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = width;
      outputCanvas.height = height;

      const context = outputCanvas.getContext("2d");

      context.drawImage(img, 0, 0, width, height);

      resolve(
        outputCanvas.toDataURL("image/jpeg", quality)
      );
    };

    img.onerror = () => {
      reject(new Error("Unable to process the image."));
    };

    img.src = source;
  });
}

function saveAndContinue(dataUrl) {
  if (!dataUrl) return;

  stopCamera();

  try {
    localStorage.removeItem("inspectionImage");
    localStorage.setItem("inspectionImage", dataUrl);

    window.location.href = "/result";
  } catch (error) {
    console.error("Image storage error:", error);

    alert(
      "Browser storage is still full. Clear this site's data in Chrome and try again."
    );
  }
}

function readSelectedImage(input) {
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async () => {
    try {
      instruction.innerHTML = "Preparing image...";

      const compressedImage = await compressImage(
        reader.result,
        900,
        0.65
      );

      saveAndContinue(compressedImage);
    } catch (error) {
      console.error(error);
      alert("Unable to process the selected image.");
    }
  };

  reader.onerror = () => {
    alert("Unable to read the selected image.");
  };

  reader.readAsDataURL(file);
}

galleryBtn.addEventListener("click", () => {
  galleryInput.value = "";
  galleryInput.click();
});

galleryInput.addEventListener("change", () => {
  readSelectedImage(galleryInput);
});

cameraInput.addEventListener("change", () => {
  readSelectedImage(cameraInput);
});

captureBtn.addEventListener("click", async () => {
  if (
    cameraReady &&
    video.videoWidth &&
    video.videoHeight
  ) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    try {
      const compressedImage = await compressImage(
        canvas.toDataURL("image/jpeg", 0.75),
        900,
        0.65
      );

      saveAndContinue(compressedImage);
    } catch (error) {
      console.error(error);
      alert("Unable to process the captured image.");
    }

    return;
  }

  cameraInput.value = "";
  cameraInput.click();
});

window.addEventListener("pagehide", stopCamera);

startCamera();