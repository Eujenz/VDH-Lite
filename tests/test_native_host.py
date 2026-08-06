import importlib.util
import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch


def load_host_module():
    repo_root = Path(__file__).resolve().parents[1]
    host_path = repo_root / "native" / "yt_dlp_host.py"
    spec = importlib.util.spec_from_file_location("yt_dlp_host_under_test", host_path)
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except ModuleNotFoundError as error:
        if error.name == "winreg":
            raise unittest.SkipTest("Windows native host tests require winreg.")
        raise
    return module


host = load_host_module()


class NativeHostJobStateTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.log_dir = Path(self.temp_dir.name)
        self.original_log_dir = host.LOG_DIR
        self.original_jobs_file = host.JOBS_FILE
        self.original_jobs_lock_file = host.JOBS_LOCK_FILE
        self.original_queue_settings_file = host.QUEUE_SETTINGS_FILE
        host.LOG_DIR = self.log_dir
        host.JOBS_FILE = self.log_dir / "jobs.json"
        host.JOBS_LOCK_FILE = self.log_dir / "jobs.lock"
        host.QUEUE_SETTINGS_FILE = self.log_dir / "queue-settings.json"

    def tearDown(self):
        host.LOG_DIR = self.original_log_dir
        host.JOBS_FILE = self.original_jobs_file
        host.JOBS_LOCK_FILE = self.original_jobs_lock_file
        host.QUEUE_SETTINGS_FILE = self.original_queue_settings_file
        self.temp_dir.cleanup()

    def write_jobs(self, jobs):
        host.JOBS_FILE.write_text(json.dumps(jobs, ensure_ascii=False, indent=2), encoding="utf-8")

    def read_jobs(self):
        return json.loads(host.JOBS_FILE.read_text(encoding="utf-8"))

    def reused_svchost_info(self):
        return {
            "exists": True,
            "pid": 2408,
            "imagePath": r"C:\Windows\System32\svchost.exe",
            "name": "svchost.exe",
            "createdAt": datetime.fromisoformat("2026-06-26T23:54:07"),
        }

    def test_reused_non_runner_pid_is_not_running(self):
        job = {
            "id": "stuck",
            "pid": 2408,
            "status": "stopping",
            "startedAt": "2026-06-26T23:50:20",
        }

        with patch.object(host, "process_info", return_value=self.reused_svchost_info()):
            self.assertFalse(host.is_process_running(2408, job))

    def test_runner_name_fallback_matches_saved_executable_basename(self):
        job = {
            "id": "running",
            "pid": 15740,
            "status": "running",
            "startedAt": "2026-06-28T03:04:02",
            "runnerExecutable": host.sys.executable,
        }
        info = {
            "exists": True,
            "pid": 15740,
            "imagePath": Path(host.sys.executable).name,
            "name": Path(host.sys.executable).name,
            "createdAt": datetime.fromisoformat("2026-06-28T03:04:02"),
        }

        with patch.object(host, "process_info", return_value=info):
            self.assertTrue(host.is_process_running(15740, job))

    def test_status_marks_stopping_job_stopped_when_exit_file_exists(self):
        exit_path = self.log_dir / "exit.txt"
        progress_path = self.log_dir / "progress.txt"
        exit_path.write_text("1073807364", encoding="utf-8")
        progress_path.write_text("[VDH-Lite] Progress|downloading|| 20.9%|1|1|1||2|572|2732\n", encoding="utf-8")
        self.write_jobs([
            {
                "id": "stuck",
                "pid": 2408,
                "status": "stopping",
                "phase": "downloading",
                "running": True,
                "startedAt": "2026-06-26T23:50:20",
                "exitPath": str(exit_path),
                "progressPath": str(progress_path),
            }
        ])

        response = host.get_status()
        saved_job = self.read_jobs()[0]

        self.assertTrue(response["ok"])
        self.assertEqual(saved_job["status"], "stopped")
        self.assertEqual(saved_job["phase"], "stopped")
        self.assertFalse(saved_job["running"])
        self.assertEqual(saved_job["exitCode"], 1073807364)
        self.assertEqual(response["jobs"][0]["status"], "stopped")

    def test_cancel_reused_pid_marks_stopped_without_taskkill(self):
        self.write_jobs([
            {
                "id": "stuck",
                "pid": 2408,
                "status": "stopping",
                "phase": "stopping",
                "running": True,
                "startedAt": "2026-06-26T23:50:20",
            }
        ])

        with patch.object(host, "process_info", return_value=self.reused_svchost_info()):
            with patch.object(host.subprocess, "run", side_effect=AssertionError("taskkill should not run")):
                response = host.cancel_job({"jobId": "stuck"})

        saved_job = self.read_jobs()[0]
        self.assertTrue(response["ok"])
        self.assertEqual(response["status"], "stopped")
        self.assertEqual(saved_job["status"], "stopped")
        self.assertFalse(saved_job["running"])

    def test_clear_jobs_refreshes_stale_stopping_job_before_removal(self):
        exit_path = self.log_dir / "exit.txt"
        progress_path = self.log_dir / "progress.txt"
        spec_path = self.log_dir / "job.json"
        exit_path.write_text("1073807364", encoding="utf-8")
        progress_path.write_text("[VDH-Lite] Progress|downloading|| 20.9%|1|1|1||2|572|2732\n", encoding="utf-8")
        spec_path.write_text("{}", encoding="utf-8")
        self.write_jobs([
            {
                "id": "stuck",
                "pid": 2408,
                "status": "stopping",
                "phase": "downloading",
                "running": True,
                "startedAt": "2026-06-26T23:50:20",
                "exitPath": str(exit_path),
                "progressPath": str(progress_path),
                "specPath": str(spec_path),
            }
        ])

        response = host.clear_jobs()

        self.assertTrue(response["ok"])
        self.assertEqual(response["cleared"], 1)
        self.assertEqual(self.read_jobs(), [])
        self.assertFalse(exit_path.exists())
        self.assertFalse(progress_path.exists())
        self.assertFalse(spec_path.exists())

    def test_clear_completed_removes_all_terminal_jobs_only(self):
        self.write_jobs([
            {"id": "finished", "status": "finished", "phase": "finished"},
            {"id": "failed", "status": "failed", "phase": "failed"},
            {"id": "stopped", "status": "stopped", "phase": "stopped"},
            {"id": "unknown", "status": "unknown", "phase": "unknown"},
            {"id": "queued", "status": "queued", "phase": "queued"},
            {"id": "running", "pid": 1234, "status": "running", "phase": "downloading"},
            {"id": "stopping", "pid": 5678, "status": "stopping", "phase": "stopping"},
        ])

        with patch.object(host, "is_process_running", return_value=True):
            with patch.object(host, "schedule_jobs", return_value=False):
                response = host.clear_completed_jobs()

        self.assertTrue(response["ok"])
        self.assertEqual(response["cleared"], 4)
        self.assertEqual(
            [job["id"] for job in self.read_jobs()],
            ["queued", "running", "stopping"],
        )

    def test_download_command_forwards_cookie_and_browser_headers(self):
        with tempfile.TemporaryDirectory() as download_dir:
            with patch.object(host, "ytdlp_base_command", return_value=["yt-dlp"]):
                with patch.object(host, "ytdlp_impersonation_available", return_value=False):
                    prepared = host.build_download_command({
                        "url": "https://suisei.v.anime1.me/video/master.m3u8",
                        "referer": "https://anime1.me/watch/example",
                        "originUrl": "https://anime1.me/watch/example",
                        "userAgent": "Mozilla/5.0 Test",
                        "requestHeaders": {
                            "cookie": "cf_clearance=test-clearance; session=test-session",
                            "accept-language": "zh-TW,zh;q=0.9",
                            "sec-fetch-site": "cross-site",
                        },
                        "title": "Example Episode",
                        "host": "suisei.v.anime1.me",
                        "quality": "800P",
                        "downloadDir": download_dir,
                    })

        command = prepared["command"]

        self.assertIn("--referer", command)
        self.assertIn("https://anime1.me/watch/example", command)
        self.assertIn("--user-agent", command)
        self.assertIn("Mozilla/5.0 Test", command)
        self.assertIn("Cookie: cf_clearance=test-clearance; session=test-session", command)
        self.assertIn("Accept-Language: zh-TW,zh;q=0.9", command)
        self.assertIn("Sec-Fetch-Site: cross-site", command)

    def test_download_command_does_not_impersonate_by_default(self):
        with tempfile.TemporaryDirectory() as download_dir:
            with patch.object(host, "ytdlp_base_command", return_value=["yt-dlp"]):
                with patch.object(host, "ytdlp_impersonation_available", return_value=True):
                    prepared = host.build_download_command({
                        "url": "https://suisei.v.anime1.me/video/master.m3u8",
                        "referer": "https://anime1.me/watch/example",
                        "title": "Example Episode",
                        "host": "suisei.v.anime1.me",
                        "downloadDir": download_dir,
                    })

        self.assertNotIn("--impersonate", prepared["command"])
        self.assertNotIn("--extractor-args", prepared["command"])

    def test_download_command_can_enable_impersonation_explicitly(self):
        with tempfile.TemporaryDirectory() as download_dir:
            with patch.object(host, "ytdlp_base_command", return_value=["yt-dlp"]):
                with patch.object(host, "ytdlp_impersonation_available", return_value=True):
                    prepared = host.build_download_command({
                        "url": "https://example.test/video.m3u8",
                        "browserImpersonation": True,
                        "title": "Example Episode",
                        "host": "example.test",
                        "downloadDir": download_dir,
                    })

        self.assertIn("--impersonate", prepared["command"])
        self.assertIn("chrome", prepared["command"])
        self.assertIn("--extractor-args", prepared["command"])
        self.assertIn("generic:impersonate", prepared["command"])

    def test_diagnostics_reports_cookie_presence_without_cookie_value(self):
        job = {
            "id": "failed-cookie-job",
            "status": "failed",
            "phase": "failed",
            "host": "suisei.v.anime1.me",
            "quality": "800P",
            "lastError": "ERROR: [generic] Unable to download webpage: HTTP Error 403: Forbidden",
            "request": {
                "requestHeaders": {
                    "sec-fetch-site": "cross-site",
                }
            },
        }
        job["authPath"] = host.persist_job_auth(job["id"], {
            "requestHeaders": {"cookie": "cf_clearance=very-secret"},
        })

        diagnostics = host.sanitize_job_for_diagnostics(job)

        self.assertTrue(diagnostics["requestHasCookie"])
        self.assertEqual(diagnostics["requestHeaderNames"], ["cookie", "sec-fetch-site"])
        self.assertNotIn("very-secret", json.dumps(diagnostics))

    def test_job_history_never_persists_cookie_header(self):
        with tempfile.TemporaryDirectory() as download_dir:
            with patch.object(host, "ytdlp_base_command", return_value=["yt-dlp"]):
                job = host.new_download_job({
                    "url": "https://media.example.test/video.m3u8",
                    "title": "Example",
                    "downloadDir": download_dir,
                    "requestHeaders": {
                        "cookie": "session=very-secret",
                        "referer": "https://page.example.test/",
                    },
                })

        self.assertNotIn("cookie", job["request"]["requestHeaders"])
        self.assertNotIn("very-secret", json.dumps(job))
        self.assertEqual(
            host.request_with_job_auth(job)["requestHeaders"]["cookie"],
            "session=very-secret",
        )

    def test_history_cleanup_preserves_order_and_projects_active_jobs(self):
        jobs = [
            {"id": "active-1", "status": "queued"},
            {"id": "active-2", "status": "running"},
            *[
                {"id": f"finished-{index}", "status": "finished"}
                for index in range(48)
            ],
        ]

        cleaned = host.cleanup_job_history(jobs)
        projected = host.projected_status_jobs(cleaned)

        self.assertEqual(len(cleaned), host.JOB_HISTORY_LIMIT)
        self.assertEqual(cleaned[:2], jobs[:2])
        self.assertEqual(
            {job["id"] for job in projected if host.is_active_job(job)},
            {"active-1", "active-2"},
        )

    def test_history_cleanup_handles_zero_inactive_capacity(self):
        jobs = [
            *[{"id": f"active-{index}", "status": "queued"} for index in range(40)],
            *[{"id": f"finished-{index}", "status": "finished"} for index in range(10)],
        ]

        cleaned = host.cleanup_job_history(jobs)

        self.assertEqual(len(cleaned), 40)
        self.assertTrue(all(host.is_active_job(job) for job in cleaned))

    def test_status_uses_persisted_concurrency_limit(self):
        self.write_jobs([{"id": "queued", "status": "queued", "phase": "queued"}])
        host.persist_concurrency_limit(1)
        observed_limits = []

        def fake_schedule(jobs, concurrency_limit=None):
            observed_limits.append(concurrency_limit)
            return False

        with patch.object(host, "schedule_jobs", side_effect=fake_schedule):
            host.get_status()

        self.assertEqual(observed_limits, [1])

    def test_status_persists_updated_concurrency_limit(self):
        self.write_jobs([])

        with patch.object(host, "schedule_jobs", return_value=False):
            host.get_status({"concurrencyLimit": 3})

        self.assertEqual(host.read_queue_settings()["concurrencyLimit"], 3)

    def test_get_diagnostics_uses_raw_job_request_for_cookie_presence(self):
        self.write_jobs([
            {
                "id": "failed-cookie-job",
                "status": "failed",
                "phase": "failed",
                "host": "suisei.v.anime1.me",
                "quality": "800P",
                "lastError": "ERROR: [generic] Unable to download webpage: HTTP Error 403: Forbidden",
                "request": {
                    "requestHeaders": {
                        "cookie": "cf_clearance=very-secret",
                        "referer": "https://anime1.me/",
                    }
                },
            }
        ])

        diagnostics = host.get_diagnostics({"jobId": "failed-cookie-job"})
        job = diagnostics["jobs"][0]

        self.assertTrue(job["requestHasCookie"])
        self.assertEqual(job["requestHeaderNames"], ["cookie", "referer"])
        self.assertNotIn("very-secret", json.dumps(diagnostics))
        persisted = self.read_jobs()[0]
        self.assertNotIn("cookie", persisted["request"]["requestHeaders"])
        self.assertNotIn("very-secret", json.dumps(persisted))

    def test_diagnostics_hides_superseded_auto_retry_failure(self):
        self.write_jobs([
            {
                "id": "failed-first-attempt",
                "status": "failed",
                "autoRetryJobId": "active-retry",
                "lastError": "ERROR: HTTP Error 403 caused by Cloudflare anti-bot challenge",
            },
            {
                "id": "active-retry",
                "pid": 1234,
                "status": "running",
                "phase": "downloading",
            },
        ])

        with patch.object(host, "is_process_running", return_value=True):
            diagnostics = host.get_diagnostics()

        self.assertEqual([job["id"] for job in diagnostics["jobs"]], ["active-retry"])

    def test_impersonation_required_retry_enables_browser_impersonation(self):
        request = {
            "url": "https://surrit.com/example/playlist.m3u8",
            "requestHeaders": {"cookie": "cf=test"},
        }

        retry_request = host.retry_request_for_job({
            "request": request,
            "lastError": "ERROR: Got HTTP Error 403 caused by Cloudflare anti-bot challenge; try again with --extractor-args \"generic:impersonate\"",
            "exitCode": 1,
        })

        self.assertTrue(retry_request["browserImpersonation"])
        self.assertNotIn("browserImpersonation", request)

    def test_auth_required_retry_keeps_browser_impersonation_off(self):
        retry_request = host.retry_request_for_job({
            "request": {"url": "https://suisei.v.anime1.me/example/playlist.m3u8"},
            "lastError": "ERROR: [generic] Unable to download webpage: HTTP Error 403: Forbidden",
            "exitCode": 1,
        })

        self.assertNotIn("browserImpersonation", retry_request)

    def test_status_auto_retries_impersonation_required_once(self):
        self.write_jobs([
            {
                "id": "cloudflare-failed",
                "pid": None,
                "status": "failed",
                "phase": "failed",
                "host": "surrit.com",
                "quality": "HLS",
                "lastError": "ERROR: Got HTTP Error 403 caused by Cloudflare anti-bot challenge; try again with --extractor-args \"generic:impersonate\"",
                "exitCode": 1,
                "request": {
                    "url": "https://surrit.com/example/playlist.m3u8",
                    "title": "Example",
                    "host": "surrit.com",
                    "quality": "HLS",
                    "downloadDir": str(self.log_dir / "downloads"),
                    "requestHeaders": {"cookie": "cf=test"},
                },
            }
        ])

        def fake_launch(job):
            job.update({
                "pid": 1234,
                "status": "running",
                "phase": "initializing",
                "running": True,
                "startedAt": "2026-07-12T23:30:00",
            })
            return job

        with patch.object(host, "launch_job", side_effect=fake_launch):
            response = host.get_status()

        saved_jobs = self.read_jobs()
        original = saved_jobs[0]
        retry = saved_jobs[1]

        self.assertTrue(response["ok"])
        self.assertEqual(len(saved_jobs), 2)
        self.assertEqual([job["id"] for job in response["jobs"]], [retry["id"]])
        self.assertEqual(original["autoRetryJobId"], retry["id"])
        self.assertEqual(retry["retryOf"], "cloudflare-failed")
        self.assertEqual(retry["autoRetryReason"], "impersonation-required")
        self.assertTrue(retry["request"]["browserImpersonation"])

        with patch.object(host, "launch_job", side_effect=AssertionError("no second retry should launch")):
            host.get_status()

        self.assertEqual(len(self.read_jobs()), 2)


