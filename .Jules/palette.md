## 2025-04-25 - ARIA labels for icon-only close buttons
**Learning:** Found several "×" close buttons without ARIA labels (`DevCardModal`, `RulesModal`, `TradeModal`, `Chat`). This is a common accessibility issue for screen readers.
**Action:** When creating modals or panels with icon-only close buttons, always include `aria-label="Close"`.