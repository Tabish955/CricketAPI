// Vercel catch-all: makes /api/<anything> work directly as well, so both
// rewritten root paths and literal /api/... calls hit the same handler.
export { default } from '../src/vercel.js';
