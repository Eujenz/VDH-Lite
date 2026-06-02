import json
import subprocess
import sys
from pathlib import Path


def main():
    spec_path = Path(sys.argv[1])
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    progress_path = Path(spec["progressPath"])
    exit_path = Path(spec["exitPath"])
    command = spec["command"]
    env = spec.get("env")

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
            env=env,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )

    exit_path.write_text(str(process.returncode), encoding="utf-8")
    raise SystemExit(process.returncode)


if __name__ == "__main__":
    main()
