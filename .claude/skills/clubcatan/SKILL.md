# clubcatan Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `clubcatan` JavaScript codebase. It covers file organization, import/export styles, commit patterns, and testing approaches, providing practical examples and step-by-step workflows for common development tasks.

## Coding Conventions

### File Naming
- Use **PascalCase** for file names.
  - **Example:**  
    ```
    GameBoard.js
    PlayerManager.js
    ```

### Imports
- Use **relative import paths**.
  - **Example:**
    ```javascript
    import { Player } from './Player';
    import { Board } from '../Board';
    ```

### Exports
- Use **named exports**.
  - **Example:**
    ```javascript
    // Player.js
    export function Player() { ... }

    // Usage
    import { Player } from './Player';
    ```

### Commit Patterns
- Commit messages are **freeform** and do not follow a strict prefix system.
- Average commit message length is around 50 characters.

## Workflows

### Adding a New Module
**Trigger:** When creating a new feature or component  
**Command:** `/add-module`

1. Create a new file using PascalCase, e.g., `ResourceManager.js`.
2. Implement your module logic.
3. Use named exports for your functions or classes.
    ```javascript
    // ResourceManager.js
    export function ResourceManager() { ... }
    ```
4. Import your module using a relative path where needed.
    ```javascript
    import { ResourceManager } from './ResourceManager';
    ```
5. Add relevant tests in a corresponding `*.test.*` file.

### Writing Tests
**Trigger:** When adding or updating code that requires testing  
**Command:** `/write-test`

1. Create a test file with the pattern `*.test.*`, e.g., `ResourceManager.test.js`.
2. Write your test cases using the project's preferred (unknown) testing framework.
    ```javascript
    // ResourceManager.test.js
    import { ResourceManager } from './ResourceManager';

    test('should initialize resources', () => {
      // Test logic here
    });
    ```
3. Run the test suite to ensure all tests pass.

### Committing Changes
**Trigger:** When changes are ready to be saved to version control  
**Command:** `/commit-changes`

1. Stage your changes.
2. Write a clear, concise commit message (no strict prefix required).
    ```
    Add resource manager for handling player resources
    ```
3. Commit your changes.

## Testing Patterns

- Test files follow the `*.test.*` naming convention (e.g., `GameBoard.test.js`).
- The specific testing framework is not detected; follow existing patterns in the repository.
- Place tests alongside or near the modules they test.

## Commands

| Command           | Purpose                                           |
|-------------------|---------------------------------------------------|
| /add-module       | Scaffold a new module following conventions       |
| /write-test       | Create and implement a new test file              |
| /commit-changes   | Commit staged changes with a descriptive message  |