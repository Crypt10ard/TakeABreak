import { createMock } from './mock.js';

/** Bridge to the main process; in a plain browser a mock keeps the pages alive. */
export const api = window.atem ?? createMock();
export const inElectron = Boolean(window.atem);
