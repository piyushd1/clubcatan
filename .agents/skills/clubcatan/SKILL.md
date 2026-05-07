```markdown
# clubcatan Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `clubcatan` JavaScript codebase. It covers file naming, import/export styles, commit message conventions, and testing patterns. By following these guidelines, contributors can maintain consistency and quality across the project.

## Coding Conventions

### File Naming
- Use **kebab-case** for all file names.
  - Example: `game-board.js`, `player-actions.js`

### Import Style
- Use **relative imports** for all modules.
  - Example:
    ```javascript
    import { getPlayerScore } from './player-score.js';
    ```

### Export Style
- Use **named exports** instead of default exports.
  - Example:
    ```javascript
    // In player-score.js
    export function getPlayerScore(player) { ... }
    ```

### Commit Messages
- Use **conventional commits** with a focus on the `perf` prefix for performance-related changes.
  - Example:
    ```
    perf: optimize resource allocation in game engine
    ```
- Average commit message length is around 74 characters.

## Workflows

### Performance Improvement
**Trigger:** When making changes to improve performance.
**Command:** `/perf-improvement`

1. Identify performance bottlenecks in the codebase.
2. Refactor or optimize the relevant code.
3. Write a commit message starting with `perf:`.
4. Ensure all tests pass before pushing changes.

### Adding a New Module
**Trigger:** When introducing a new feature or module.
**Command:** `/add-module`

1. Create a new file using kebab-case (e.g., `new-feature.js`).
2. Use named exports for all functions or constants.
3. Import dependencies using relative paths.
4. Write corresponding tests in a file named `new-feature.test.js`.
5. Commit changes with a conventional commit message.

## Testing Patterns

- Test files follow the pattern `*.test.*` (e.g., `game-board.test.js`).
- The specific testing framework is unknown; follow existing patterns in test files.
- Place tests alongside the modules they test or in a dedicated test directory as per project structure.

## Commands
| Command           | Purpose                                             |
|-------------------|-----------------------------------------------------|
| /perf-improvement | Start a performance optimization workflow           |
| /add-module       | Guide for adding a new module with proper patterns  |
```
