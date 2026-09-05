import manifest from "./data/responsive-images.json" with { type: "json" };

// Prefix with import.meta.env.BASE_URL at the call site (root or GitHub Pages).
// This tiny module does not pull the catalogue image allowlist into startup.
export const HOME_HERO_WEBP_PATH = manifest.hero.path;
export const HOME_HERO_WIDTH = manifest.hero.width;
export const HOME_HERO_HEIGHT = manifest.hero.height;
