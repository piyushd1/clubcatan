## 2025-04-29 - Missing ARIA Labels on Icon Buttons
**Learning:** Found multiple instances where the application's modals used icon-only buttons (`×` for closing, `−` and `+` for trading amounts) without any accessible names, making the interface completely opaque to screen readers in critical interactive paths.
**Action:** Always verify icon-only buttons include descriptive `aria-label`s. Ensure that dynamically generated lists of buttons (like in the TradeModal) include context in their labels (e.g. `aria-label="Decrease Brick offer"`) rather than generic labels.
