// One deferred entry keeps shared dependencies in the initial app bundle,
// avoiding extra blocking chunks while leaving each screen in its own file.
export { default as ProfileView } from "./ProfileView";
export { default as InformationView } from "./InformationView";
export { default as CustomRecipeView } from "./CustomRecipeView";
