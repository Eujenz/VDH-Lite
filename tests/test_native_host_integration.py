import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class NativeHostStoreIntegrationTests(unittest.TestCase):
    def test_runner_deletes_transient_spec_before_download_process(self):
        repo_root = Path(__file__).resolve().parents[1]
        runner_path = repo_root / "native" / "yt_dlp_runner.py"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            spec_path = root / "job.json"
            progress_path = root / "progress.txt"
            exit_path = root / "exit.txt"
            spec_path.write_text(json.dumps({
                "command": [sys.executable, "-c", "print('runner-ok')"],
                "progressPath": str(progress_path),
                "exitPath": str(exit_path),
            }), encoding="utf-8")

            result = subprocess.run(
                [sys.executable, str(runner_path), str(spec_path)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=30,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(spec_path.exists())
            self.assertEqual(exit_path.read_text(encoding="utf-8"), "0")
            self.assertIn("runner-ok", progress_path.read_text(encoding="utf-8"))

    def test_concurrent_transactions_do_not_lose_jobs(self):
        repo_root = Path(__file__).resolve().parents[1]
        host_path = repo_root / "native" / "yt_dlp_host.py"
        worker = r"""
import importlib.util
import sys
import time

host_path, worker_id = sys.argv[1:3]
spec = importlib.util.spec_from_file_location(f"vdh_worker_{worker_id}", host_path)
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)

with host.job_store_lock():
    jobs = host.read_jobs()
    time.sleep(0.05)
    jobs.append({"id": worker_id, "status": "finished"})
    host.write_jobs(jobs)
"""

        with tempfile.TemporaryDirectory() as local_app_data:
            env = os.environ.copy()
            env["LOCALAPPDATA"] = local_app_data
            processes = [
                subprocess.Popen(
                    [sys.executable, "-c", worker, str(host_path), str(index)],
                    env=env,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                for index in range(8)
            ]

            failures = []
            for process in processes:
                stdout, stderr = process.communicate(timeout=30)
                if process.returncode:
                    failures.append((process.returncode, stdout, stderr))
            self.assertEqual(failures, [])

            log_dir = Path(local_app_data) / "VDH Lite"
            jobs = json.loads((log_dir / "jobs.json").read_text(encoding="utf-8"))
            self.assertEqual({job["id"] for job in jobs}, {str(index) for index in range(8)})
            self.assertEqual(list(log_dir.glob(".jobs.json.*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
