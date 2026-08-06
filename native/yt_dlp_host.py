import json
import os
import re
import struct
import subprocess
import sys
import threading
import time
import shutil
import winreg
import ctypes
import ctypes.wintypes
import msvcrt
import tempfile
from contextlib import contextmanager
from datetime import datetime
from functools import wraps
from importlib.util import find_spec
from pathlib import Path
from urllib.parse import urlparse

HOST_VERSION = "1.1.0"
YTDLP_PIP_PACKAGE = "yt-dlp[default,curl-cffi]"
DEFAULT_DOWNLOAD_DIR = Path.home() / "Downloads" / "VDH Lite"
TEMP_DOWNLOAD_DIR_NAME = "_vdh_lite_temp"
LOG_DIR = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "VDH Lite"
LOG_FILE = LOG_DIR / "yt-dlp-host.log"
JOBS_FILE = LOG_DIR / "jobs.json"
JOBS_LOCK_FILE = LOG_DIR / "jobs.lock"
QUEUE_SETTINGS_FILE = LOG_DIR / "queue-settings.json"
PROGRESS_PREFIX = "[VDH-Lite] Progress|"
FINAL_PATH_PREFIX = "[VDH-Lite] FinalPath|"
FORMAT_PREFIX = "[VDH-Lite] Format|"
DURATION_PREFIX = "[VDH-Lite] Duration|"
PROGRESS_TEMPLATE = (
    "download:"
    "[VDH-Lite] Progress|"
    "%(progress.status|)s|"
    "%(progress.percent|)s|"
    "%(progress._percent_str|)s|"
    "%(progress.speed|)s|"
    "%(progress.eta|)s|"
    "%(progress.downloaded_bytes|)s|"
    "%(progress.total_bytes|)s|"
    "%(progress.total_bytes_estimate|)s|"
    "%(progress.fragment_index|)s|"
    "%(progress.fragment_count|)s"
)
STABLE_YTDLP_ARGS = [
    "--continue",
    "--retries",
    "30",
    "--retry-sleep",
    "2",
    "--socket-timeout",
    "30",
    "--merge-output-format",
    "mp4/mkv",
    "--windows-filenames",
    "--trim-filenames",
    "180",
]
DEFAULT_CONCURRENCY_LIMIT = 2
MAX_CONCURRENCY_LIMIT = 4
JOB_HISTORY_LIMIT = 40
JOB_AUTH_TTL_SECONDS = 15 * 60
JOB_LOCK_TIMEOUT_SECONDS = 15
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
PROCESS_START_TOLERANCE_SECONDS = 60
RUNNER_PROCESS_NAMES = {"python.exe", "pythonw.exe", "py.exe"}
ACTIVE_JOB_STATUSES = {"queued", "running", "stopping"}
TERMINAL_JOB_STATUSES = {"finished", "failed", "stopped", "unknown"}
_JOB_LOCK_STATE = threading.local()
_PROCESS_JOB_LOCK = threading.RLock()
ERROR_GUIDANCE = {
    "http-429": {
        "label": "Rate limited",
        "summary": "The site is slowing down or blocking repeated download requests.",
        "nextAction": "Wait a while, then retry. Avoid starting many downloads from the same site at once.",
        "retryable": True,
    },
    "auth-required": {
        "label": "Sign-in or cookies required",
        "summary": "The site rejected the request or needs a signed-in browser session.",
        "nextAction": "Open the page in the browser, confirm it plays, then retry. Cookie import will be added in an advanced settings pass.",
        "retryable": False,
    },
    "impersonation-required": {
        "label": "Browser impersonation required",
        "summary": "The site is behind a Cloudflare or browser-fingerprint challenge that plain yt-dlp requests cannot pass.",
        "nextAction": "Retry this job with browser impersonation. If VDH Lite reports impersonation support is missing, click Install missing first.",
        "retryable": True,
    },
    "geo-blocked": {
        "label": "Region blocked",
        "summary": "The media appears unavailable from this region or network.",
        "nextAction": "Try a supported source or a network where the media is available.",
        "retryable": False,
    },
    "not-found": {
        "label": "Media not found",
        "summary": "The media URL is unavailable, removed, private, or no longer valid.",
        "nextAction": "Refresh the page, play the media again, then choose the newly detected candidate.",
        "retryable": False,
    },
    "disk-full": {
        "label": "Disk is full",
        "summary": "Windows or yt-dlp could not write the file because storage is full.",
        "nextAction": "Free disk space or choose a different save folder, then retry.",
        "retryable": True,
    },
    "permission-denied": {
        "label": "Save folder blocked",
        "summary": "VDH Lite could not write to the selected folder.",
        "nextAction": "Choose a folder you can write to, then retry.",
        "retryable": True,
    },
    "binary-missing": {
        "label": "Tool missing",
        "summary": "A required local tool is missing or not visible on PATH.",
        "nextAction": "Use Install missing, then restart Chrome and test the native host again.",
        "retryable": True,
    },
    "ffmpeg": {
        "label": "FFmpeg problem",
        "summary": "The download reached a step that needs FFmpeg, but FFmpeg failed or is missing.",
        "nextAction": "Install or update FFmpeg, then retry the download.",
        "retryable": True,
    },
    "network-transient": {
        "label": "Network interrupted",
        "summary": "The connection timed out, reset, or failed temporarily.",
        "nextAction": "Retry after the connection stabilizes.",
        "retryable": True,
    },
    "stalled": {
        "label": "Download stalled",
        "summary": "The download stopped receiving data or fragments.",
        "nextAction": "Retry. If it repeats, refresh the page and pick a newly detected candidate.",
        "retryable": True,
    },
    "cancelled-by-user": {
        "label": "Cancelled",
        "summary": "The download was stopped before it completed.",
        "nextAction": "Retry if you still want this media.",
        "retryable": True,
    },
    "unknown": {
        "label": "Unknown failure",
        "summary": "VDH Lite could not classify this error yet.",
        "nextAction": "Copy diagnostics and include them in a support report.",
        "retryable": False,
    },
}


def log(message):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().isoformat(timespec="seconds")
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(f"[{stamp}] {message}\n")


def read_registry_path(root, subkey):
    try:
        with winreg.OpenKey(root, subkey) as key:
            value, _ = winreg.QueryValueEx(key, "Path")
            return value
    except Exception:
        return ""


