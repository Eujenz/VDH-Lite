# VDH Lite UI Harness

This harness runs the popup as a normal local web page with mocked Chrome extension APIs.

It is meant for UI/UX work when loading the unpacked extension in Chrome is not available.

## Run

```powershell
node tests\ui-harness\serve.mjs
```

Then open:

```text
http://127.0.0.1:4177/tests/ui-harness/index.html
```

Use the scenario selector to review empty, detected, active, failed, and finished states.

## Optional Smoke Test

```powershell
node tests\ui-harness\smoke.mjs
```

The smoke test requires the `playwright` package. In Codex, the same scenarios can also be verified through the Browser plugin without installing the extension.
