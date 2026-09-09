import { config } from "dotenv";

// Vitest doesn't load .env files the way Next.js does — do it explicitly
// so tests see the same DATABASE_URL as `npm run dev`.
config({ path: ".env.local" });
config({ path: ".env" });
