import manifest from "./data/responsive-images.json" with { type: "json" };

/** Only reviewed local JPEGs have a generated thumbnail. Keep other images as-is. */
export function recipeThumbnailFor(image: string, generatedImages: ReadonlySet<string>): string | undefined {
  const match = /^(\/(?:InflammMenu\/)?)(?:assets\/recipes\/generated\/)([a-z0-9]+(?:-[a-z0-9]+)*\.jpg)$/.exec(image);
  if (!match || match[0] !== image || !generatedImages.has(match[2])) return undefined;
  return `${match[1]}${manifest.thumbnail.directory}/${match[2].replace(/\.jpg$/, ".webp")}`;
}
