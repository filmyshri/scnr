const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const browseButton = document.getElementById("browse-button");
const searchButton = document.getElementById("search-button");
const addDbButton = document.getElementById("add-db-button");
const previewImage = document.getElementById("preview-image");
const statusText = document.getElementById("status");
const resultUpload = document.getElementById("result-upload");
const resultMatch = document.getElementById("result-match");
const confidenceText = document.getElementById("confidence");
const downloadLink = document.getElementById("download-link");
const galleryGrid = document.getElementById("gallery-grid");
const refreshGalleryButton = document.getElementById("refresh-gallery");
const eventNameInput = document.getElementById("event-name");
const eventIdInput = document.getElementById("event-id");
const eventCodeInput = document.getElementById("event-code");
const createEventButton = document.getElementById("create-event");
const loadEventButton = document.getElementById("load-event");
const eventCreatedText = document.getElementById("event-created");
const eventStatusText = document.getElementById("event-status");
const eventPhotoInput = document.getElementById("event-photo");
const uploadEventPhotoButton = document.getElementById("upload-event-photo");
const eventDropZone = document.getElementById("event-drop-zone");
const eventFileInput = document.getElementById("event-file-input");
const eventBrowseButton = document.getElementById("event-browse");
const eventPreviewImage = document.getElementById("event-preview");
const eventSearchButton = document.getElementById("event-search");
const eventMatchStatus = document.getElementById("event-match-status");
const eventUploadedImage = document.getElementById("event-uploaded");
const eventMatchedImage = document.getElementById("event-match");
const eventConfidence = document.getElementById("event-confidence");
const eventDownload = document.getElementById("event-download");
const eventGalleryGrid = document.getElementById("event-gallery-grid");
const refreshEventGalleryButton = document.getElementById("refresh-event-gallery");

let selectedFile = null;
let currentEventId = null;
let currentEventCode = null;
let eventSelfieFile = null;

const showStatus = (message, isError = false) => {
  statusText.textContent = message;
  statusText.style.color = isError ? "#fca5a5" : "#cbd5f5";
};

const showEventStatus = (message, isError = false) => {
  eventMatchStatus.textContent = message;
  eventMatchStatus.style.color = isError ? "#fca5a5" : "#cbd5f5";
};

const clearResults = () => {
  resultUpload.removeAttribute("src");
  resultMatch.removeAttribute("src");
  confidenceText.textContent = "";
  downloadLink.removeAttribute("href");
  downloadLink.classList.add("hidden");
};

const clearEventResults = () => {
  eventUploadedImage.removeAttribute("src");
  eventMatchedImage.removeAttribute("src");
  eventConfidence.textContent = "";
  eventDownload.removeAttribute("href");
  eventDownload.classList.add("hidden");
};

const renderGallery = (images) => {
  galleryGrid.innerHTML = "";
  if (!images.length) {
    galleryGrid.innerHTML = "<p class=\"status\">No images in database.</p>";
    return;
  }
  images.forEach((image) => {
    const card = document.createElement("div");
    card.className = "gallery-card";

    const img = document.createElement("img");
    img.src = image.url;
    img.alt = image.filename;

    const download = document.createElement("a");
    download.href = image.url;
    download.download = "";
    download.className = "button secondary";
    download.textContent = "Download";

    card.appendChild(img);
    card.appendChild(download);
    galleryGrid.appendChild(card);
  });
};

const loadGallery = async () => {
  try {
    const response = await fetch("/database/list");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to load gallery.");
    }
    renderGallery(data.images || []);
  } catch (error) {
    galleryGrid.innerHTML = `<p class="status">${error.message}</p>`;
  }
};

const renderEventGallery = (images) => {
  eventGalleryGrid.innerHTML = "";
  if (!images.length) {
    eventGalleryGrid.innerHTML = "<p class=\"status\">No images in event.</p>";
    return;
  }
  images.forEach((image) => {
    const card = document.createElement("div");
    card.className = "gallery-card";

    const img = document.createElement("img");
    img.src = image.url;
    img.alt = image.filename;

    const download = document.createElement("a");
    download.href = image.url;
    download.download = "";
    download.className = "button secondary";
    download.textContent = "Download";

    card.appendChild(img);
    card.appendChild(download);
    eventGalleryGrid.appendChild(card);
  });
};

const loadEventGallery = async () => {
  if (!currentEventId || !currentEventCode) {
    eventGalleryGrid.innerHTML = "<p class=\"status\">Enter event ID and code.</p>";
    return;
  }
  try {
    const response = await fetch(
      `/events/${currentEventId}/photos?code=${encodeURIComponent(currentEventCode)}`
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to load event gallery.");
    }
    renderEventGallery(data.images || []);
  } catch (error) {
    eventGalleryGrid.innerHTML = `<p class="status">${error.message}</p>`;
  }
};

const setPreview = (file) => {
  const reader = new FileReader();
  reader.onload = () => {
    previewImage.src = reader.result;
    previewImage.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
};

const setEventPreview = (file) => {
  const reader = new FileReader();
  reader.onload = () => {
    eventPreviewImage.src = reader.result;
    eventPreviewImage.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
};

const handleFile = (file) => {
  if (!file) {
    return;
  }
  if (!file.type.startsWith("image/")) {
    showStatus("Please select a valid image file.", true);
    return;
  }
  selectedFile = file;
  setPreview(file);
  searchButton.disabled = false;
  addDbButton.disabled = false;
  showStatus("Ready to search.");
  clearResults();
};

const handleEventFile = (file) => {
  if (!file) {
    return;
  }
  if (!file.type.startsWith("image/")) {
    showEventStatus("Please select a valid image file.", true);
    return;
  }
  eventSelfieFile = file;
  setEventPreview(file);
  eventSearchButton.disabled = false;
  showEventStatus("Ready to search.");
  clearEventResults();
};

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragover");
  const file = event.dataTransfer.files[0];
  handleFile(file);
});

browseButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (event) => handleFile(event.target.files[0]));

eventBrowseButton.addEventListener("click", () => eventFileInput.click());
eventFileInput.addEventListener("change", (event) => handleEventFile(event.target.files[0]));

searchButton.addEventListener("click", async () => {
  if (!selectedFile) {
    return;
  }

  searchButton.disabled = true;
  showStatus("Searching...");

  const formData = new FormData();
  formData.append("file", selectedFile);

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Upload failed.");
    }

    resultUpload.src = data.uploaded_image_url;
    resultMatch.src = data.match_image_url;
    confidenceText.textContent = `Confidence: ${data.confidence}`;
    downloadLink.href = data.match_image_url;
    downloadLink.classList.remove("hidden");
    showStatus(`Best match: ${data.best_match}`);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    searchButton.disabled = false;
  }
});

eventSearchButton.addEventListener("click", async () => {
  if (!eventSelfieFile || !currentEventId || !currentEventCode) {
    showEventStatus("Select a selfie and load an event.", true);
    return;
  }

  eventSearchButton.disabled = true;
  showEventStatus("Searching...");

  const formData = new FormData();
  formData.append("file", eventSelfieFile);
  formData.append("code", currentEventCode);

  try {
    const response = await fetch(`/events/${currentEventId}/match`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Match failed.");
    }

    eventUploadedImage.src = data.uploaded_image_url;
    eventMatchedImage.src = data.match_image_url;
    eventConfidence.textContent = `Confidence: ${data.confidence}`;
    eventDownload.href = data.match_image_url;
    eventDownload.classList.remove("hidden");
    showEventStatus(`Best match: ${data.best_match}`);
  } catch (error) {
    showEventStatus(error.message, true);
  } finally {
    eventSearchButton.disabled = false;
  }
});

addDbButton.addEventListener("click", async () => {
  if (!selectedFile) {
    return;
  }

  addDbButton.disabled = true;
  showStatus("Adding to database...");

  const formData = new FormData();
  formData.append("file", selectedFile);

  try {
    const response = await fetch("/database/upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Database upload failed.");
    }
    showStatus(`Added to database: ${data.filename}`);
    loadGallery();
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    addDbButton.disabled = false;
  }
});

createEventButton.addEventListener("click", async () => {
  const name = eventNameInput.value.trim();
  if (!name) {
    eventCreatedText.textContent = "Enter an event name.";
    return;
  }
  createEventButton.disabled = true;
  eventCreatedText.textContent = "Creating...";
  try {
    const formData = new FormData();
    formData.append("name", name);
    const response = await fetch("/events", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Event creation failed.");
    }
    currentEventId = data.event_id;
    currentEventCode = data.code;
    eventIdInput.value = currentEventId;
    eventCodeInput.value = currentEventCode;
    eventCreatedText.textContent = `Link: ${window.location.origin}${data.link} | Code: ${data.code}`;
    eventStatusText.textContent = "Event loaded.";
    loadEventGallery();
  } catch (error) {
    eventCreatedText.textContent = error.message;
  } finally {
    createEventButton.disabled = false;
  }
});

loadEventButton.addEventListener("click", async () => {
  const eventId = eventIdInput.value.trim();
  const code = eventCodeInput.value.trim();
  if (!eventId || !code) {
    eventStatusText.textContent = "Enter event ID and code.";
    return;
  }
  loadEventButton.disabled = true;
  eventStatusText.textContent = "Verifying...";
  try {
    const response = await fetch(`/events/${eventId}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Login failed.");
    }
    currentEventId = eventId;
    currentEventCode = code;
    eventStatusText.textContent = "Event loaded.";
    loadEventGallery();
  } catch (error) {
    eventStatusText.textContent = error.message;
  } finally {
    loadEventButton.disabled = false;
  }
});

uploadEventPhotoButton.addEventListener("click", async () => {
  if (!currentEventId) {
    eventStatusText.textContent = "Load an event first.";
    return;
  }
  const file = eventPhotoInput.files[0];
  if (!file) {
    eventStatusText.textContent = "Select a photo to upload.";
    return;
  }
  uploadEventPhotoButton.disabled = true;
  eventStatusText.textContent = "Uploading...";
  const formData = new FormData();
  formData.append("file", file);
  try {
    const response = await fetch(`/events/${currentEventId}/photos/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Upload failed.");
    }
    eventStatusText.textContent = `Added: ${data.filename}`;
    eventPhotoInput.value = "";
    loadEventGallery();
  } catch (error) {
    eventStatusText.textContent = error.message;
  } finally {
    uploadEventPhotoButton.disabled = false;
  }
});

refreshEventGalleryButton.addEventListener("click", loadEventGallery);

eventDropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  eventDropZone.classList.add("dragover");
});

eventDropZone.addEventListener("dragleave", () => {
  eventDropZone.classList.remove("dragover");
});

eventDropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  eventDropZone.classList.remove("dragover");
  const file = event.dataTransfer.files[0];
  handleEventFile(file);
});

refreshGalleryButton.addEventListener("click", loadGallery);

loadGallery();

const pathMatch = window.location.pathname.match(/^\/event\/([a-f0-9]+)/i);
if (pathMatch) {
  currentEventId = pathMatch[1];
  eventIdInput.value = currentEventId;
  eventStatusText.textContent = "Enter access code to load event.";
  loadEventGallery();
}
