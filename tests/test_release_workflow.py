import subprocess
import unittest
from pathlib import Path


class ReleaseWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.repo_root = Path(__file__).resolve().parents[1]
        self.script = self.repo_root / "scripts" / "check-release-readiness.ps1"

    def run_check(self, *arguments):
        return subprocess.run(
            [
                "powershell",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(self.script),
                *arguments,
            ],
            cwd=self.repo_root,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=30,
        )

    def test_development_release_check_passes(self):
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_store_release_is_blocked_until_published_id_is_configured(self):
        result = self.run_check("-Store")
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("No published Chrome Web Store extension ID is configured", result.stdout)


if __name__ == "__main__":
    unittest.main()
