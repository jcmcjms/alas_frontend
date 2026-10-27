/**
 * Mock-mode gate shared by the bootstrap, the login demo panel and the dev
 * scenario switcher.
 *
 * `import.meta.env.DEV` is false in ANY build (it reflects the command, not
 * the mode), so the E2E artifact (`vite build --mode development`) needs a
 * mode-based check: mocks are compiled in for every non-production mode and
 * only when explicitly enabled. Production builds tree-shake all mock code.
 */
declare const __ALAS_MOCKS__: boolean

export const MOCK_MODE_ENABLED: boolean = __ALAS_MOCKS__
