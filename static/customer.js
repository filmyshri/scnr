const eventIdInput = document.getElementById("event-id");
const eventCodeInput = document.getElementById("event-code");
const loadEventButton = document.getElementById("load-event");
const eventStatusText = document.getElementById("event-status");
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
const eventMatchesGrid = document.getElementById("event-matches-grid");
const eventFolderSelect = document.getElementById("event-folder-select");
const selectedCount = document.getElementById("selected-count");
const selectedList = document.getElementById("selected-list");
const downloadSelectedButton = document.getElementById("download-selected");
const textSelectedButton = document.getElementById("text-selected");
const pdfSelectedButton = document.getElementById("pdf-selected");
const clearSelectedButton = document.getElementById("clear-selected");

let currentEventId = null;
let currentEventCode = null;
let eventSelfieFile = null;
const selectedItems = new Map();

const showEventStatus = (message, isError = false) => {
  eventMatchStatus.textContent = message;
  eventMatchStatus.style.color = isError ? "#fca5a5" : "#cbd5f5";
};

const clearEventResults = () => {
  eventUploadedImage.removeAttribute("src");
  eventMatchedImage.removeAttribute("src");
  eventConfidence.textContent = "";
  eventDownload.removeAttribute("href");
  eventDownload.classList.add("hidden");
  eventMatchesGrid.innerHTML = "";
};

const updateSelectedUI = () => {
  selectedList.innerHTML = "";
  selectedCount.textContent = `${selectedItems.size} selected`;
  if (!selectedItems.size) {
    selectedList.innerHTML = "<p class=\"status\">No photos selected.</p>";
    return;
  }
  Array.from(selectedItems.values()).forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "selection-item";

    const label = document.createElement("span");
    label.textContent = `${String(index + 1).padStart(2, "0")} - ${item.folder}/${item.filename}`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button secondary";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      selectedItems.delete(item.key);
      updateSelectedUI();
      syncCheckboxes(item.key, false);
    });

    row.appendChild(label);
    row.appendChild(remove);
    selectedList.appendChild(row);
  });
};

const syncCheckboxes = (key, checked) => {
  document.querySelectorAll(`input[data-select-key="${key}"]`).forEach((el) => {
    el.checked = checked;
  });
};

const toggleSelectItem = (item, checked) => {
  if (checked) {
    selectedItems.set(item.key, item);
  } else {
    selectedItems.delete(item.key);
  }
  updateSelectedUI();
};

const createSelectableCard = (item) => {
  const card = document.createElement("div");
  card.className = "gallery-card";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "select-checkbox";
  checkbox.dataset.selectKey = item.key;
  checkbox.checked = selectedItems.has(item.key);
  checkbox.addEventListener("change", (event) => {
    toggleSelectItem(item, event.target.checked);
  });

  const img = document.createElement("img");
  img.src = item.url;
  img.alt = item.filename;

  const meta = document.createElement("span");
  meta.className = "history-muted";
  meta.textContent = `${item.folder}/${item.filename}`;

  const download = document.createElement("a");
  download.href = item.url;
  download.download = "";
  download.className = "button secondary";
  download.textContent = "Download";

  card.appendChild(checkbox);
  card.appendChild(img);
  card.appendChild(meta);
  if (item.confidence !== undefined) {
    const confidence = document.createElement("span");
    confidence.className = "history-muted";
    confidence.textContent = `Confidence: ${item.confidence}`;
    card.appendChild(confidence);
  }
  card.appendChild(download);

  return card;
};

const renderEventGallery = (images) => {
  eventGalleryGrid.innerHTML = "";
  if (!images.length) {
    eventGalleryGrid.innerHTML = "<p class=\"status\">No images in event.</p>";
    return;
  }
  images.forEach((image) => {
    const key = `${image.folder || "default"}:${image.filename}`;
    const card = createSelectableCard({
      key,
      filename: image.filename,
      folder: image.folder || "default",
      url: image.url,
    });
    eventGalleryGrid.appendChild(card);
  });
};

const renderEventMatches = (matches) => {
  eventMatchesGrid.innerHTML = "";
  if (!matches.length) {
    eventMatchesGrid.innerHTML = "<p class=\"status\">No matches found.</p>";
    return;
  }
  matches.forEach((match) => {
    const key = `${match.folder || "default"}:${match.filename}`;
    const card = createSelectableCard({
      key,
      filename: match.filename,
      folder: match.folder || "default",
      url: match.url,
      confidence: match.confidence,
    });
    eventMatchesGrid.appendChild(card);
  });
};