class NativeHostFormatSortingTests(unittest.TestCase):
    def test_format_sorting_prioritizes_video_bitrate_before_codec_and_resolution(self):
        info = {
            "title": "Sorting example",
            "formats": [
                {"format_id": "av1-low", "height": 1080, "width": 1920, "fps": 60, "tbr": 2135, "vcodec": "av01.0.08M.08", "acodec": "none"},
                {"format_id": "avc-high", "height": 1080, "width": 1920, "fps": 30, "tbr": 4159, "vcodec": "avc1.640028", "acodec": "none"},
                {"format_id": "avc-low", "height": 720, "width": 1280, "fps": 60, "tbr": 1045, "vcodec": "avc1.4d401f", "acodec": "none"},
            ],
        }

        formats = host.compact_media_entry(info)["formats"]

        self.assertEqual([item["id"] for item in formats], ["avc-high", "av1-low", "avc-low"])

    def test_format_sorting_prioritizes_av1_when_bitrate_matches(self):
        formats = host.compact_media_entry({
            "title": "Codec example",
            "formats": [
                {"format_id": "avc", "height": 1080, "tbr": 3000, "vcodec": "avc1", "acodec": "none"},
                {"format_id": "hevc", "height": 1080, "tbr": 3000, "vcodec": "hev1", "acodec": "none"},
                {"format_id": "av1", "height": 1080, "tbr": 3000, "vcodec": "av01", "acodec": "none"},
            ],
        })["formats"]

        self.assertEqual([item["id"] for item in formats], ["av1", "hevc", "avc"])


class NativeHostSchedulerTests(unittest.TestCase):
    def test_scheduler_tick_refreshes_status_after_runner_finishes(self):
        with patch.object(host.time, "sleep") as sleep:
            with patch.object(host, "get_status", return_value={"ok": True}) as get_status:
                with patch.object(host.sys, "argv", ["yt_dlp_host.py", "--scheduler-tick"]):
                    host.main()

        sleep.assert_called_once_with(0.25)
        get_status.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
