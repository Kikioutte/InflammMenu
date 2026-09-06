import { expect, test, type Page } from "@playwright/test";

async function openHomeAtTwoHundredPercent(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1_000 });
  await page.goto("/");
  await expect(page.locator('[data-testid="home-view"], [data-testid="onboarding-view"]')).toBeVisible();
  const skip = page.getByTestId("onboarding-skip");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.getByTestId("home-view")).toBeVisible();
  await page.evaluate(async () => {
    document.documentElement.style.fontSize = "200%";
    await document.fonts.ready;
  });
}

test("l’accueil et la navigation restent utilisables avec le texte à 200 % @webkit-smoke", async ({ page }) => {
  for (const width of [320, 390]) {
    await openHomeAtTwoHundredPercent(page, width);

    const layout = await page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>('[data-testid="mobile-app-viewport"]')!;
      const hero = document.querySelector<HTMLElement>(".home-hero")!;
      const content = document.querySelector<HTMLElement>(".home-hero__content")!;
      const cta = document.querySelector<HTMLElement>(".home-cta")!;
      const metadata = document.querySelector<HTMLElement>(".home-meta")!;
      const navigation = document.querySelector<HTMLElement>(".bottom-nav")!;
      const bounds = viewport.getBoundingClientRect();
      const rect = (element: HTMLElement) => {
        const value = element.getBoundingClientRect();
        return { left: value.left, right: value.right, top: value.top, bottom: value.bottom };
      };
      return {
        viewport: { left: bounds.left, right: bounds.right, clientWidth: viewport.clientWidth, scrollWidth: viewport.scrollWidth },
        hero: { clientWidth: hero.clientWidth, scrollWidth: hero.scrollWidth },
        content: { clientWidth: content.clientWidth, scrollWidth: content.scrollWidth },
        metadata: { clientWidth: metadata.clientWidth, scrollWidth: metadata.scrollWidth },
        cta: rect(cta),
        navigation: { ...rect(navigation), clientWidth: navigation.clientWidth, scrollWidth: navigation.scrollWidth },
        tabs: [...navigation.querySelectorAll<HTMLElement>("button")].map(rect),
      };
    });

    expect(layout.viewport.scrollWidth).toBeLessThanOrEqual(layout.viewport.clientWidth + 1);
    expect(layout.hero.scrollWidth).toBeLessThanOrEqual(layout.hero.clientWidth + 1);
    expect(layout.content.scrollWidth).toBeLessThanOrEqual(layout.content.clientWidth + 1);
    expect(layout.metadata.scrollWidth).toBeLessThanOrEqual(layout.metadata.clientWidth + 1);
    expect(layout.cta.left).toBeGreaterThanOrEqual(layout.viewport.left - 1);
    expect(layout.cta.right).toBeLessThanOrEqual(layout.viewport.right + 1);
    expect(layout.navigation.scrollWidth).toBeLessThanOrEqual(layout.navigation.clientWidth + 1);
    expect(layout.navigation.left).toBeGreaterThanOrEqual(layout.viewport.left - 1);
    expect(layout.navigation.right).toBeLessThanOrEqual(layout.viewport.right + 1);
    for (const tab of layout.tabs) {
      expect(tab.left).toBeGreaterThanOrEqual(layout.viewport.left - 1);
      expect(tab.right).toBeLessThanOrEqual(layout.viewport.right + 1);
    }

    for (const name of ["Semaine", "Recette", "Courses", "Accueil"]) {
      const tab = page.getByRole("button", { name, exact: true });
      await tab.focus();
      await expect(tab).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(tab).toHaveAttribute("aria-current", "page");
    }
  }
});
