import json
import os
import uuid
import secrets
import zipfile
import time
from datetime import datetime
from io import BytesIO

from flask import Flask, jsonify, redirect, render_template, request, send_from_directory, send_file, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash
from fpdf import FPDF
from PIL import Image
import cv2
import numpy as np


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
DB_DIR = os.path.join(BASE_DIR, "database")
EVENTS_DIR = os.path.join(BASE_DIR, "events")
EVENTS_FILE = os.path.join(EVENTS_DIR, "events.json")
PHOTOGRAPHERS_FILE = os.path.join(EVENTS_DIR, "photographers.json")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
ZIP_EXTENSIONS = {".zip"}
MATCH_CACHE = {}
MATCH_CACHE_TTL = 60 * 30
FACE_CASCADE = cv2.CascadeClassifier(
    os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
)

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.environ.get("SECRET_KEY", "change_me")


def _is_allowed(filename):
    _, ext = os.path.splitext(filename)
    return ext.lower() in ALLOWED_EXTENSIONS


def _safe_filename(original_name):
    base, ext = os.path.splitext(original_name)
    safe_base = "".join(ch for ch in base if ch.isalnum() or ch in ("-", "_"))
    safe_base = safe_base.strip("._-") or "image"
    return f"{safe_base}{ext.lower()}"


def _safe_zip_members(members):
    safe = []
    for name in members:
        normalized = os.path.normpath(name).lstrip("\\/")
        if normalized.startswith("..") or os.path.isabs(normalized):
            continue
        if os.path.splitext(normalized)[1].lower() in ALLOWED_EXTENSIONS:
            safe.append(normalized)
    return safe


def _load_face_encodings(image_path):
    if FACE_CASCADE.empty():
        return []
    image = cv2.imread(image_path)
    if image is None:
        return []
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces = FACE_CASCADE.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
    )
    encodings = []
    for (x, y, w, h) in faces:
        face = gray[y : y + h, x : x + w]
        resized = cv2.resize(face, (100, 100), interpolation=cv2.INTER_AREA)
        encodings.append(resized.flatten().astype("float32") / 255.0)
    return encodings


def _face_distance(encoding_a, encoding_b):
    return float(np.linalg.norm(encoding_a - encoding_b))


def _ensure_dir(path):
    os.makedirs(path, exist_ok=True)


