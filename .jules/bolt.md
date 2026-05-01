
## 2026-05-01 - Avoid Object.values() for Fixed-Schema Objects
**Learning:** Using `Object.values(obj).reduce(...)` on fixed-schema objects (like Catan's resources: brick, lumber, wool, grain, ore) incurs massive overhead due to array allocation and callback execution. In hot paths like resource calculation, this pattern causes a measurable performance drop (~33x slower in local benchmarks compared to direct property access).
**Action:** When calculating totals for objects with a known, fixed schema, write a fast helper function that directly sums the properties (e.g., `(r.brick || 0) + (r.lumber || 0) ...`). Avoid `Object.values()` and `reduce()` in frequently executed code paths.
