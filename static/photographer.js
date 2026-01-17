const eventNameInput = document.getElementById("event-name");
const eventIdInput = document.getElementById("event-id");
const eventCodeInput = document.getElementById("event-code");
const createEventButton = document.getElementById("create-event");
const loadEventButton = document.getElementById("load-event");
const eventCreatedText = document.getElementById("event-created");
const eventStatusText = document.getElementById("event-status");
const eventPhotoInput = document.getElementById("event-photo");
const uploadEventPhotoButton = document.getElementById("upload-event-photo");
const eventGalleryGrid = document.getElementById("event-gallery-grid");
const refreshEventGalleryButton = document.getElementById("refresh-event-gallery");
const eventFolderInput = document.getElementById("event-folder");
const eventGalleryFolderSelect = document.getElementById("event-gallery-folder");

let currentEventId = null;
let currentEventCode = null;

const setDisabled = (disabled) => {
  createEventButton.disabled = disabled;
  loadEventButton.disabled = disabled;
  uploadEventPhotoButton.disabled = disabled;
  refreshEventGalleryButton.disabled = disabled;
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

const renderFolderOptions = (folders) => {
  eventGalleryFolderSelect.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "default";
  defaultOption.textContent = "Default";
  eventGalleryFolderSelect.appendChild(defaultOption);

  folders.forEach((folder) => {
    if (folder === "default") {
      return;
    }
    const option = document.createElement("option");
    option.value = folder;
    option.textContent = folder;
    eventGalleryFolderSelect.appendChild(option);
  });
};

const loadEventFolders = async () => {
  if (!currentEventId || !currentEventCode) {
    return;
  }
  try {
    const response = await fetch(`/events/${currentEventId}/folders`);
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
    const folder = eventGalleryFolderSelect.value || "default";
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
    if (response.status === 403) {
      eventCreatedText.textContent = "Login required.";
      setDisabled(true);
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Event creation failed.");
    }
    currentEventId = data.event_id;
    currentEventCode = data.code;
    eventIdInput.value = currentEventId;
    eventCodeInput.value = currentEventCode;
    eventCreatedText.textContent = `Link: ${data.link} | Code: ${data.code}`;
    eventStatusText.textContent = "Event loaded.";
    loadEventFolders();
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
    loadEventFolders();
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
  const files = Array.from(eventPhotoInput.files || []);
  if (!files.length) {
    eventStatusText.textContent = "Select photos or a ZIP to upload.";
    return;
  }
  const folder = eventFolderInput.value.trim() || "default";
  uploadEventPhotoButton.disabled = true;
  eventStatusText.textContent = "Uploading...";
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  formData.append("folder", folder);
  try {
    const response = await fetch(`/events/${currentEventId}/photos/upload`, {
      method: "POST",
      body: formData,
    });
    if (response.status === 403) {
      eventStatusText.textContent = "Login required.";
      setDisabled(true);
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Upload failed.");
    }
    if (data.saved_files && data.saved_files.length) {
      eventStatusText.textContent = `Added ${data.saved_files.length} file(s).`;
    } else {
      eventStatusText.textContent = "Upload complete.";
    }
    eventPhotoInput.value = "";
    loadEventFolders();
    loadEventGallery();
  } catch (error) {
    eventStatusText.textContent = error.message;
  } finally {
    uploadEventPhotoButton.disabled = false;
  }
});

refreshEventGalleryButton.addEventListener("click", loadEventGallery);
eventGalleryFolderSelect.addEventListener("change", loadEventGallery);
