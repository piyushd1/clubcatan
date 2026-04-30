## 2024-04-30 - ARIA Labels for Generic Close Buttons
**Learning:** Found a recurring pattern in the app's components (`DevCardModal`, `RulesModal`, `Chat`, `TradeModal`) where generic close buttons with an "x" icon lacked `aria-label` attributes. This makes them inaccessible to screen readers.
**Action:** Always ensure that icon-only interactive elements like close buttons have an `aria-label` to provide context for screen readers. Added `aria-label="Close"` to the relevant close buttons.
