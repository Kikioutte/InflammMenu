import { useState } from "react";
import { HOME_HERO_HEIGHT, HOME_HERO_WEBP_PATH, HOME_HERO_WIDTH } from "./home-hero-image";

export function HomeHeroImage() {
  const [fallback, setFallback] = useState(false);
  return <img className="home-hero__image"
    src={fallback ? `${import.meta.env.BASE_URL}assets/inflamm-hero-bowl.jpg` : `${import.meta.env.BASE_URL}${HOME_HERO_WEBP_PATH}`}
    alt="Bowl de quinoa, pois chiches et légumes rôtis"
    width={HOME_HERO_WIDTH} height={HOME_HERO_HEIGHT} fetchPriority="high"
    onError={() => setFallback(true)} />;
}
