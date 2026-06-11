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
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

HOST_VERSION = "1.0.0"
DEFAULT_DOWNLOAD_DIR = Path.home() / "Downloads" / "VDH Lite"
LOG_DIR = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "VDH Lite"
LOG_FILE = LOG_DIR / "yt-dlp-host.log"
JOBS_FILE = LOG_DIR / "jobs.json"
PROGRESS_PREFIX = "[VDH-Lite] Progress|"
FINAL_PATH_PREFIX = "[VDH-Lite] FinalPath|"
FORMAT_PREFIX = "[VDH-Lite] Format|"
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


def command_version(command):
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

    heights = {}
    audio_formats = []
    for fmt in formats:
        if not isinstance(fmt, dict):
            continue
        height = fmt.get("height")
        if height and format_has_video(fmt):
            heights[height] = max(heights.get(height, 0) or 0, fmt.get("tbr") or 0)
        if format_has_audio(fmt) and not format_has_video(fmt):
            audio_formats.append(fmt)

    for height in sorted(heights.keys(), reverse=True)[:8]:
        choices.append({
            "id": f"height-{height}",
            "label": f"{height}P from yt-dlp formats",
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
        key=lambda item: (
            item.get("height") or 0,
            item.get("tbr") or item.get("abr") or 0,
        ),
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
    elif "stalled" in lowered or "did not get any data block" in lowered or "fragment downloads failed" in lowered:
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
    }


def get_diagnostics(message=None):
    message = message or {}
    status = get_status()
    jobs = status.get("jobs", [])
    job_id = message.get("jobId")
    if job_id:
        jobs = [job for job in jobs if job.get("id") == job_id]
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

    if not before["ytDlp"]["installed"]:
        results.append(run_install_command([sys.executable, "-m", "pip", "install", "--user", "-U", "yt-dlp"]))

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


def read_jobs():
    try:
        return json.loads(JOBS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def write_jobs(jobs):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    JOBS_FILE.write_text(json.dumps(jobs[-20:], ensure_ascii=False, indent=2), encoding="utf-8")


def update_job(job_id, updates):
    jobs = read_jobs()
    for job in jobs:
        if job.get("id") == job_id:
            job.update(updates)
            break
    write_jobs(jobs)


def is_process_running(pid):
    result = subprocess.run(
        ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    return str(pid) in result.stdout


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
    }
    progress_path = Path(job.get("progressPath", ""))
    exit_path = Path(job.get("exitPath", ""))
    download_dir = Path(job.get("downloadDir", ""))

    if exit_path.exists() and job.get("exitCode") is None:
        try:
            job["exitCode"] = int(exit_path.read_text(encoding="utf-8").strip())
        except Exception:
            pass

    if progress_path.exists():
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
        ytdl_files = sorted(download_dir.glob("*.ytdl"), key=lambda path: path.stat().st_mtime, reverse=True)
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


def get_status():
    jobs = read_jobs()
    changed = False
    for job in jobs:
        running = is_process_running(job.get("pid"))
        persisted_before = {
            key: job.get(key)
            for key in [
                "exitCode",
                "finalPath",
                "formatId",
                "lastError",
                "errorCategory",
                "errorLabel",
                "errorSummary",
                "nextAction",
                "retryable",
            ]
        }
        progress = parse_progress(job)
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
        job["elapsedText"] = elapsed_text(job.get("startedAt"), job.get("finishedAt"))
        if not running and job.get("status") == "running":
            exit_code = job.get("exitCode")
            if exit_code is None:
                job["status"] = "unknown"
                job["phase"] = "unknown"
            elif exit_code == 0:
                job["status"] = "finished"
                job["percent"] = job["percent"] if job["percent"] is not None else 100
                job["phase"] = "finished"
            else:
                job["status"] = "failed"
                job["phase"] = "failed"
            job["finishedAt"] = datetime.now().isoformat(timespec="seconds")
            job["elapsedText"] = elapsed_text(job.get("startedAt"), job.get("finishedAt"))
            changed = True
        elif job.get("status") == "finished":
            job["phase"] = "finished"
            job["percent"] = job["percent"] if job["percent"] is not None else 100
        elif job.get("status") == "failed":
            job["phase"] = "failed"

        if job.get("lastError") or job.get("status") == "failed":
            error = classify_error(job.get("lastError"), job.get("exitCode"))
            job["errorCategory"] = error["category"]
            job["errorLabel"] = error["label"]
            job["errorSummary"] = error["summary"]
            job["nextAction"] = error["nextAction"]
            job["retryable"] = error["retryable"]

        if any(job.get(key) != value for key, value in persisted_before.items()):
            changed = True
    if changed:
        write_jobs(jobs)
    return {"ok": True, "jobs": list(reversed(jobs[-8:]))}


def clear_jobs():
    jobs = read_jobs()
    keep = []
    for job in jobs:
        if is_process_running(job.get("pid")):
            keep.append(job)
    write_jobs(keep)
    return {"ok": True}


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
    }
    forwarded = {}
    for raw_name, raw_value in headers.items():
        name = str(raw_name or "").lower()
        value = str(raw_value or "").strip()
        if name in allowed and value:
            forwarded[allowed[name]] = value
    return forwarded


def discover_media(message):
    url = message.get("url")
    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        raise ValueError("Invalid URL")

    referer = message.get("referer") or message.get("originUrl")
    user_agent = message.get("userAgent")
    headers = forwarded_headers(message)
    deps = get_deps()

    command = [
        "yt-dlp",
        "--ignore-config",
        "--dump-single-json",
        "--skip-download",
        "--ignore-errors",
        "--no-warnings",
    ]
    if deps.get("ffmpeg", {}).get("installed") and deps.get("ffmpeg", {}).get("path"):
        command.extend(["--ffmpeg-location", deps["ffmpeg"]["path"]])
    if isinstance(referer, str) and referer.startswith(("http://", "https://")):
        command.extend(["--referer", referer])
        parsed_referer = urlparse(referer)
        origin = f"{parsed_referer.scheme}://{parsed_referer.netloc}"
        headers.setdefault("Referer", referer)
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


def start_download(message):
    url = message.get("url")
    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        raise ValueError("Invalid URL")

    download_dir = resolve_download_dir(message.get("downloadDir"))
    title = sanitize_component(message.get("title"), "video")
    referer = message.get("referer") or message.get("originUrl")
    user_agent = message.get("userAgent")
    headers = forwarded_headers(message)
    output_template = f"{title} - %(id)s.%(ext)s"

    command = [
        "yt-dlp",
        "--progress",
        "--newline",
        "--no-color",
        "--progress-delta",
        "1",
        "--progress-template",
        PROGRESS_TEMPLATE,
        "--print",
        "after_move:[VDH-Lite] FinalPath|%(filepath|)s",
        "--print",
        "after_move:[VDH-Lite] Format|%(format_id|)s",
        "-P",
        str(download_dir),
        "-o",
        output_template,
    ]
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
    for name, value in headers.items():
        command.extend(["--add-header", f"{name}: {value}"])
    command.append(url)

    log(f"Starting: {loggable_command(command)}")
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    progress_path = LOG_DIR / f"progress-{stamp}-{os.getpid()}.txt"
    exit_path = LOG_DIR / f"exit-{stamp}-{os.getpid()}.txt"
    spec_path = LOG_DIR / f"job-{stamp}-{os.getpid()}.json"
    runner_path = Path(__file__).with_name("yt_dlp_runner.py")
    spec_path.write_text(json.dumps({
        "command": command,
        "progressPath": str(progress_path),
        "exitPath": str(exit_path),
        "env": effective_env(),
    }, ensure_ascii=False), encoding="utf-8")
    process = subprocess.Popen(
        [sys.executable, str(runner_path), str(spec_path)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )

    job_id = f"{datetime.now().strftime('%Y%m%d%H%M%S')}-{process.pid}"

    job = {
        "id": job_id,
        "pid": process.pid,
        "status": "running",
        "phase": "initializing",
        "title": title,
        "host": sanitize_component(message.get("host"), "site"),
        "quality": sanitize_component(message.get("quality"), ""),
        "formatLabel": sanitize_component(message.get("formatLabel"), ""),
        "formatSelector": format_selector,
        "url": url,
        "downloadDir": str(download_dir),
        "finalPath": None,
        "formatId": None,
        "progressPath": str(progress_path),
        "exitPath": str(exit_path),
        "specPath": str(spec_path),
        "startedAt": datetime.now().isoformat(timespec="seconds"),
    }
    jobs = read_jobs()
    jobs.append(job)
    write_jobs(jobs)

    return {
        "ok": True,
        "jobId": job["id"],
        "pid": process.pid,
        "downloadDir": str(download_dir),
        "progressPath": str(progress_path),
        "exitPath": str(exit_path),
        "specPath": str(spec_path),
        "command": command,
    }


def main():
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
        elif kind == "status":
            send_message(get_status())
        elif kind == "diagnostics":
            send_message(get_diagnostics(message))
        elif kind == "pick-folder":
            send_message(pick_folder(message))
        elif kind == "clear-jobs":
            send_message(clear_jobs())
        else:
            send_message({"ok": False, "error": f"Unknown message type: {kind}"})
    except Exception as error:
        log(f"Error: {error}")
        send_message({"ok": False, "error": str(error)})


if __name__ == "__main__":
    main()
