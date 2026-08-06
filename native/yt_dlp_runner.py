import json
import subprocess
import sys
from pathlib import Path


def start_scheduler_tick():
    host_path = Path(__file__).with_name("yt_dlp_host.py")
    detached_process = getattr(subprocess, "DETACHED_PROCESS", 0)
    new_process_group = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    no_window = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    subprocess.Popen(
        [sys.executable, str(host_path), "--scheduler-tick"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
        creationflags=detached_process | new_process_group | no_window,
    )


def main():
    spec_path = Path(sys.argv[1])
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    spec_path.unlink(missing_ok=True)
    progress_path = Path(spec["progressPath"])
    exit_path = Path(spec["exitPath"])
    command = spec["command"]

    progress_path.parent.mkdir(parents=True, exist_ok=True)
    with progress_path.open("w", encoding="utf-8", buffering=1) as progress:
        process = subprocess.run(
            command,
            stdout=progress,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )

    exit_path.write_text(str(process.returncode), encoding="utf-8")
    start_scheduler_tick()
    raise SystemExit(process.returncode)


if __name__ == "__main__":
    main()