def effective_env():
    env = os.environ.copy()
    machine_path = read_registry_path(
        winreg.HKEY_LOCAL_MACHINE,
        r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
    )
    user_path = read_registry_path(winreg.HKEY_CURRENT_USER, "Environment")
    combined = ";".join(part for part in [machine_path, user_path, env.get("PATH", "")] if part)
    env["PATH"] = os.path.expandvars(combined)
    return env


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    message_length = struct.unpack("<I", raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode("utf-8")
    return json.loads(message)


def send_message(payload):
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def sanitize_component(value, fallback):
    text = str(value or "").strip()
    text = re.sub(r"[\\/:*?\"<>|]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    return (text or fallback)[:120]


def resolve_download_dir(value):
    path = Path(os.path.expandvars(os.path.expanduser(str(value)))) if value else DEFAULT_DOWNLOAD_DIR
    path.mkdir(parents=True, exist_ok=True)
    return path


def resolve_temp_download_dir(download_dir):
    path = download_dir / TEMP_DOWNLOAD_DIR_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def expand_download_path(value):
    if not value:
        return DEFAULT_DOWNLOAD_DIR
    return Path(os.path.expandvars(os.path.expanduser(str(value))))


def initial_folder(value):
    path = expand_download_path(value)
    if path.is_file():
        return path.parent
    if path.exists():
        return path
    if path.parent.exists():
        return path.parent
    if DEFAULT_DOWNLOAD_DIR.parent.exists():
        return DEFAULT_DOWNLOAD_DIR.parent
    return Path.home()


def pick_folder(message):
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askdirectory(
            title="Choose VDH Lite download folder",
            initialdir=str(initial_folder(message.get("currentPath"))),
            mustexist=False,
        )
        root.destroy()

        if not selected:
            return {"ok": True, "cancelled": True}

        path = Path(selected)
        path.mkdir(parents=True, exist_ok=True)
        return {"ok": True, "path": str(path)}
    except Exception as error:
        log(f"Folder picker error: {error}")
        return {"ok": False, "error": str(error)}


def ytdlp_format_for_quality(quality):
    match = re.match(r"^(\d{3,4})P$", str(quality or "").strip(), re.IGNORECASE)
    if not match:
        return None
    height = int(match.group(1))
    return f"bv*[height<={height}]+ba/b[height<={height}]/best[height<={height}]/best"


def valid_format_selector(value):
    text = str(value or "").strip()
    if not text or len(text) > 220:
        return False
    return re.fullmatch(r"[0-9A-Za-z_.*+/\[\]()<>=!,:-]+", text) is not None


def ytdlp_format_selector(message):
    selector = str(message.get("formatSelector") or "").strip()
    if valid_format_selector(selector):
        return selector

    format_id = str(message.get("formatId") or "").strip()
    if valid_format_selector(format_id):
        return format_id

    return ytdlp_format_for_quality(message.get("quality"))


def stable_ytdlp_args(fragment_retries=None):
    args = list(STABLE_YTDLP_ARGS)
    if fragment_retries:
        args.extend(["--fragment-retries", str(fragment_retries)])
    return args


def module_available(name):
    return find_spec(name) is not None


def ytdlp_base_command():
    if module_available("yt_dlp"):
        return [sys.executable, "-m", "yt_dlp"]
    return ["yt-dlp"]


def ytdlp_command(*args):
    return [*ytdlp_base_command(), *args]


def ytdlp_command_version():
    env = effective_env()
    base_command = ytdlp_base_command()
    if base_command == ["yt-dlp"]:
        path = shutil.which("yt-dlp", path=env.get("PATH"))
        if not path:
            return {"installed": False, "path": None, "version": None}
        display_path = path
    else:
        spec = find_spec("yt_dlp")
        display_path = f"{sys.executable} -m yt_dlp"
        if spec and spec.origin:
            display_path = f"{display_path} ({spec.origin})"

    try:
        result = subprocess.run(
            [*base_command, "--version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=15,
            env=env,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        first_line = (result.stdout or "").splitlines()[0] if result.stdout else ""
    except Exception as error:
        first_line = str(error)
    return {"installed": True, "path": display_path, "version": first_line}


def parse_impersonation_targets(output):
    targets = []
    for line in str(output or "").splitlines():
        lowered = line.lower()
        if "curl_cffi" not in lowered or "unavailable" in lowered:
            continue
        cleaned = re.sub(r"\s+", " ", line.strip())
        if cleaned and not cleaned.startswith("["):
            targets.append(cleaned)
    return targets


def ytdlp_impersonation_status():
    ytdlp = ytdlp_command_version()
    if not ytdlp["installed"]:
        return {
            "available": False,
            "installed": False,
            "source": None,
            "targets": [],
            "error": "yt-dlp is not installed.",
        }

    if module_available("yt_dlp") and module_available("curl_cffi"):
        return {
            "available": True,
            "installed": True,
            "source": "curl_cffi",
            "targets": [],
            "error": None,
        }

    try:
        result = subprocess.run(
            ytdlp_command("--no-update", "--list-impersonate-targets"),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=20,
            env=effective_env(),
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception as error:
        return {
            "available": False,
            "installed": False,
            "source": "curl_cffi",
            "targets": [],
            "error": str(error),
        }

    output = result.stdout or ""
    targets = parse_impersonation_targets(output)
    return {
        "available": bool(targets),
        "installed": bool(targets),
        "source": "curl_cffi",
        "targets": targets[:12],
        "error": None if targets else "No available impersonation targets. Install yt-dlp with the curl-cffi extra.",
    }


def ytdlp_impersonation_available():
    if module_available("yt_dlp") and module_available("curl_cffi"):
        return True
    return ytdlp_impersonation_status()["available"]


def append_generic_impersonation_args(command):
    if ytdlp_impersonation_available():
        command.extend(["--impersonate", "chrome", "--extractor-args", "generic:impersonate"])


def should_use_impersonation(message):
    value = message.get("browserImpersonation")
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on", "chrome"}
    return False


def command_version(command):
    if command == "yt-dlp":
        return ytdlp_command_version()

    env = effective_env()
    path = shutil.which(command, path=env.get("PATH"))
    if not path:
        return {"installed": False, "path": None, "version": None}
    try:
        result = subprocess.run(
            [path, "-version" if command == "ffmpeg" else "--version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=15,
            env=env,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        first_line = (result.stdout or "").splitlines()[0] if result.stdout else ""
    except Exception as error:
        first_line = str(error)
    return {"installed": True, "path": path, "version": first_line}


def get_deps():
    return {
        "ok": True,
        "hostVersion": HOST_VERSION,
        "hostPath": str(Path(__file__).resolve()),
        "logDir": str(LOG_DIR),
        "defaultDownloadDir": str(DEFAULT_DOWNLOAD_DIR),
        "ytDlp": command_version("yt-dlp"),
        "impersonation": ytdlp_impersonation_status(),
        "ffmpeg": command_version("ffmpeg"),
        "winget": command_version("winget"),
    }


def as_int(value):
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def as_float(value):
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def compact_format(fmt):
    if not isinstance(fmt, dict):
        return None
    format_id = str(fmt.get("format_id") or fmt.get("id") or "").strip()
    if not format_id:
        return None
    return {
        "id": format_id[:80],
        "formatNote": str(fmt.get("format_note") or fmt.get("format") or "")[:120],
        "height": as_int(fmt.get("height")),
        "width": as_int(fmt.get("width")),
        "fps": as_float(fmt.get("fps")),
        "abr": as_float(fmt.get("abr")),
        "tbr": as_float(fmt.get("tbr")),
        "ext": str(fmt.get("ext") or "")[:16],
        "vcodec": str(fmt.get("vcodec") or "")[:80],
        "acodec": str(fmt.get("acodec") or "")[:80],
        "filesize": as_int(fmt.get("filesize")),
        "filesizeApprox": as_int(fmt.get("filesize_approx")),
        "protocol": str(fmt.get("protocol") or "")[:40],
    }


def format_has_video(fmt):
    return bool(fmt.get("height")) and str(fmt.get("vcodec") or "none").lower() != "none"


def format_has_audio(fmt):
    return str(fmt.get("acodec") or "none").lower() != "none"


def video_codec_rank(fmt):
    codec = str(fmt.get("vcodec") or "").lower().split(".", 1)[0]
    if codec in {"av01", "av1"}:
        return 3
    if codec in {"hev1", "hvc1", "hevc", "h265"}:
        return 2
    if codec in {"avc1", "avc", "h264"}:
        return 1
    return 0


def format_sort_key(fmt):
    is_video = format_has_video(fmt)
    return (
        1 if is_video else 0,
        fmt.get("tbr") or (fmt.get("abr") if not is_video else 0) or 0,
        video_codec_rank(fmt) if is_video else 0,
        fmt.get("height") or 0,
        fmt.get("width") or 0,
        fmt.get("fps") or 0,
    )


def format_label(fmt):
    parts = []
    if fmt.get("height"):
        parts.append(f"{fmt['height']}P")
    elif format_has_audio(fmt):
        parts.append("Audio")
    else:
        parts.append("Format")
    if fmt.get("ext"):
        parts.append(str(fmt["ext"]).upper())
    codec = str(fmt.get("vcodec") or "").lower().split(".", 1)[0]
    codec_labels = {
        "av01": "AV1",
        "av1": "AV1",
        "hev1": "HEVC",
        "hvc1": "HEVC",
        "hevc": "HEVC",
        "h265": "HEVC",
        "avc1": "AVC1",
        "avc": "AVC1",
        "h264": "AVC1",
    }
    if codec in codec_labels:
        parts.append(codec_labels[codec])
    bitrate = fmt.get("tbr") or (fmt.get("abr") if format_has_audio(fmt) else None)
    if bitrate:
        parts.append(f"{bitrate:g} kbps")
    if fmt.get("fps"):
        parts.append(f"{fmt['fps']:g}fps")
    if fmt.get("formatNote"):
        parts.append(str(fmt["formatNote"])[:40])
    return " | ".join(parts)


def normalize_format_choices(formats):
    choices = [{
        "id": "best",
        "label": "Best available",
        "quality": "Best",
        "kind": "best",
        "selector": "bv*+ba/b",
        "source": "yt-dlp",
    }]

    height_formats = {}
    audio_formats = []
    for fmt in formats:
        if not isinstance(fmt, dict):
            continue
        height = fmt.get("height")
        if height and format_has_video(fmt):
            current = height_formats.get(height)
            if current is None or format_sort_key(fmt) > format_sort_key(current):
                height_formats[height] = fmt
        if format_has_audio(fmt) and not format_has_video(fmt):
            audio_formats.append(fmt)

    for height in sorted(height_formats.keys(), reverse=True)[:8]:
        best_format = height_formats[height]
        choices.append({
            "id": f"height-{height}",
            "label": f"{format_label(best_format)} from yt-dlp formats",
            "quality": f"{height}P",
            "kind": "video",
            "height": height,
            "selector": f"bv*[height<={height}]+ba/b[height<={height}]/best[height<={height}]/best",
            "source": "yt-dlp",
        })

    if audio_formats:
        best_audio = sorted(audio_formats, key=lambda item: item.get("abr") or item.get("tbr") or 0, reverse=True)[0]
        choices.append({
            "id": "audio",
            "label": format_label(best_audio),
            "quality": "Audio",
            "kind": "audio",
            "formatId": best_audio.get("id"),
            "selector": "ba/bestaudio/best",
            "source": "yt-dlp",
        })

    return choices


def compact_subtitles(info):
    subtitles = info.get("subtitles")
    if not isinstance(subtitles, dict):
        return []
    result = []
    for language, entries in subtitles.items():
        if not isinstance(entries, list):
            continue
        exts = sorted({str(entry.get("ext") or "") for entry in entries if isinstance(entry, dict) and entry.get("ext")})
        result.append({"language": str(language)[:32], "exts": exts[:8]})
    return result[:20]


def compact_media_entry(info, fallback_url=None):
    if not isinstance(info, dict):
        return None
    compact_formats = []
    for fmt in info.get("formats") or []:
        compact = compact_format(fmt)
        if compact:
            compact_formats.append(compact)

    compact_formats = sorted(
        compact_formats,
        key=format_sort_key,
        reverse=True,
    )[:80]

    webpage_url = info.get("webpage_url") or info.get("original_url") or fallback_url
    return {
        "title": sanitize_component(info.get("title"), "media"),
        "url": webpage_url,
        "webpageUrl": webpage_url,
        "playlistPosition": as_int(info.get("playlist_index")) or -1,
        "duration": as_float(info.get("duration")),
        "uploader": sanitize_component(info.get("uploader") or info.get("channel"), ""),
        "thumbnail": info.get("thumbnail"),
        "formats": compact_formats,
        "formatChoices": normalize_format_choices(compact_formats),
        "subtitles": compact_subtitles(info),
    }


def compact_discovery_response(info, fallback_url=None):
    entries = info.get("entries") if isinstance(info, dict) else None
    if isinstance(entries, list) and entries:
        media = [compact_media_entry(entry, fallback_url) for entry in entries[:10]]
        media = [entry for entry in media if entry]
    else:
        media = [compact_media_entry(info, fallback_url)]
        media = [entry for entry in media if entry]

    first = media[0] if media else {}
    return {
        "ok": True,
        "title": sanitize_component(info.get("title") if isinstance(info, dict) else None, first.get("title") or "media"),
        "webpageUrl": (info.get("webpage_url") or info.get("original_url") or fallback_url) if isinstance(info, dict) else fallback_url,
        "duration": as_float(info.get("duration")) if isinstance(info, dict) else None,
        "thumbnail": (info.get("thumbnail") or first.get("thumbnail")) if isinstance(info, dict) else first.get("thumbnail"),
        "uploader": sanitize_component(info.get("uploader") or info.get("channel"), "") if isinstance(info, dict) else "",
        "media": media,
    }


def classify_error(message, exit_code=None):
    text = str(message or "").strip()
    lowered = text.lower()

    category = "unknown"
    if not text and exit_code not in (None, 0):
        text = f"yt-dlp exited with code {exit_code}"
        lowered = text.lower()

    if "429" in lowered or "too many requests" in lowered or "rate limit" in lowered:
        category = "http-429"
    elif (
        "not available in your country" in lowered
        or "geo-restricted" in lowered
        or "geo restricted" in lowered
        or "blocked in your country" in lowered
        or "not available from your location" in lowered
    ):
        category = "geo-blocked"
    elif (
        "cloudflare anti-bot challenge" in lowered
        or "impersonation dependency" in lowered
        or "no impersonate target" in lowered
        or "impersonate target is available" in lowered
        or "generic:impersonate" in lowered
    ):
        category = "impersonation-required"
    elif (
        "login required" in lowered
        or "sign in" in lowered
        or "authentication" in lowered
        or "unauthorized" in lowered
        or "http error 401" in lowered
        or "http error 403" in lowered
        or "forbidden" in lowered
        or "private video" in lowered
        or "cookies" in lowered
    ):
        category = "auth-required"
    elif "ffmpeg" in lowered or "ffprobe" in lowered or "[merger]" in lowered:
        category = "ffmpeg"
    elif (
        "yt-dlp" in lowered and ("not recognized" in lowered or "no such file" in lowered)
        or "filenotfounderror" in lowered
    ):
        category = "binary-missing"
    elif (
        "http error 404" in lowered
        or "not found" in lowered
        or "video unavailable" in lowered
        or "this video is unavailable" in lowered
        or "has been removed" in lowered
    ):
        category = "not-found"
    elif "no space left" in lowered or "disk full" in lowered or "errno 28" in lowered:
        category = "disk-full"
    elif (
        "permission denied" in lowered
        or "access is denied" in lowered
        or "errno 13" in lowered
        or "winerror 5" in lowered
    ):
        category = "permission-denied"
    elif (
        "timed out" in lowered
        or "timeout" in lowered
        or "connection reset" in lowered
        or "connection aborted" in lowered
        or "network unreachable" in lowered
        or "temporary failure" in lowered
        or "remote end closed" in lowered
        or "http error 502" in lowered
        or "http error 503" in lowered
        or "http error 504" in lowered
    ):
        category = "network-transient"
    elif (
        "stalled" in lowered
        or "did not get any data block" in lowered
        or "fragment downloads failed" in lowered
        or "process disappeared" in lowered
        or "without exit status" in lowered
    ):
        category = "stalled"
    elif "cancelled" in lowered or "canceled" in lowered or "interrupted by user" in lowered:
        category = "cancelled-by-user"

    guidance = ERROR_GUIDANCE[category]
    return {
        "category": category,
        "label": guidance["label"],
        "summary": guidance["summary"],
        "nextAction": guidance["nextAction"],
        "retryable": guidance["retryable"],
        "raw": text or None,
    }


def job_host(job):
    host = sanitize_component(job.get("host"), "")
    if host:
        return host
    try:
        return urlparse(str(job.get("url") or "")).hostname or ""
    except Exception:
        return ""


def safe_basename(path_value):
    if not path_value:
        return None
    text = str(path_value)
    normalized = text.replace("\\", "/").rstrip("/")
    name = normalized.rsplit("/", 1)[-1]
    return sanitize_component(name, "download")


def sanitize_job_for_diagnostics(job):
    error = classify_error(job.get("lastError"), job.get("exitCode"))
    request_headers = (job.get("request") or {}).get("requestHeaders") or {}
    request_header_names = sorted(str(name).lower() for name in request_headers.keys())
    request_has_cookie = bool(load_job_auth(job).get("cookie"))
    if request_has_cookie and "cookie" not in request_header_names:
        request_header_names.append("cookie")
        request_header_names.sort()
    return {
        "id": job.get("id"),
        "status": job.get("status"),
        "phase": job.get("phase"),
        "title": sanitize_component(job.get("title"), "video"),
        "siteHost": job_host(job),
        "quality": job.get("quality"),
        "percent": job.get("percent"),
        "elapsedText": job.get("elapsedText"),
        "finalFilename": safe_basename(job.get("finalPath")),
        "exitCode": job.get("exitCode"),
        "errorCategory": error["category"],
        "errorLabel": error["label"],
        "errorSummary": error["summary"],
        "nextAction": error["nextAction"],
        "retryable": error["retryable"],
        "lastError": error["raw"],
        "requestHasCookie": request_has_cookie,
        "requestHeaderNames": request_header_names,
    }


def public_job(job):
    return {key: value for key, value in job.items() if key not in {"request", "authPath"}}


def visible_jobs(jobs):
    """Hide an auto-retried failure while its replacement is in history."""
    job_ids = {job.get("id") for job in jobs}
    return [
        job
        for job in jobs
        if not job.get("autoRetryJobId") or job.get("autoRetryJobId") not in job_ids
    ]


def projected_status_jobs(jobs, history_limit=8):
    displayed = visible_jobs(jobs)
    active = [job for job in displayed if is_active_job(job)]
    inactive = [job for job in displayed if not is_active_job(job)]
    inactive_capacity = max(0, history_limit - len(active))
    selected_inactive_ids = {
        id(job) for job in (inactive[-inactive_capacity:] if inactive_capacity else [])
    }
    projected = [
        job
        for job in displayed
        if is_active_job(job) or id(job) in selected_inactive_ids
    ]
    return list(reversed(projected))


def get_diagnostics(message=None):
    message = message or {}
    get_status()
    jobs = list(reversed(read_jobs()))
    job_id = message.get("jobId")
    if job_id:
        jobs = [job for job in jobs if job.get("id") == job_id]
    else:
        jobs = list(reversed(visible_jobs(list(reversed(jobs)))))
    return {
        "ok": True,
        "nativeConnected": True,
        "hostVersion": HOST_VERSION,
        "hostPath": str(Path(__file__).resolve()),
        "logDir": str(LOG_DIR),
        "defaultDownloadDir": str(DEFAULT_DOWNLOAD_DIR),
        "deps": get_deps(),
        "jobs": [sanitize_job_for_diagnostics(job) for job in jobs[:5]],
    }


def run_install_command(command):
    log(f"Installing dependency: {' '.join(command)}")
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=600,
        env=effective_env(),
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    return {
        "command": command,
        "returnCode": result.returncode,
        "output": (result.stdout or "")[-4000:],
    }


def install_deps():
    before = get_deps()
    results = []

    if not before["ytDlp"]["installed"] or not before.get("impersonation", {}).get("available"):
        results.append(run_install_command([sys.executable, "-m", "pip", "install", "--user", "-U", YTDLP_PIP_PACKAGE]))

    after_ytdlp = get_deps()
    if not after_ytdlp["ffmpeg"]["installed"]:
        if after_ytdlp["winget"]["installed"]:
            results.append(run_install_command([
                "winget",
                "install",
                "--id",
                "Gyan.FFmpeg",
                "--accept-source-agreements",
                "--accept-package-agreements",
                "--silent",
            ]))
        else:
            results.append({
                "command": ["winget", "install", "Gyan.FFmpeg"],
                "returnCode": 1,
                "output": "winget is not installed; install FFmpeg manually.",
            })

    return {"ok": True, "results": results, "deps": get_deps()}


@contextmanager
def job_store_lock(timeout=JOB_LOCK_TIMEOUT_SECONDS):
    with _PROCESS_JOB_LOCK:
        depth = getattr(_JOB_LOCK_STATE, "depth", 0)
        if depth:
            _JOB_LOCK_STATE.depth = depth + 1
            try:
                yield
            finally:
                _JOB_LOCK_STATE.depth -= 1
            return

        LOG_DIR.mkdir(parents=True, exist_ok=True)
        lock_handle = JOBS_LOCK_FILE.open("a+b")
        try:
            lock_handle.seek(0, os.SEEK_END)
            if lock_handle.tell() == 0:
                lock_handle.write(b"\0")
                lock_handle.flush()

            deadline = time.monotonic() + timeout
            while True:
                try:
                    lock_handle.seek(0)
                    msvcrt.locking(lock_handle.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise TimeoutError("Timed out waiting for the VDH Lite job store lock.")
                    time.sleep(0.05)

            _JOB_LOCK_STATE.depth = 1
            try:
                yield
            finally:
                _JOB_LOCK_STATE.depth = 0
                lock_handle.seek(0)
                msvcrt.locking(lock_handle.fileno(), msvcrt.LK_UNLCK, 1)
        finally:
            lock_handle.close()


def job_store_transaction(function):
    @wraps(function)
    def locked_function(*args, **kwargs):
        with job_store_lock():
            return function(*args, **kwargs)
    return locked_function


def atomic_write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temp_path = Path(handle.name)
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink()
            except Exception:
                pass


def _read_jobs_unlocked():
    try:
        payload = json.loads(JOBS_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Job store is not valid JSON: {error}") from error
    if not isinstance(payload, list):
        raise RuntimeError("Job store must contain a JSON array.")
    return payload


def read_jobs():
    with job_store_lock():
        return _read_jobs_unlocked()


def now_iso():
    return datetime.now().isoformat(timespec="seconds")


def clamp_concurrency_limit(value=None):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = DEFAULT_CONCURRENCY_LIMIT
    return max(1, min(MAX_CONCURRENCY_LIMIT, parsed))


def is_active_job(job):
    return job.get("status") in ACTIVE_JOB_STATUSES


def cleanup_job_history(jobs):
    if len(jobs) <= JOB_HISTORY_LIMIT:
        return list(jobs)
    active_count = sum(1 for job in jobs if is_active_job(job))
    keep_inactive = max(0, JOB_HISTORY_LIMIT - active_count)
    inactive_ids = [job.get("id") for job in jobs if not is_active_job(job)]
    kept_inactive_ids = set(inactive_ids[-keep_inactive:]) if keep_inactive else set()
    return [
        job
        for job in jobs
        if is_active_job(job) or job.get("id") in kept_inactive_ids
    ]


def write_jobs(jobs):
    with job_store_lock():
        kept_jobs = cleanup_job_history(jobs)
        kept_object_ids = {id(job) for job in kept_jobs}
        for job in jobs:
            if id(job) not in kept_object_ids:
                remove_job_artifacts(job)
        atomic_write_json(JOBS_FILE, kept_jobs)


def read_queue_settings():
    with job_store_lock():
        try:
            payload = json.loads(QUEUE_SETTINGS_FILE.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {"concurrencyLimit": DEFAULT_CONCURRENCY_LIMIT}
        except (json.JSONDecodeError, TypeError):
            return {"concurrencyLimit": DEFAULT_CONCURRENCY_LIMIT}
        return {"concurrencyLimit": clamp_concurrency_limit(payload.get("concurrencyLimit"))}


def persist_concurrency_limit(value):
    with job_store_lock():
        limit = clamp_concurrency_limit(value)
        atomic_write_json(QUEUE_SETTINGS_FILE, {"concurrencyLimit": limit})
        return limit


def concurrency_limit_for_message(message=None):
    message = message or {}
    if message.get("concurrencyLimit") is not None:
        return persist_concurrency_limit(message.get("concurrencyLimit"))
    return read_queue_settings()["concurrencyLimit"]


def update_job(job_id, updates):
    with job_store_lock():
        jobs = read_jobs()
        for job in jobs:
            if job.get("id") == job_id:
                job.update(updates)
                break
        write_jobs(jobs)


def parse_iso_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except Exception:
        return None


def filetime_to_datetime(filetime):
    ticks = (int(filetime.dwHighDateTime) << 32) + int(filetime.dwLowDateTime)
    if not ticks:
        return None
    try:
        return datetime.fromtimestamp(ticks / 10_000_000 - 11_644_473_600)
    except Exception:
        return None


def windows_process_info(pid):
    if not pid:
        return {"exists": False}
    try:
        pid = int(pid)
    except (TypeError, ValueError):
        return {"exists": False}

    if os.name != "nt":
        return {"exists": True}

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.OpenProcess.argtypes = [ctypes.wintypes.DWORD, ctypes.wintypes.BOOL, ctypes.wintypes.DWORD]
    kernel32.OpenProcess.restype = ctypes.wintypes.HANDLE
    kernel32.CloseHandle.argtypes = [ctypes.wintypes.HANDLE]
    kernel32.CloseHandle.restype = ctypes.wintypes.BOOL
    kernel32.GetProcessTimes.argtypes = [
        ctypes.wintypes.HANDLE,
        ctypes.POINTER(ctypes.wintypes.FILETIME),
        ctypes.POINTER(ctypes.wintypes.FILETIME),
        ctypes.POINTER(ctypes.wintypes.FILETIME),
        ctypes.POINTER(ctypes.wintypes.FILETIME),
    ]
    kernel32.GetProcessTimes.restype = ctypes.wintypes.BOOL
    kernel32.QueryFullProcessImageNameW.argtypes = [
        ctypes.wintypes.HANDLE,
        ctypes.wintypes.DWORD,
        ctypes.wintypes.LPWSTR,
        ctypes.POINTER(ctypes.wintypes.DWORD),
    ]
    kernel32.QueryFullProcessImageNameW.restype = ctypes.wintypes.BOOL

    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        return tasklist_process_info(pid)

    try:
        created = ctypes.wintypes.FILETIME()
        exited = ctypes.wintypes.FILETIME()
        kernel = ctypes.wintypes.FILETIME()
        user = ctypes.wintypes.FILETIME()
        created_at = None
        if kernel32.GetProcessTimes(handle, ctypes.byref(created), ctypes.byref(exited), ctypes.byref(kernel), ctypes.byref(user)):
            created_at = filetime_to_datetime(created)

        size = ctypes.wintypes.DWORD(32768)
        image_buffer = ctypes.create_unicode_buffer(size.value)
        image_path = None
        if kernel32.QueryFullProcessImageNameW(handle, 0, image_buffer, ctypes.byref(size)):
            image_path = image_buffer.value

        return {
            "exists": True,
            "pid": pid,
            "imagePath": image_path,
            "name": Path(image_path).name if image_path else None,
            "createdAt": created_at,
        }
    finally:
        kernel32.CloseHandle(handle)


def tasklist_process_info(pid):
    if not pid:
        return {"exists": False}
    result = subprocess.run(
        ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    output = result.stdout or ""
    if str(pid) not in output:
        return {"exists": False}
    first_line = output.splitlines()[0].strip()
    name = None
    if first_line.startswith('"'):
        parts = [part.strip('"') for part in first_line.split('","')]
        name = parts[0].strip('"') if parts else None
    else:
        name = first_line.split()[0] if first_line else None
    return {
        "exists": True,
        "pid": pid,
        "imagePath": name,
        "name": name,
        "createdAt": None,
    }


def process_info(pid):
    try:
        return windows_process_info(pid)
    except Exception:
        return tasklist_process_info(pid)


def normalized_path(value):
    if not value:
        return None
    return os.path.normcase(os.path.abspath(str(value)))


def sync_job_exit_code(job):
    if job.get("exitCode") is not None:
        return True
    exit_path_value = job.get("exitPath")
    if not exit_path_value:
        return False
    try:
        exit_path = Path(exit_path_value)
        if not exit_path.exists():
            return False
        text = exit_path.read_text(encoding="utf-8").strip()
        if not text:
            return False
        job["exitCode"] = int(text)
        return True
    except Exception:
        return False


def process_matches_job(job, info):
    image_path = info.get("imagePath") or info.get("name")
    expected_executable = job.get("runnerExecutable")
    if expected_executable and image_path:
        if os.path.isabs(str(image_path)):
            if normalized_path(image_path) != normalized_path(expected_executable):
                return False
        elif Path(image_path).name.lower() != Path(expected_executable).name.lower():
            return False
    elif image_path:
        image_name = Path(image_path).name.lower()
        if image_name not in RUNNER_PROCESS_NAMES:
            return False

    created_at = info.get("createdAt")
    expected_created_at = parse_iso_datetime(job.get("runnerCreatedAt")) or parse_iso_datetime(job.get("startedAt"))
    if created_at and expected_created_at:
        delta = abs((created_at - expected_created_at).total_seconds())
        if delta > PROCESS_START_TOLERANCE_SECONDS:
            return False

    return True


def is_process_running(pid, job=None):
    if job and sync_job_exit_code(job):
        return False
    info = process_info(pid)
    if not info.get("exists"):
        return False
    if job and not process_matches_job(job, info):
        return False
    return True


def terminate_process(pid, job=None):
    if not pid:
        return False
    if job and not is_process_running(pid, job):
        return True
    result = subprocess.run(
        ["taskkill", "/PID", str(pid), "/T", "/F"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    return result.returncode == 0 or not is_process_running(pid, job)


def elapsed_text(started_at, finished_at=None):
    try:
        start = datetime.fromisoformat(started_at)
        end = datetime.fromisoformat(finished_at) if finished_at else datetime.now()
        seconds = max(0, int((end - start).total_seconds()))
    except Exception:
        return None
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def parse_number(value):
    text = str(value or "").strip()
    if not text or text.lower() in {"none", "na", "null", "unknown"}:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", text.replace(",", ""))
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def parse_int(value):
    number = parse_number(value)
    if number is None:
        return None
    return int(number)


def parse_percent(value):
    number = parse_number(value)
    if number is None:
        return None
    return max(0, min(100, round(number, 1)))


def seconds_text(value):
    seconds = parse_int(value)
    if seconds is None:
        return None
    minutes, seconds = divmod(max(0, seconds), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def speed_text(speed_bytes):
    if speed_bytes is None or speed_bytes <= 0:
        return None
    return f"{speed_bytes / (1024 ** 2):.2f} MB/s"


def clean_template_value(value):
    text = str(value or "").strip()
    if not text or text.lower() in {"none", "na", "null"}:
        return None
    return text


def phase_from_status(status):
    normalized = str(status or "").strip().lower()
    if normalized in {"downloading"}:
        return "downloading"
    if normalized in {"finished"}:
        return "finalizing"
    if normalized in {"error"}:
        return "failed"
    return None


def phase_from_output_line(line):
    lowered = line.lower()
    if line.startswith(FINAL_PATH_PREFIX):
        return "finalizing"
    if "merging formats" in lowered or "[merger]" in lowered:
        return "merging"
    if "remux" in lowered or "[videoremuxer]" in lowered:
        return "remuxing"
    if "re-encoding" in lowered or "reencoding" in lowered or "[videoconvertor]" in lowered:
        return "reencoding"
    if "[extractaudio]" in lowered or "destination:" in lowered and "audio" in lowered:
        return "reencoding"
    if "[movefiles]" in lowered or "deleting original file" in lowered:
        return "finalizing"
    if "[metadata]" in lowered or "[embedthumbnail]" in lowered or "[ffmpeg]" in lowered:
        return "finalizing"
    if line.startswith("[download] Destination:"):
        return "initializing"
    if line.startswith("[download]"):
        return "downloading"
    return None


def parse_structured_progress(line):
    if not line.startswith(PROGRESS_PREFIX):
        return None

    fields = line[len(PROGRESS_PREFIX):].split("|")
    fields.extend([""] * (10 - len(fields)))
    (
        raw_status,
        raw_percent,
        raw_percent_text,
        raw_speed,
        raw_eta,
        raw_downloaded,
        raw_total,
        raw_total_estimate,
        raw_fragment_index,
        raw_fragment_count,
    ) = fields[:10]

    status = clean_template_value(raw_status)
    percent = parse_percent(raw_percent)
    if percent is None:
        percent = parse_percent(raw_percent_text)
    if status == "finished" and percent is None:
        percent = 100

    speed_bytes = parse_number(raw_speed)
    eta_seconds = parse_int(raw_eta)

    return {
        "progressStatus": status,
        "phase": phase_from_status(status),
        "percent": percent,
        "speedBytes": speed_bytes,
        "speedText": speed_text(speed_bytes),
        "etaSeconds": eta_seconds,
        "etaText": seconds_text(eta_seconds),
        "downloadedBytes": parse_int(raw_downloaded),
        "totalBytes": parse_int(raw_total),
        "totalBytesEstimate": parse_int(raw_total_estimate),
        "currentFragment": parse_int(raw_fragment_index),
        "totalFragments": parse_int(raw_fragment_count),
    }


def parse_progress(job):
    progress_info = {
        "currentFragment": None,
        "totalFragments": None,
        "percent": None,
        "speedText": None,
        "speedBytes": None,
        "etaText": None,
        "etaSeconds": None,
        "phase": job.get("phase"),
        "progressStatus": None,
        "downloadedBytes": None,
        "totalBytes": None,
        "totalBytesEstimate": None,
        "finalPath": job.get("finalPath"),
        "formatId": job.get("formatId"),
        "duration": job.get("duration"),
    }
    progress_path_value = job.get("progressPath")
    download_dir_value = job.get("downloadDir")
    progress_path = Path(progress_path_value) if progress_path_value else None
    download_dir = Path(download_dir_value) if download_dir_value else None

    sync_job_exit_code(job)

    if progress_path and progress_path.exists():
        try:
            lines = progress_path.read_text(encoding="utf-8", errors="replace").splitlines()
            for line in lines[-200:]:
                structured = parse_structured_progress(line)
                if structured:
                    for key, value in structured.items():
                        if value is not None:
                            progress_info[key] = value
                    continue

                if line.startswith(FINAL_PATH_PREFIX):
                    progress_info["finalPath"] = clean_template_value(line[len(FINAL_PATH_PREFIX):])
                    progress_info["phase"] = "finalizing"
                    continue

                if line.startswith(FORMAT_PREFIX):
                    progress_info["formatId"] = clean_template_value(line[len(FORMAT_PREFIX):])
                    continue

                if line.startswith(DURATION_PREFIX):
                    duration = parse_number(line[len(DURATION_PREFIX):])
                    if duration and duration > 0:
                        progress_info["duration"] = duration
                    continue

                phase = phase_from_output_line(line)
                if phase:
                    progress_info["phase"] = phase

                match = re.search(r"Total fragments:\s*(\d+)", line)
                if match:
                    progress_info["totalFragments"] = int(match.group(1))
                match = re.search(r"\(frag\s+(\d+)/(\d+)\)", line)
                if match:
                    progress_info["currentFragment"] = int(match.group(1))
                    progress_info["totalFragments"] = int(match.group(2))
                match = re.search(r"\[download\].*?at\s+([0-9.]+)([KMG]i?B)/s", line)
                if match:
                    value = float(match.group(1))
                    unit = match.group(2)
                    multiplier = {
                        "KiB": 1024,
                        "MiB": 1024 ** 2,
                        "GiB": 1024 ** 3,
                        "KB": 1000,
                        "MB": 1000 ** 2,
                        "GB": 1000 ** 3,
                    }.get(unit, 1)
                    progress_info["speedBytes"] = value * multiplier
                    progress_info["speedText"] = speed_text(progress_info["speedBytes"])
                if "ERROR:" in line:
                    job["lastError"] = line.strip()
                eta_match = re.search(r"\bETA\s+([0-9:]+|Unknown)", line)
                if eta_match:
                    progress_info["etaText"] = eta_match.group(1)
                match = re.search(r"\[download\]\s+([0-9.]+)%.*?at\s+([0-9.]+)([KMG]i?B)/s(?:\s+ETA\s+([0-9:]+|Unknown))?", line)
                if match:
                    progress_info["percent"] = parse_percent(match.group(1))
                    value = float(match.group(2))
                    unit = match.group(3)
                    progress_info["etaText"] = match.group(4) or progress_info["etaText"]
                    multiplier = {
                        "KiB": 1024,
                        "MiB": 1024 ** 2,
                        "GiB": 1024 ** 3,
                        "KB": 1000,
                        "MB": 1000 ** 2,
                        "GB": 1000 ** 3,
                    }.get(unit, 1)
                    progress_info["speedBytes"] = value * multiplier
                    progress_info["speedText"] = speed_text(progress_info["speedBytes"])
        except Exception:
            pass

    try:
        ytdl_files = sorted(download_dir.glob("*.ytdl"), key=lambda path: path.stat().st_mtime, reverse=True) if download_dir else []
        if ytdl_files:
            state = json.loads(ytdl_files[0].read_text(encoding="utf-8"))
            index = state.get("downloader", {}).get("current_fragment", {}).get("index")
            if isinstance(index, int):
                progress_info["currentFragment"] = index
    except Exception:
        pass

    if progress_info["percent"] is None and progress_info["currentFragment"] is not None and progress_info["totalFragments"]:
        progress_info["percent"] = max(
            0,
            min(100, round(progress_info["currentFragment"] * 100 / progress_info["totalFragments"], 1)),
        )

    return progress_info


@job_store_transaction
def get_status(message=None):
    cleanup_expired_auth_files()
    cleanup_stale_runner_specs()
    jobs = read_jobs()
    changed = False
    for persisted_job in jobs:
        if migrate_persisted_job_cookie(persisted_job):
            changed = True
    for job in jobs:
        if job.get("status") == "queued":
            job["running"] = False
            job["phase"] = "queued"
            job["elapsedText"] = elapsed_text(job.get("queuedAt") or job.get("createdAt"))
            continue

        persisted_before = {
            key: job.get(key)
            for key in [
                "status",
                "phase",
                "running",
                "exitCode",
                "finalPath",
                "formatId",
                "duration",
                "lastError",
                "errorCategory",
                "errorLabel",
                "errorSummary",
                "nextAction",
                "retryable",
            ]
        }
        progress = parse_progress(job)
        running = is_process_running(job.get("pid"), job)
        job["running"] = running
        job["currentFragment"] = progress["currentFragment"]
        job["totalFragments"] = progress["totalFragments"]
        job["percent"] = progress["percent"]
        job["speedText"] = progress["speedText"]
        job["speedBytes"] = progress["speedBytes"]
        job["etaText"] = progress["etaText"] if running else None
        job["etaSeconds"] = progress["etaSeconds"] if running else None
        job["downloadedBytes"] = progress["downloadedBytes"]
        job["totalBytes"] = progress["totalBytes"]
        job["totalBytesEstimate"] = progress["totalBytesEstimate"]
        job["phase"] = progress["phase"] or ("initializing" if running else job.get("phase"))
        job["progressStatus"] = progress["progressStatus"]
        if progress["finalPath"]:
            job["finalPath"] = progress["finalPath"]
        if progress["formatId"]:
            job["formatId"] = progress["formatId"]
        if progress["duration"]:
            job["duration"] = progress["duration"]
        job["elapsedText"] = elapsed_text(job.get("startedAt"), job.get("finishedAt"))
        if not running and job.get("status") == "stopping":
            job["status"] = "stopped"
            job["phase"] = "stopped"
            job["lastError"] = job.get("lastError") or "Cancelled by user."
            job["finishedAt"] = job.get("finishedAt") or now_iso()
            job["elapsedText"] = elapsed_text(job.get("startedAt"), job.get("finishedAt"))
            changed = True
        elif not running and job.get("status") == "running":
            exit_code = job.get("exitCode")
            if exit_code is None:
                job["status"] = "failed"
                job["phase"] = "failed"
                job["lastError"] = job.get("lastError") or "Download process disappeared without exit status."
            elif exit_code == 0:
                job["status"] = "finished"
                job["percent"] = job["percent"] if job["percent"] is not None else 100
                job["phase"] = "finished"
                remove_job_auth(job)
            else:
                job["status"] = "failed"
                job["phase"] = "failed"
            job["finishedAt"] = datetime.now().isoformat(timespec="seconds")
            job["elapsedText"] = elapsed_text(job.get("startedAt"), job.get("finishedAt"))
            changed = True
        elif job.get("status") == "finished":
            job["phase"] = "finished"
            job["percent"] = job["percent"] if job["percent"] is not None else 100
            remove_job_auth(job)
        elif job.get("status") == "failed":
            job["phase"] = "failed"
        elif job.get("status") == "stopped":
            job["phase"] = "stopped"

        if job.get("lastError") or job.get("status") in {"failed", "stopped", "unknown"}:
            error = classify_error(job.get("lastError"), job.get("exitCode"))
            job["errorCategory"] = error["category"]
            job["errorLabel"] = error["label"]
            job["errorSummary"] = error["summary"]
            job["nextAction"] = error["nextAction"]
            job["retryable"] = error["retryable"]
            if maybe_enqueue_impersonation_retry(jobs, job, error):
                changed = True

        if any(job.get(key) != value for key, value in persisted_before.items()):
            changed = True
    concurrency_limit = concurrency_limit_for_message(message)
    if schedule_jobs(jobs, concurrency_limit):
        changed = True
    if changed:
        write_jobs(jobs)
    return {"ok": True, "jobs": [public_job(job) for job in projected_status_jobs(jobs)]}


@job_store_transaction
def clear_jobs():
    get_status()
    jobs = read_jobs()
    keep = []
    for job in jobs:
        if is_active_job(job):
            keep.append(job)
        else:
            remove_job_artifacts(job)
    write_jobs(keep)
    return {"ok": True, "cleared": len(jobs) - len(keep)}


@job_store_transaction
def clear_completed_jobs():
    get_status()
    jobs = read_jobs()
    keep = []
    for job in jobs:
        if job.get("status") in TERMINAL_JOB_STATUSES:
            remove_job_artifacts(job)
        else:
            keep.append(job)
    write_jobs(keep)
    return {"ok": True, "cleared": len(jobs) - len(keep)}


def forwarded_headers(message):
    headers = message.get("requestHeaders")
    if not isinstance(headers, dict):
        return {}

    allowed = {
        "referer": "Referer",
        "origin": "Origin",
        "accept": "Accept",
        "accept-language": "Accept-Language",
        "cookie": "Cookie",
        "priority": "Priority",
        "sec-ch-ua": "Sec-CH-UA",
        "sec-ch-ua-mobile": "Sec-CH-UA-Mobile",
        "sec-ch-ua-platform": "Sec-CH-UA-Platform",
        "sec-fetch-dest": "Sec-Fetch-Dest",
        "sec-fetch-mode": "Sec-Fetch-Mode",
        "sec-fetch-site": "Sec-Fetch-Site",
    }
    forwarded = {}
    for raw_name, raw_value in headers.items():
        name = str(raw_name or "").lower()
        value = str(raw_value or "").strip()
        if name in allowed and value:
            forwarded[allowed[name]] = value
    return forwarded


def request_headers_without_cookie(message):
    headers = message.get("requestHeaders")
    if not isinstance(headers, dict):
        return headers
    return {
        name: value
        for name, value in headers.items()
        if str(name).strip().lower() != "cookie"
    }


def persist_job_auth(job_id, message):
    headers = message.get("requestHeaders")
    if not isinstance(headers, dict):
        return None
    cookie = next(
        (value for name, value in headers.items() if str(name).strip().lower() == "cookie" and value),
        None,
    )
    if not cookie:
        return None
    auth_path = LOG_DIR / f"auth-{sanitize_component(job_id, 'job')}.json"
    atomic_write_json(auth_path, {
        "cookie": str(cookie),
        "expiresAt": time.time() + JOB_AUTH_TTL_SECONDS,
    })
    return str(auth_path)


def load_job_auth(job):
    value = job.get("authPath")
    if not value:
        return {}
    path = Path(value)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if float(payload.get("expiresAt") or 0) <= time.time():
            path.unlink(missing_ok=True)
            return {}
        cookie = payload.get("cookie")
        return {"cookie": str(cookie)} if cookie else {}
    except Exception:
        return {}


def request_with_job_auth(job, request=None):
    merged = json.loads(json.dumps(request or job.get("request") or job, ensure_ascii=False))
    auth_headers = load_job_auth(job)
    if auth_headers:
        headers = merged.get("requestHeaders")
        if not isinstance(headers, dict):
            headers = {}
        headers.update(auth_headers)
        merged["requestHeaders"] = headers
    return merged


def migrate_persisted_job_cookie(job):
    request = job.get("request")
    if not isinstance(request, dict):
        return False
    headers = request.get("requestHeaders")
    if not isinstance(headers, dict):
        return False

    cookie_values = [
        value
        for name, value in headers.items()
        if str(name).strip().lower() == "cookie" and value
    ]
    sanitized = {
        name: value
        for name, value in headers.items()
        if str(name).strip().lower() != "cookie"
    }
    if len(sanitized) == len(headers):
        return False

    request["requestHeaders"] = sanitized
    if cookie_values and job.get("status") != "finished" and not job.get("authPath"):
        auth_path = persist_job_auth(job.get("id"), {
            "requestHeaders": {"cookie": cookie_values[0]},
        })
        if auth_path:
            job["authPath"] = auth_path
    return True


def retryable_download_request(message):
    allowed = [
        "url",
        "referer",
        "originUrl",
        "userAgent",
        "requestHeaders",
        "title",
        "host",
        "quality",
        "formatId",
        "formatSelector",
        "formatLabel",
        "duration",
        "downloadDir",
        "concurrencyLimit",
        "downloadSpeedProfile",
        "browserImpersonation",
    ]
    request = {key: message.get(key) for key in allowed if key in message}
    if "requestHeaders" in request:
        request["requestHeaders"] = request_headers_without_cookie(message)
    return json.loads(json.dumps(request, ensure_ascii=False))


def build_download_command(message):
    url = message.get("url")
    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        raise ValueError("Invalid URL")

    download_dir = resolve_download_dir(message.get("downloadDir"))
    temp_download_dir = resolve_temp_download_dir(download_dir)
    title = sanitize_component(message.get("title"), "video")
    referer = message.get("referer") or message.get("originUrl")
    user_agent = message.get("userAgent")
    headers = forwarded_headers(message)
    speed_key, speed_label, concurrent_fragments, fragment_retries = download_speed_profile(message.get("downloadSpeedProfile"))
    output_template = f"{title} - %(id)s.%(ext)s"

    command = [
        *ytdlp_base_command(),
        "--progress",
        "--newline",
        "--no-color",
        *stable_ytdlp_args(fragment_retries),
        "--concurrent-fragments",
        str(concurrent_fragments),
        "--progress-delta",
        "1",
        "--progress-template",
        PROGRESS_TEMPLATE,
        "--print",
        "[VDH-Lite] Duration|%(duration|)s",
        "--print",
        "after_move:[VDH-Lite] FinalPath|%(filepath|)s",
        "--print",
        "after_move:[VDH-Lite] Format|%(format_id|)s",
        "--print",
        "after_move:[VDH-Lite] Duration|%(duration|)s",
        "-P",
        f"home:{download_dir}",
        "-P",
        f"temp:{temp_download_dir}",
        "-o",
        output_template,
    ]
    if should_use_impersonation(message):
        append_generic_impersonation_args(command)
    format_selector = ytdlp_format_selector(message)
    if format_selector:
        command.extend(["-f", format_selector])
    if isinstance(referer, str) and referer.startswith(("http://", "https://")):
        headers.setdefault("Referer", referer)
        parsed_referer = urlparse(referer)
        origin = f"{parsed_referer.scheme}://{parsed_referer.netloc}"
        headers.setdefault("Origin", origin)
    if isinstance(user_agent, str) and user_agent.strip():
        command.extend(["--user-agent", user_agent.strip()])
    if headers.get("Referer"):
        command.extend(["--referer", headers["Referer"]])
    for name, value in headers.items():
        command.extend(["--add-header", f"{name}: {value}"])
    command.append(url)

    return {
        "command": command,
        "downloadDir": str(download_dir),
        "tempDownloadDir": str(temp_download_dir),
        "title": title,
        "host": sanitize_component(message.get("host"), "site"),
        "quality": sanitize_component(message.get("quality"), ""),
        "formatLabel": sanitize_component(message.get("formatLabel"), ""),
        "formatSelector": format_selector,
        "duration": as_float(message.get("duration")),
        "speedProfile": speed_key,
        "speedProfileLabel": speed_label,
        "concurrentFragments": concurrent_fragments,
        "fragmentRetries": fragment_retries,
        "url": url,
    }


def new_job_id():
    return f"{datetime.now().strftime('%Y%m%d%H%M%S')}-{os.getpid()}-{int(time.time() * 1000) % 100000}"


def new_download_job(message, retry_of=None):
    prepared = build_download_command(message)
    created_at = now_iso()
    job_id = new_job_id()
    job = {
        "id": job_id,
        "pid": None,
        "status": "queued",
        "phase": "queued",
        "running": False,
        "title": prepared["title"],
        "host": prepared["host"],
        "quality": prepared["quality"],
        "formatLabel": prepared["formatLabel"],
        "formatSelector": prepared["formatSelector"],
        "duration": prepared["duration"],
        "speedProfile": prepared["speedProfile"],
        "speedProfileLabel": prepared["speedProfileLabel"],
        "concurrentFragments": prepared["concurrentFragments"],
        "fragmentRetries": prepared["fragmentRetries"],
        "url": prepared["url"],
        "downloadDir": prepared["downloadDir"],
        "tempDownloadDir": prepared["tempDownloadDir"],
        "finalPath": None,
        "formatId": None,
        "progressPath": None,
        "exitPath": None,
        "specPath": None,
        "createdAt": created_at,
        "queuedAt": created_at,
        "startedAt": None,
        "finishedAt": None,
        "concurrencyLimit": clamp_concurrency_limit(message.get("concurrencyLimit")),
        "request": retryable_download_request(message),
    }
    auth_path = persist_job_auth(job_id, message)
    if auth_path:
        job["authPath"] = auth_path
    if retry_of:
        job["retryOf"] = retry_of
    return job


def launch_job(job):
    request = request_with_job_auth(job)
    prepared = build_download_command(request)
    command = prepared["command"]
    log(f"Starting: {loggable_command(command)}")

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_job_id = sanitize_component(job.get("id"), "job")
    progress_path = LOG_DIR / f"progress-{stamp}-{safe_job_id}.txt"
    exit_path = LOG_DIR / f"exit-{stamp}-{safe_job_id}.txt"
    spec_path = LOG_DIR / f"job-{stamp}-{safe_job_id}.json"
    runner_path = Path(__file__).with_name("yt_dlp_runner.py")
    atomic_write_json(spec_path, {
        "command": command,
        "progressPath": str(progress_path),
        "exitPath": str(exit_path),
    })
    try:
        process = subprocess.Popen(
            [sys.executable, str(runner_path), str(spec_path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            env=effective_env(),
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception:
        spec_path.unlink(missing_ok=True)
        raise
    runner_info = process_info(process.pid)
    runner_created_at = runner_info.get("createdAt")

    job.update({
        "pid": process.pid,
        "status": "running",
        "phase": "initializing",
        "running": True,
        "title": prepared["title"],
        "host": prepared["host"],
        "quality": prepared["quality"],
        "formatLabel": prepared["formatLabel"],
        "formatSelector": prepared["formatSelector"],
        "duration": prepared["duration"] or job.get("duration"),
        "speedProfile": prepared["speedProfile"],
        "speedProfileLabel": prepared["speedProfileLabel"],
        "concurrentFragments": prepared["concurrentFragments"],
        "fragmentRetries": prepared["fragmentRetries"],
        "url": prepared["url"],
        "downloadDir": prepared["downloadDir"],
        "tempDownloadDir": prepared["tempDownloadDir"],
        "progressPath": str(progress_path),
        "exitPath": str(exit_path),
        "specPath": str(spec_path),
        "runnerExecutable": sys.executable,
        "runnerPath": str(runner_path),
        "runnerCreatedAt": runner_created_at.isoformat(timespec="seconds") if runner_created_at else None,
        "startedAt": now_iso(),
        "finishedAt": None,
        "lastError": None,
        "exitCode": None,
    })
    return job


def running_job_count(jobs):
    return sum(1 for job in jobs if job.get("status") == "running" and is_process_running(job.get("pid"), job))


def schedule_jobs(jobs, concurrency_limit=None):
    changed = False
    limit = clamp_concurrency_limit(concurrency_limit)
    running = running_job_count(jobs)
    for job in jobs:
        if running >= limit:
            break
        if job.get("status") != "queued":
            continue
        try:
            launch_job(job)
            running += 1
        except Exception as error:
            job["status"] = "failed"
            job["phase"] = "failed"
            job["running"] = False
            job["lastError"] = str(error)
            job["finishedAt"] = now_iso()
        changed = True
    return changed


def remove_job_artifacts(job):
    try:
        log_root = LOG_DIR.resolve()
    except Exception:
        return
    for key in ["progressPath", "exitPath", "specPath", "authPath"]:
        value = job.get(key)
        if not value:
            continue
        try:
            path = Path(value).resolve()
            if log_root not in [path.parent, *path.parents]:
                continue
            if path.exists() and path.is_file():
                path.unlink()
        except Exception:
            pass


def remove_job_auth(job):
    value = job.pop("authPath", None)
    if not value:
        return
    try:
        path = Path(value).resolve()
        log_root = LOG_DIR.resolve()
        if log_root in [path.parent, *path.parents] and path.is_file():
            path.unlink()
    except Exception:
        pass


def cleanup_expired_auth_files():
    try:
        paths = list(LOG_DIR.glob("auth-*.json"))
    except Exception:
        return
    now = time.time()
    for path in paths:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if float(payload.get("expiresAt") or 0) <= now:
                path.unlink(missing_ok=True)
        except Exception:
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass


def cleanup_stale_runner_specs(minimum_age_seconds=60):
    try:
        paths = list(LOG_DIR.glob("job-*.json"))
    except Exception:
        return
    cutoff = time.time() - minimum_age_seconds
    for path in paths:
        try:
            if path.stat().st_mtime <= cutoff:
                path.unlink(missing_ok=True)
        except Exception:
            pass


@job_store_transaction
def cancel_job(message):
    job_id = message.get("jobId")
    jobs = read_jobs()
    for job in jobs:
        if job.get("id") != job_id:
            continue
        status = job.get("status")
        if status == "queued":
            job.update({
                "status": "stopped",
                "phase": "stopped",
                "running": False,
                "lastError": "Cancelled before the download started.",
                "finishedAt": now_iso(),
            })
        elif status in {"running", "stopping"}:
            job["status"] = "stopping"
            job["phase"] = "stopping"
            stopped = terminate_process(job.get("pid"), job)
            if stopped:
                job.update({
                    "status": "stopped",
                    "phase": "stopped",
                    "running": False,
                    "lastError": "Cancelled by user.",
                    "finishedAt": now_iso(),
                })
            else:
                job["running"] = True
        else:
            return {"ok": False, "error": "Job is not active."}
        schedule_jobs(jobs, concurrency_limit_for_message(message))
        write_jobs(jobs)
        return {"ok": True, "jobId": job_id, "status": job.get("status")}
    return {"ok": False, "error": "Job not found."}


def retry_request_for_job(job):
    request = request_with_job_auth(job)
    if not isinstance(request, dict):
        return {}
    retry_request = json.loads(json.dumps(request, ensure_ascii=False))
    error = classify_error(job.get("lastError"), job.get("exitCode"))
    if error["category"] == "impersonation-required":
        retry_request["browserImpersonation"] = True
    return retry_request


def maybe_enqueue_impersonation_retry(jobs, job, error=None):
    error = error or classify_error(job.get("lastError"), job.get("exitCode"))
    if error["category"] != "impersonation-required":
        return False
    request = job.get("request")
    if not isinstance(request, dict):
        return False
    if request.get("browserImpersonation"):
        return False
    if job.get("autoRetryJobId"):
        return False

    retry_request = retry_request_for_job(job)
    if not retry_request.get("browserImpersonation"):
        return False

    new_job = new_download_job(retry_request, retry_of=job.get("id"))
    new_job["autoRetryReason"] = "impersonation-required"
    job["autoRetryJobId"] = new_job["id"]
    job["autoRetryReason"] = "impersonation-required"
    jobs.append(new_job)
    remove_job_auth(job)
    return True


@job_store_transaction
def retry_job(message):
    job_id = message.get("jobId")
    jobs = read_jobs()
    for job in jobs:
        if job.get("id") != job_id:
            continue
        if is_active_job(job):
            return {"ok": False, "error": "Job is still active."}
        request = job.get("request")
        if not isinstance(request, dict):
            return {"ok": False, "error": "Job does not have a retry request."}
        request = retry_request_for_job(job)
        new_job = new_download_job(request, retry_of=job_id)
        remove_job_auth(job)
        jobs.append(new_job)
        schedule_jobs(jobs, concurrency_limit_for_message(message))
        write_jobs(jobs)
        return {"ok": True, "jobId": new_job["id"], "status": new_job.get("status"), "pid": new_job.get("pid")}
    return {"ok": False, "error": "Job not found."}


@job_store_transaction
def retry_failed_jobs(message=None):
    message = message or {}
    jobs = read_jobs()
    created = []
    for job in list(jobs):
        if job.get("status") not in {"failed", "stopped", "unknown"}:
            continue
        if job.get("retryable") is False:
            continue
        request = job.get("request")
        if not isinstance(request, dict):
            continue
        request = retry_request_for_job(job)
        new_job = new_download_job(request, retry_of=job.get("id"))
        remove_job_auth(job)
        jobs.append(new_job)
        created.append(new_job)
    if created:
        schedule_jobs(jobs, concurrency_limit_for_message(message))
        write_jobs(jobs)
    return {"ok": True, "created": len(created), "jobs": [public_job(job) for job in created]}


def discover_media(message):
    url = message.get("url")
    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        raise ValueError("Invalid URL")

    referer = message.get("referer") or message.get("originUrl")
    user_agent = message.get("userAgent")
    headers = forwarded_headers(message)
    deps = get_deps()

    command = [
        *ytdlp_base_command(),
        "--ignore-config",
        "--dump-single-json",
        "--skip-download",
        "--ignore-errors",
        "--no-warnings",
    ]
    if should_use_impersonation(message):
        append_generic_impersonation_args(command)
    if deps.get("ffmpeg", {}).get("installed") and deps.get("ffmpeg", {}).get("path"):
        command.extend(["--ffmpeg-location", deps["ffmpeg"]["path"]])
    effective_referer = headers.get("Referer") or referer
    if isinstance(effective_referer, str) and effective_referer.startswith(("http://", "https://")):
        command.extend(["--referer", effective_referer])
        parsed_referer = urlparse(effective_referer)
        origin = f"{parsed_referer.scheme}://{parsed_referer.netloc}"
        headers.setdefault("Referer", effective_referer)
        headers.setdefault("Origin", origin)
    if isinstance(user_agent, str) and user_agent.strip():
        command.extend(["--user-agent", user_agent.strip()])
    for name, value in headers.items():
        command.extend(["--add-header", f"{name}: {value}"])
    command.append(url)

    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=75,
            env=effective_env(),
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except FileNotFoundError as error:
        classified = classify_error(str(error))
        return {"ok": False, "error": "yt-dlp was not found.", **classified}
    except subprocess.TimeoutExpired:
        classified = classify_error("Discovery timed out")
        return {"ok": False, "error": "Discovery timed out.", **classified}

    output = (result.stdout or "").strip()
    error_output = (result.stderr or "").strip()
    if result.returncode != 0 and not output:
        classified = classify_error(error_output, result.returncode)
        return {
            "ok": False,
            "error": classified["raw"] or f"yt-dlp exited with code {result.returncode}",
            **classified,
        }

    try:
        info = json.loads(output)
    except json.JSONDecodeError:
        classified = classify_error(error_output or output, result.returncode)
        return {
            "ok": False,
            "error": "yt-dlp did not return valid discovery JSON.",
            **classified,
        }

    response = compact_discovery_response(info, url)
    response["source"] = "yt-dlp"
    response["discoveryUrl"] = url
    return response


def loggable_command(command):
    redacted = []
    redact_next = False
    for part in command:
        if redact_next:
            name = str(part).split(":", 1)[0]
            redacted.append(f"{name}: <redacted>")
            redact_next = False
            continue
        redacted.append(part)
        if part == "--add-header":
            redact_next = True
    return " ".join(redacted)


def download_speed_profile(value):
    key = str(value or "balanced").strip().lower()
    profiles = {
        "polite": ("polite", "Polite", 2, 15),
        "balanced": ("balanced", "Balanced", 4, 15),
        "fast": ("fast", "Fast", 8, 10),
        "burst": ("burst", "Burst", 12, 8),
    }
    return profiles.get(key, profiles["balanced"])


@job_store_transaction
def start_download(message):
    concurrency_limit = concurrency_limit_for_message(message)
    job = new_download_job(message)
    jobs = read_jobs()
    jobs.append(job)
    schedule_jobs(jobs, concurrency_limit)
    write_jobs(jobs)

    return {
        "ok": True,
        "jobId": job["id"],
        "pid": job.get("pid"),
        "status": job.get("status"),
        "phase": job.get("phase"),
        "queued": job.get("status") == "queued",
        "downloadDir": job.get("downloadDir"),
        "tempDownloadDir": job.get("tempDownloadDir"),
        "progressPath": job.get("progressPath"),
        "exitPath": job.get("exitPath"),
        "specPath": job.get("specPath"),
    }


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--scheduler-tick":
        time.sleep(0.25)
        get_status()
        return

    try:
        message = read_message()
        if message is None:
            return
        kind = message.get("type")
        if kind == "ping":
            send_message({
                "ok": True,
                "version": HOST_VERSION,
                "hostPath": str(Path(__file__).resolve()),
                "logDir": str(LOG_DIR),
                "defaultDownloadDir": str(DEFAULT_DOWNLOAD_DIR),
            })
        elif kind == "deps":
            send_message(get_deps())
        elif kind == "install-deps":
            send_message(install_deps())
        elif kind == "discover":
            send_message(discover_media(message))
        elif kind == "download":
            send_message(start_download(message))
        elif kind == "cancel":
            send_message(cancel_job(message))
        elif kind == "retry":
            send_message(retry_job(message))
        elif kind == "retry-failed":
            send_message(retry_failed_jobs(message))
        elif kind == "status":
            send_message(get_status(message))
        elif kind == "diagnostics":
            send_message(get_diagnostics(message))
        elif kind == "pick-folder":
            send_message(pick_folder(message))
        elif kind == "clear-jobs":
            send_message(clear_jobs())
        elif kind == "clear-completed":
            send_message(clear_completed_jobs())
        else:
            send_message({"ok": False, "error": f"Unknown message type: {kind}"})
    except Exception as error:
        log(f"Error: {error}")
        send_message({"ok": False, "error": str(error)})


if __name__ == "__main__":
    main()
