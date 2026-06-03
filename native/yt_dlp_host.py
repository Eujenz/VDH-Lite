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


def parse_progress(job):
    current = None
    total = None
    overallPercent = None
    etaText = None
    speedText = None
    speedBytes = None
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
            for line in lines[-120:]:
                match = re.search(r"Total fragments:\s*(\d+)", line)
                if match:
                    total = int(match.group(1))
                match = re.search(r"\(frag\s+(\d+)/(\d+)\)", line)
                if match:
                    current = int(match.group(1))
                    total = int(match.group(2))
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
                    speedBytes = value * multiplier
                    speedText = f"{speedBytes / (1024 ** 2):.2f} MB/s"
                if "ERROR:" in line:
                    job["lastError"] = line.strip()
                eta_match = re.search(r"\bETA\s+([0-9:]+|Unknown)", line)
                if eta_match:
                    etaText = eta_match.group(1)
                match = re.search(r"\[download\]\s+([0-9.]+)%.*?at\s+([0-9.]+)([KMG]i?B)/s(?:\s+ETA\s+([0-9:]+|Unknown))?", line)
                if match:
                    overallPercent = float(match.group(1))
                    value = float(match.group(2))
                    unit = match.group(3)
                    etaText = match.group(4) or etaText
                    multiplier = {
                        "KiB": 1024,
                        "MiB": 1024 ** 2,
                        "GiB": 1024 ** 3,
                        "KB": 1000,
                        "MB": 1000 ** 2,
                        "GB": 1000 ** 3,
                    }.get(unit, 1)
                    speedBytes = value * multiplier
                    speedText = f"{speedBytes / (1024 ** 2):.2f} MB/s"
        except Exception:
            pass

    try:
        ytdl_files = sorted(download_dir.glob("*.ytdl"), key=lambda path: path.stat().st_mtime, reverse=True)
        if ytdl_files:
            state = json.loads(ytdl_files[0].read_text(encoding="utf-8"))
            index = state.get("downloader", {}).get("current_fragment", {}).get("index")
            if isinstance(index, int):
                current = index
    except Exception:
        pass

    percent = None
    if overallPercent is not None:
        percent = max(0, min(100, round(overallPercent, 1)))
    elif current is not None and total:
        percent = max(0, min(100, round(current * 100 / total, 1)))

    return current, total, percent, speedText, speedBytes, etaText


def get_status():
    jobs = read_jobs()
    changed = False
    for job in jobs:
        running = is_process_running(job.get("pid"))
        current, total, percent, speedText, speedBytes, etaText = parse_progress(job)
        job["running"] = running
        job["currentFragment"] = current
        job["totalFragments"] = total
        job["percent"] = percent
        job["speedText"] = speedText
        job["speedBytes"] = speedBytes
        job["etaText"] = etaText if running else None
        job["elapsedText"] = elapsed_text(job.get("startedAt"), job.get("finishedAt"))
        if not running and job.get("status") == "running":
            exit_code = job.get("exitCode")
            if exit_code is None:
                job["status"] = "unknown"
            elif exit_code == 0:
                job["status"] = "finished"
                job["percent"] = job["percent"] if job["percent"] is not None else 100
            else:
                job["status"] = "failed"
            job["finishedAt"] = datetime.now().isoformat(timespec="seconds")
            job["elapsedText"] = elapsed_text(job.get("startedAt"), job.get("finishedAt"))
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
        "--newline",
        "-P",
        str(download_dir),
        "-o",
        output_template,
    ]
    format_selector = ytdlp_format_for_quality(message.get("quality"))
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
        "title": title,
        "host": sanitize_component(message.get("host"), "site"),
        "quality": sanitize_component(message.get("quality"), ""),
        "url": url,
        "downloadDir": str(download_dir),
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
        elif kind == "download":
            send_message(start_download(message))
        elif kind == "status":
            send_message(get_status())
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
