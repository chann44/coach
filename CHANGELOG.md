# Changelog

## 2026-04-10

### Shipped
- Set up AI agent baseline and daemon workflow.
- Improved prompt/reply guard behavior so scheduling does not interrupt active message flows.
- Added `food_lookup` tool integration.
- Added barcode image tool integration.
- Added Apple Health tool integration.

### Web rollout (in progress on `web` branch)
- Built `web/index.html` landing page with iMessage-style animated conversation UI.
- Fixed chat playback scroll behavior to avoid page jump and reduce scroll hijacking.
- Added local message media assets: `web/lunch.jpg` and `web/dessert.jpg`.
- Added standalone pages:
  - `web/integration.html`
  - `web/privacy.html`
  - `web/how-it-works.html`
  - `web/changelog.html`
- Updated homepage navigation links to point to these pages.
