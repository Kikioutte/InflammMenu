import { useRef, useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import responsiveImages from "../data/responsive-images-version.json" with { type: "json" };
import { RECIPE_IMAGE_PLACEHOLDER, recipeImageSrcSet } from "./recipe-image";

export { RECIPE_IMAGE_SIZES } from "./recipe-image";

type RecipeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "sizes" | "onError"> & {
  src: string;
  alt: string;
  sizes: string;
};

/** A source change starts a fresh fallback sequence, without adding a DOM wrapper. */
export function RecipeImage(props: RecipeImageProps) {
  return <RecipeImageSource key={props.src} {...props} />;
}

function RecipeImageSource({ src, sizes, ...props }: RecipeImageProps) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const stageRef = useRef<0 | 1 | 2>(0);
  const responsiveSrcSet = recipeImageSrcSet(src, responsiveImages.version);
  const onError = (event: SyntheticEvent<HTMLImageElement>) => {
    if (stageRef.current === 2 || src === RECIPE_IMAGE_PLACEHOLDER) return;
    const next = stageRef.current === 0 && responsiveSrcSet ? 1 : 2;
    stageRef.current = next;
    // Remove candidates first: changing src alone would retry the failed WebP.
    event.currentTarget.removeAttribute("srcset");
    event.currentTarget.removeAttribute("sizes");
    // Removing srcset selects the original src. Let React alone assign the
    // placeholder: writing src here and again on commit can fetch it twice.
    setStage(next);
  };
  return <img {...props} src={stage === 2 ? RECIPE_IMAGE_PLACEHOLDER : src}
    srcSet={stage === 0 ? responsiveSrcSet : undefined}
    sizes={stage === 0 && responsiveSrcSet ? sizes : undefined}
    onError={onError} />;
}