def _load_events():
    _ensure_dir(EVENTS_DIR)
    if not os.path.exists(EVENTS_FILE):
        return []
    with open(EVENTS_FILE, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_events(events):
    _ensure_dir(EVENTS_DIR)
    with open(EVENTS_FILE, "w", encoding="utf-8") as handle:
        json.dump(events, handle, indent=2)


def _photographer_dir(photographer_id):
    return os.path.join(EVENTS_DIR, photographer_id)


def _events_file(photographer_id):
    return os.path.join(_photographer_dir(photographer_id), "events.json")


def _load_events_for(photographer_id):
    _ensure_dir(_photographer_dir(photographer_id))
    path = _events_file(photographer_id)
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_events_for(photographer_id, events):
    _ensure_dir(_photographer_dir(photographer_id))
    with open(_events_file(photographer_id), "w", encoding="utf-8") as handle:
        json.dump(events, handle, indent=2)


def _load_photographers():
    _ensure_dir(EVENTS_DIR)
    if not os.path.exists(PHOTOGRAPHERS_FILE):
        return []
    with open(PHOTOGRAPHERS_FILE, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_photographers(photographers):
    _ensure_dir(EVENTS_DIR)
    with open(PHOTOGRAPHERS_FILE, "w", encoding="utf-8") as handle:
        json.dump(photographers, handle, indent=2)


def _find_photographer_by_username(username):
    photographers = _load_photographers()
    for photographer in photographers:
        if photographer["username"].lower() == username.lower():
            return photographer
    return None


def _find_photographer_by_id(photographer_id):
    photographers = _load_photographers()
    for photographer in photographers:
        if photographer["id"] == photographer_id:
            return photographer
    return None


def _find_event(event_id, photographer_id=None):
    if photographer_id:
        events = _load_events_for(photographer_id)
        for event in events:
            if event["id"] == event_id:
                return event
        return None

    photographers = _load_photographers()
    for photographer in photographers:
        events = _load_events_for(photographer["id"])
        for event in events:
            if event["id"] == event_id:
                return event, photographer["id"]
    return None, None


def _generate_code():
    return f"{secrets.randbelow(1000000):06d}"


def _event_photo_dir(photographer_id, event_id):
    return os.path.join(_photographer_dir(photographer_id), event_id, "photos")


def _event_folder_base(photographer_id, event_id):
    return os.path.join(_photographer_dir(photographer_id), event_id, "folders")


def _safe_folder_name(name):
    cleaned = "".join(ch for ch in name.strip() if ch.isalnum() or ch in ("-", "_"))
    return cleaned or "default"


def _event_folder_dir(photographer_id, event_id, folder):
    return os.path.join(_event_folder_base(photographer_id, event_id), folder)


def _list_event_folders(photographer_id, event_id):
    folders = set()
    base = _event_folder_base(photographer_id, event_id)
    if os.path.isdir(base):
        for entry in os.listdir(base):
            if os.path.isdir(os.path.join(base, entry)):
                folders.add(entry)

    legacy_dir = _event_photo_dir(photographer_id, event_id)
    if os.path.isdir(legacy_dir) and any(
        os.path.splitext(name)[1].lower() in ALLOWED_EXTENSIONS
        for name in os.listdir(legacy_dir)
    ):
        folders.add("default")

    return sorted(folders, key=lambda name: name.lower())


def _resolve_event_photo_path(photographer_id, event_id, folder, filename):
    safe_name = os.path.basename(filename)
    if os.path.splitext(safe_name)[1].lower() not in ALLOWED_EXTENSIONS:
        return None
    safe_folder = _safe_folder_name(folder or "default")
    if safe_folder == "default":
        legacy_path = os.path.join(_event_photo_dir(photographer_id, event_id), safe_name)
        if os.path.exists(legacy_path):
            return legacy_path
    folder_path = os.path.join(_event_folder_dir(photographer_id, event_id, safe_folder), safe_name)
    if os.path.exists(folder_path):
        return folder_path
    return None


def _event_upload_dir(photographer_id, event_id):
    return os.path.join(_photographer_dir(photographer_id), event_id, "uploads")


def _photographer_logged_in():
    return session.get("photographer_logged_in", False) and session.get("photographer_id")


def _require_photographer():
    if not _photographer_logged_in():
        return jsonify(error="Photographer login required."), 403
    return None


def _current_photographer_id():
    return session.get("photographer_id")


def _cleanup_match_cache():
    now = time.time()
    expired = [key for key, item in MATCH_CACHE.items() if now - item["ts"] > MATCH_CACHE_TTL]
    for key in expired:
        MATCH_CACHE.pop(key, None)


def _store_match_cache(event_id, code, matches):
    _cleanup_match_cache()
    token = uuid.uuid4().hex
    MATCH_CACHE[token] = {
        "event_id": event_id,
        "code": code,
        "matches": matches,
        "ts": time.time(),
    }
    return token


@app.route("/")
def index():
    return render_template("landing.html")


@app.route("/photographer")
def photographer_page():
    return render_template(
        "photographer.html",
        logged_in=_photographer_logged_in(),
        events=_load_events_for(_current_photographer_id()) if _photographer_logged_in() else [],
        error=request.args.get("error", ""),
        success=request.args.get("success", ""),
    )


@app.route("/customer")
def customer_page():
    return render_template("customer.html", event_id="")


@app.route("/photographer/login", methods=["POST"])
def photographer_login():
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    photographer = _find_photographer_by_username(username)
    if not photographer or not check_password_hash(photographer["password_hash"], password):
        return redirect(url_for("photographer_page", error="Invalid credentials"))
    session["photographer_logged_in"] = True
    session["photographer_id"] = photographer["id"]
    return redirect(url_for("photographer_page"))


@app.route("/photographer/signup", methods=["POST"])
def photographer_signup():
    client_name = request.form.get("client_name", "").strip()
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    if not client_name or not username or not password:
        return redirect(url_for("photographer_page", error="All fields are required"))
    if _find_photographer_by_username(username):
        return redirect(url_for("photographer_page", error="Username already exists"))

    photographers = _load_photographers()
    photographer_id = uuid.uuid4().hex[:10]
    photographers.append(
        {
            "id": photographer_id,
            "client_name": client_name,
            "username": username,
            "password_hash": generate_password_hash(password),
        }
    )
    _save_photographers(photographers)
    _ensure_dir(_photographer_dir(photographer_id))

    session["photographer_logged_in"] = True
    session["photographer_id"] = photographer_id
    return redirect(url_for("photographer_page", success="Account created"))


@app.route("/photographer/logout", methods=["POST"])
def photographer_logout():
    session.pop("photographer_logged_in", None)
    session.pop("photographer_id", None)
    return redirect(url_for("photographer_page"))


@app.route("/history")
def history_page():
    if not _photographer_logged_in():
        return redirect(url_for("photographer_page"))
    events = _load_events_for(_current_photographer_id())
    return render_template("history.html", events=events)


@app.route("/event/<event_id>")
def event_page(event_id):
    return render_template("customer.html", event_id=event_id)


@app.route("/database/<path:filename>")
def database_file(filename):
    return send_from_directory(DB_DIR, filename)


@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)


@app.route("/events/<event_id>/photos/<path:filename>")
def event_photo_file(event_id, filename):
    code = request.args.get("code", "")
    event, photographer_id = _find_event(event_id)
    if not event:
        return jsonify(error="Event not found."), 404
    if event["code"] != code:
        return jsonify(error="Invalid access code."), 403
    return send_from_directory(_event_photo_dir(photographer_id, event_id), filename)


@app.route("/events/<event_id>/folders/<folder>/photos/<path:filename>")
def event_folder_photo_file(event_id, folder, filename):
    code = request.args.get("code", "")
    event, photographer_id = _find_event(event_id)
    if not event:
        return jsonify(error="Event not found."), 404
    if event["code"] != code:
        return jsonify(error="Invalid access code."), 403
    safe_folder = _safe_folder_name(folder)
    return send_from_directory(_event_folder_dir(photographer_id, event_id, safe_folder), filename)


@app.route("/events/<event_id>/uploads/<path:filename>")
def event_upload_file(event_id, filename):
    event, photographer_id = _find_event(event_id)
    if not event:
        return jsonify(error="Event not found."), 404
    return send_from_directory(_event_upload_dir(photographer_id, event_id), filename)


@app.route("/events/<event_id>/folders", methods=["GET"])
def list_event_folders(event_id):
    event, photographer_id = _find_event(event_id)
    if not event:
        return jsonify(error="Event not found."), 404
    code = request.args.get("code", "")
    if _photographer_logged_in():
        if photographer_id != _current_photographer_id():
            return jsonify(error="Invalid photographer session."), 403
    elif event["code"] != code:
        return jsonify(error="Invalid access code."), 403

    return jsonify(folders=_list_event_folders(photographer_id, event_id))


@app.route("/database/list", methods=["GET"])
def list_database_images():
    _ensure_dir(DB_DIR)
    files = [
        f for f in os.listdir(DB_DIR)
        if os.path.splitext(f)[1].lower() in ALLOWED_EXTENSIONS
    ]
    files.sort(key=lambda name: name.lower())
    return jsonify(
        images=[
            {"filename": name, "url": f"/database/{name}"}
            for name in files
        ]
    )


@app.route("/events", methods=["POST"])
def create_event():
    auth_error = _require_photographer()
    if auth_error:
        return auth_error
    payload = request.get_json(silent=True) or {}
    name = request.form.get("name") or payload.get("name")
    if not name:
        return jsonify(error="Event name is required."), 400

    photographer_id = _current_photographer_id()
    events = _load_events_for(photographer_id)
    event_id = uuid.uuid4().hex[:8]
    code = _generate_code()
    events.append(
        {"id": event_id, "name": name, "code": code}
    )
    _save_events_for(photographer_id, events)

    _ensure_dir(_event_photo_dir(photographer_id, event_id))
    _ensure_dir(_event_upload_dir(photographer_id, event_id))

    return jsonify(
        event_id=event_id,
        code=code,
        link=f"{request.host_url.rstrip('/')}/event/{event_id}",
        link_path=f"/event/{event_id}",
    )


@app.route("/events/<event_id>/photos", methods=["GET"])
def list_event_photos(event_id):
    event, photographer_id = _find_event(event_id)
    if not event:
        return jsonify(error="Event not found."), 404
    code = request.args.get("code", "")
    if event["code"] != code:
        return jsonify(error="Invalid access code."), 403

    folder = request.args.get("folder", "default").strip().lower()
    images = []

    legacy_dir = _event_photo_dir(photographer_id, event_id)
    if os.path.isdir(legacy_dir):
        for name in os.listdir(legacy_dir):
            if os.path.splitext(name)[1].lower() in ALLOWED_EXTENSIONS:
                images.append(
                    {
                        "filename": name,
                        "folder": "default",
                        "url": f"/events/{event_id}/photos/{name}?code={code}",
                    }
                )

    if folder and folder != "all":
        safe_folder = _safe_folder_name(folder)
        folder_dirs = [safe_folder]
    else:
        folder_dirs = [
            name for name in _list_event_folders(photographer_id, event_id)
            if name != "default"
        ]

    for folder_name in folder_dirs:
        folder_dir = _event_folder_dir(photographer_id, event_id, folder_name)
        if not os.path.isdir(folder_dir):
            continue
        for name in os.listdir(folder_dir):
            if os.path.splitext(name)[1].lower() in ALLOWED_EXTENSIONS:
                images.append(
                    {
                        "filename": name,
                        "folder": folder_name,
                        "url": f"/events/{event_id}/folders/{folder_name}/photos/{name}?code={code}",
                    }
                )

    images.sort(key=lambda item: item["filename"].lower())
    return jsonify(images=images)


@app.route("/events/<event_id>/photos/upload", methods=["POST"])
def upload_event_photos(event_id):
    photographer_id = _current_photographer_id()
    event = _find_event(event_id, photographer_id=photographer_id)
    if not event:
        return jsonify(error="Event not found."), 404
    auth_error = _require_photographer()
    if auth_error:
        return auth_error
    files = request.files.getlist("files")
    if not files:
        return jsonify(error="No files selected."), 400

    folder = _safe_folder_name(request.form.get("folder", "default"))
    photo_dir = _event_folder_dir(photographer_id, event_id, folder)
    _ensure_dir(photo_dir)

    saved_files = []

    for file in files:
        if file.filename == "":
            continue
        ext = os.path.splitext(file.filename)[1].lower()
        if ext in ZIP_EXTENSIONS:
            try:
                with zipfile.ZipFile(file.stream) as archive:
                    members = _safe_zip_members(archive.namelist())
                    for member in members:
                        safe_name = _safe_filename(os.path.basename(member))
                        if os.path.exists(os.path.join(photo_dir, safe_name)):
                            base, ext = os.path.splitext(safe_name)
                            safe_name = f"{base}-{uuid.uuid4().hex[:6]}{ext}"
                        with archive.open(member) as src:
                            target_path = os.path.join(photo_dir, safe_name)
                            with open(target_path, "wb") as dest:
                                dest.write(src.read())
                        saved_files.append(safe_name)
            except zipfile.BadZipFile:
                return jsonify(error="Invalid ZIP file."), 400
            continue

        if not _is_allowed(file.filename):
            return jsonify(error="Only JPG, PNG, or ZIP files are allowed."), 400

        safe_name = _safe_filename(file.filename)
        if os.path.exists(os.path.join(photo_dir, safe_name)):
            base, ext = os.path.splitext(safe_name)
            safe_name = f"{base}-{uuid.uuid4().hex[:6]}{ext}"

        save_path = os.path.join(photo_dir, safe_name)
        file.save(save_path)
        saved_files.append(safe_name)

    if not saved_files:
        return jsonify(error="No valid images found in upload."), 400

    return jsonify(
        saved_files=saved_files,
        image_urls=[
            f"/events/{event_id}/folders/{folder}/photos/{name}?code={event['code']}"
            for name in saved_files
        ],
        folder=folder,
    )


@app.route("/events/<event_id>/update", methods=["POST"])
def update_event(event_id):
    auth_error = _require_photographer()
    if auth_error:
        return auth_error
    name = request.form.get("name", "").strip()
    if not name:
        return jsonify(error="Event name is required."), 400
    photographer_id = _current_photographer_id()
    events = _load_events_for(photographer_id)
    updated = False
    for event in events:
        if event["id"] == event_id:
            event["name"] = name
            updated = True
            break
    if not updated:
        return jsonify(error="Event not found."), 404
    _save_events_for(photographer_id, events)
    return redirect(url_for("photographer_page"))


@app.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify(error="No file part in the request."), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify(error="No file selected."), 400
    if not _is_allowed(file.filename):
        return jsonify(error="Only JPG and PNG files are allowed."), 400

    _ensure_dir(UPLOAD_DIR)
    _ensure_dir(DB_DIR)

    ext = os.path.splitext(file.filename)[1].lower()
    upload_name = f"{uuid.uuid4().hex}{ext}"
    upload_path = os.path.join(UPLOAD_DIR, upload_name)
    file.save(upload_path)

    selfie_encodings = _load_face_encodings(upload_path)
    if not selfie_encodings:
        return jsonify(error="No face found in the uploaded image."), 400
    selfie_encoding = selfie_encodings[0]

    db_files = [
        f for f in os.listdir(DB_DIR)
        if os.path.splitext(f)[1].lower() in ALLOWED_EXTENSIONS
    ]
    if not db_files:
        return jsonify(error="No images found in the database folder."), 400

    best_match = None
    best_distance = None

    for filename in db_files:
        db_path = os.path.join(DB_DIR, filename)
        db_encodings = _load_face_encodings(db_path)
        if not db_encodings:
            continue
        for db_encoding in db_encodings:
            distance = _face_distance(db_encoding, selfie_encoding)
            if best_distance is None or distance < best_distance:
                best_distance = float(distance)
                best_match = filename

    if best_match is None:
        return jsonify(error="No faces found in database images."), 400

    confidence = 1.0 / (1.0 + best_distance)

    return jsonify(
        best_match=best_match,
        confidence=round(confidence, 4),
        match_image_url=f"/database/{best_match}",
        uploaded_image_url=f"/uploads/{upload_name}",
    )


@app.route("/database/upload", methods=["POST"])
def upload_to_database():
    if "file" not in request.files:
        return jsonify(error="No file part in the request."), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify(error="No file selected."), 400
    if not _is_allowed(file.filename):
        return jsonify(error="Only JPG and PNG files are allowed."), 400

    _ensure_dir(DB_DIR)

    safe_name = _safe_filename(file.filename)
    if os.path.exists(os.path.join(DB_DIR, safe_name)):
        base, ext = os.path.splitext(safe_name)
        safe_name = f"{base}-{uuid.uuid4().hex[:6]}{ext}"

    save_path = os.path.join(DB_DIR, safe_name)
    file.save(save_path)

    return jsonify(
        filename=safe_name,
        image_url=f"/database/{safe_name}",
    )


@app.route("/events/<event_id>/login", methods=["POST"])
def login_event(event_id):
    event, _ = _find_event(event_id)
    if not event:
        return jsonify(error="Event not found."), 404
    payload = request.get_json(silent=True) or {}
    code = request.form.get("code") or payload.get("code") or ""
    if event["code"] != code:
        return jsonify(error="Invalid access code."), 403
    return jsonify(success=True)


@app.route("/events/<event_id>/match", methods=["POST"])
def match_event(event_id):
    event, photographer_id = _find_event(event_id)
    if not event:
        return jsonify(error="Event not found."), 404

    if "file" not in request.files:
        return jsonify(error="No file part in the request."), 400

    code = request.form.get("code", "")
    if event["code"] != code:
        return jsonify(error="Invalid access code."), 403

    file = request.files["file"]
    if file.filename == "":
        return jsonify(error="No file selected."), 400
    if not _is_allowed(file.filename):
        return jsonify(error="Only JPG and PNG files are allowed."), 400

    upload_dir = _event_upload_dir(photographer_id, event_id)
    _ensure_dir(upload_dir)

    ext = os.path.splitext(file.filename)[1].lower()
    upload_name = f"{uuid.uuid4().hex}{ext}"
    upload_path = os.path.join(upload_dir, upload_name)
    file.save(upload_path)

    selfie_encodings = _load_face_encodings(upload_path)
    if not selfie_encodings:
        return jsonify(error="No face found in the uploaded image."), 400
    selfie_encoding = selfie_encodings[0]

    folder = request.form.get("folder", "all").strip().lower()
    photo_dirs = []
    folder_map = {}
    legacy_dir = _event_photo_dir(photographer_id, event_id)
    if os.path.isdir(legacy_dir):
        photo_dirs.append(("default", legacy_dir, True))
    for folder_name in _list_event_folders(photographer_id, event_id):
        if folder_name == "default":
            continue
        folder_dir = _event_folder_dir(photographer_id, event_id, folder_name)
        if os.path.isdir(folder_dir):
            photo_dirs.append((folder_name, folder_dir, False))

    if folder and folder != "all":
        safe_folder = _safe_folder_name(folder)
        photo_dirs = [
            (name, path, legacy)
            for name, path, legacy in photo_dirs
            if name == safe_folder
        ]

    if not photo_dirs:
        return jsonify(error="No images found in this event."), 400

    best_match = None
    best_distance = None
    match_scores = []

    for folder_name, folder_path, is_legacy in photo_dirs:
        for filename in os.listdir(folder_path):
            if os.path.splitext(filename)[1].lower() not in ALLOWED_EXTENSIONS:
                continue
            db_path = os.path.join(folder_path, filename)
            db_encodings = _load_face_encodings(db_path)
            if not db_encodings:
                continue
            min_distance = None
            for db_encoding in db_encodings:
                distance = _face_distance(db_encoding, selfie_encoding)
                if min_distance is None or distance < min_distance:
                    min_distance = distance
            if min_distance is None:
                continue
            match_scores.append((folder_name, filename, min_distance, is_legacy))
            if best_distance is None or min_distance < best_distance:
                best_distance = min_distance
                best_match = (folder_name, filename, is_legacy)

    if best_match is None:
        return jsonify(error="No faces found in event images."), 400

    match_scores.sort(key=lambda item: item[2])
    confidence = 1.0 / (1.0 + best_distance)
    matches = [
        {
            "filename": name,
            "folder": folder_name,
            "confidence": round(1.0 / (1.0 + distance), 4),
            "url": (
                f"/events/{event_id}/photos/{name}?code={code}"
                if is_legacy
                else f"/events/{event_id}/folders/{folder_name}/photos/{name}?code={code}"
            ),
        }
        for folder_name, name, distance, is_legacy in match_scores
    ]
    match_token = _store_match_cache(event_id, code, matches)
    best_folder, best_name, best_is_legacy = best_match

    return jsonify(
        best_match=best_name,
        best_folder=best_folder,
        confidence=round(confidence, 4),
        match_image_url=(
            f"/events/{event_id}/photos/{best_name}?code={code}"
            if best_is_legacy
            else f"/events/{event_id}/folders/{best_folder}/photos/{best_name}?code={code}"
        ),
        uploaded_image_url=f"/events/{event_id}/uploads/{upload_name}",
        matches=matches,
        match_token=match_token,
    )


@app.route("/events/<event_id>/matches/<token>", methods=["GET"])
def get_match_cache(event_id, token):
    _cleanup_match_cache()
    entry = MATCH_CACHE.get(token)
    if not entry or entry["event_id"] != event_id:
        return jsonify(error="Match cache not found."), 404
    code = request.args.get("code", "")
    if entry["code"] != code:
        return jsonify(error="Invalid access code."), 403
    return jsonify(matches=entry["matches"])


@app.route("/events/<event_id>/download", methods=["POST"])
def download_selected(event_id):
    payload = request.get_json(silent=True) or {}
    code = payload.get("code", "")
    items = payload.get("items", [])
    event, photographer_id = _find_event(event_id)
    if not event:
        return jsonify(error="Event not found."), 404
    if event["code"] != code:
        return jsonify(error="Invalid access code."), 403
    if not items:
        return jsonify(error="No photos selected."), 400

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for item in items:
            filename = item.get("filename", "")
            folder = item.get("folder", "default")
            path = _resolve_event_photo_path(photographer_id, event_id, folder, filename)
            if not path:
                continue
            arcname = os.path.join(folder or "default", os.path.basename(filename))
            archive.write(path, arcname)

    buffer.seek(0)
    return send_file(
        buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"event-{event_id}-photos.zip",
    )


@app.route("/events/<event_id>/album/pdf", methods=["POST"])
def album_pdf(event_id):
    payload = request.get_json(silent=True) or {}
    code = payload.get("code", "")
    items = payload.get("items", [])
    event, photographer_id = _find_event(event_id)
    if not event:
        return jsonify(error="Event not found."), 404
    if event["code"] != code:
        return jsonify(error="Invalid access code."), 403
    if not items:
        return jsonify(error="No photos selected."), 400

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(False)
    page_width = 210
    page_height = 297
    margin_x = 5
    start_y = 10
    cols = 10
    rows = 10
    cell_w = (page_width - margin_x * 2) / cols
    cell_h = (page_height - start_y - margin_x) / rows
    thumb_size = min(14, cell_w - 4)

    def add_header():
        pdf.set_font("Helvetica", size=9)
        pdf.text(margin_x, 6, f"Event {event_id} | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    for idx, item in enumerate(items, start=1):
        if (idx - 1) % 100 == 0:
            pdf.add_page()
            add_header()

        pos = (idx - 1) % 100
        row = pos // cols
        col = pos % cols
        x = margin_x + col * cell_w
        y = start_y + row * cell_h

        folder = _safe_folder_name(item.get("folder", "default"))
        filename = os.path.basename(item.get("filename", ""))
        photo_path = _resolve_event_photo_path(photographer_id, event_id, folder, filename)

        if photo_path:
            try:
                with Image.open(photo_path) as image:
                    image.thumbnail((300, 300))
                    thumb_buffer = BytesIO()
                    image.convert("RGB").save(thumb_buffer, format="JPEG")
                    thumb_buffer.seek(0)
                    thumb_x = x + (cell_w - thumb_size) / 2
                    pdf.image(thumb_buffer, x=thumb_x, y=y, w=thumb_size, h=thumb_size)
            except OSError:
                pass

        pdf.set_font("Helvetica", size=6)
        label = f"{idx}. {folder}/{filename}"
        max_len = 18
        if len(label) > max_len:
            label = f"{label[:max_len - 3]}..."
        safe_label = label.encode("latin-1", errors="ignore").decode("latin-1")
        pdf.text(x + 1, y + thumb_size + 4, safe_label)

    pdf_output = pdf.output(dest="S")
    if isinstance(pdf_output, str):
        pdf_bytes = pdf_output.encode("latin1")
    else:
        pdf_bytes = bytes(pdf_output)
    buffer = BytesIO(pdf_bytes)
    buffer.seek(0)
    return send_file(
        buffer,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"event-{event_id}-album.pdf",
    )


if __name__ == "__main__":
    app.run(debug=True)