const renderFolderOptions = (folders) => {
  eventFolderSelect.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All folders";
  eventFolderSelect.appendChild(allOption);

  const defaultOption = document.createElement("option");
  defaultOption.value = "default";
  defaultOption.textContent = "Default";
  eventFolderSelect.appendChild(defaultOption);

  folders.forEach((folder) => {
    if (folder === "default") {
      return;
    }
    const option = document.createElement("option");
    option.value = folder;
    option.textContent = folder;
    eventFolderSelect.appendChild(option);
  });
};

const loadEventFolders = async () => {
  if (!currentEventId || !currentEventCode) {
    return;
  }
  try {
    const response = await fetch(
      `/events/${currentEventId}/folders?code=${encodeURIComponent(currentEventCode)}`
    );
    const data = await response.json();
    if (response.ok) {
      renderFolderOptions(data.folders || []);
    }
  } catch (error) {
    // ignore
  }
};

const loadEventGallery = async () => {
  if (!currentEventId || !currentEventCode) {
    eventGalleryGrid.innerHTML = "<p class=\"status\">Enter event ID and code.</p>";
    return;
  }
  try {
    const folder = eventFolderSelect.value || "all";
    const response = await fetch(
      `/events/${currentEventId}/photos?code=${encodeURIComponent(currentEventCode)}&folder=${encodeURIComponent(folder)}`
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

const setEventPreview = (file) => {
  const reader = new FileReader();
  reader.onload = () => {
    eventPreviewImage.src = reader.result;
    eventPreviewImage.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
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

eventBrowseButton.addEventListener("click", () => eventFileInput.click());
eventFileInput.addEventListener("change", (event) => handleEventFile(event.target.files[0]));

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
  formData.append("folder", eventFolderSelect.value || "all");

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
    if (data.matches && data.matches.length) {
      renderEventMatches(data.matches);
    } else if (data.match_token) {
      const matchesResponse = await fetch(
        `/events/${currentEventId}/matches/${data.match_token}?code=${encodeURIComponent(currentEventCode)}`
      );
      const matchesData = await matchesResponse.json();
      if (matchesResponse.ok) {
        renderEventMatches(matchesData.matches || []);
      }
    }
    showEventStatus(`Best match: ${data.best_match}`);
  } catch (error) {
    showEventStatus(error.message, true);
  } finally {
    eventSearchButton.disabled = false;
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
    loadEventFolders();
    loadEventGallery();
    updateSelectedUI();
  } catch (error) {
    eventStatusText.textContent = error.message;
  } finally {
    loadEventButton.disabled = false;
  }
});

refreshEventGalleryButton.addEventListener("click", loadEventGallery);
eventFolderSelect.addEventListener("change", loadEventGallery);

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

const eventIdFromPage = document.body.dataset.eventId || "";
if (eventIdFromPage) {
  currentEventId = eventIdFromPage;
  eventIdInput.value = currentEventId;
  eventStatusText.textContent = "Enter access code to load event.";
}

downloadSelectedButton.addEventListener("click", async () => {
  if (!currentEventId || !currentEventCode || !selectedItems.size) {
    showEventStatus("Select photos before downloading.", true);
    return;
  }
  const items = Array.from(selectedItems.values()).map((item) => ({
    filename: item.filename,
    folder: item.folder,
  }));
  const response = await fetch(`/events/${currentEventId}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: currentEventCode, items }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    showEventStatus(data.error || "Download failed.", true);
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `event-${currentEventId}-photos.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

textSelectedButton.addEventListener("click", () => {
  if (!currentEventId || !currentEventCode || !selectedItems.size) {
    showEventStatus("Select photos before saving the list.", true);
    return;
  }
  const lines = [];
  lines.push(`Event: ${currentEventId}`);
  lines.push(`Generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)}`);
  lines.push("");
  Array.from(selectedItems.values()).forEach((item, index) => {
    const number = String(index + 1).padStart(2, "0");
    lines.push(`${number} - ${item.folder}/${item.filename}`);
  });
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `event-${currentEventId}-selected.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

pdfSelectedButton.addEventListener("click", async () => {
  if (!currentEventId || !currentEventCode || !selectedItems.size) {
    showEventStatus("Select photos before creating PDF.", true);
    return;
  }
  const items = Array.from(selectedItems.values()).map((item) => ({
    filename: item.filename,
    folder: item.folder,
  }));
  const response = await fetch(`/events/${currentEventId}/album/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: currentEventCode, items }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    showEventStatus(data.error || "PDF generation failed.", true);
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `event-${currentEventId}-album.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

clearSelectedButton.addEventListener("click", () => {
  selectedItems.clear();
  updateSelectedUI();
  document.querySelectorAll(".select-checkbox").forEach((el) => {
    el.checked = false;
  });
});
