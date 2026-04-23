## 2026-04-23 - Consistent A11y on Close Buttons
**Learning:** Found multiple instances of icon-only buttons using '×' across modal components (Chat, RulesModal, DevCardModal, TradeModal) missing accessible names. This is a common pattern in React components where text symbols are used for visual icons without screen reader support.
**Action:** Always verify icon-only buttons (, , ) have appropriate `aria-label` attributes to ensure they are announced correctly by screen readers, rather than reading out 'multiply' or remaining silent.
## 2024-05-15 - Consistent A11y on Close Buttons
**Learning:** Found multiple instances of icon-only buttons using "×" across modal components (Chat, RulesModal, DevCardModal, TradeModal) missing accessible names. This is a common pattern in React components where text symbols are used for visual icons without screen reader support.
**Action:** Always verify icon-only buttons have appropriate `aria-label` attributes to ensure they are announced correctly by screen readers.
