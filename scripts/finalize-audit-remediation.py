#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path): return (ROOT / path).read_text(encoding="utf-8")
def write(path, text): (ROOT / path).write_text(text, encoding="utf-8")
def once(text, old, new, label):
    count = text.count(old)
    if count != 1: raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)

def between(text, start, end, new, label):
    a = text.find(start)
    if a < 0: raise RuntimeError(f"{label}: start not found")
    b = text.find(end, a)
    if b < 0: raise RuntimeError(f"{label}: end not found")
    return text[:a] + new.rstrip() + "\n" + text[b:]

prototype = read("src/Prototype.tsx")
prototype = once(prototype, 'if (!recipe.id.startsWith("perso-") && current.customRecipes.length >= 200) {\n              setAppNotice("La limite de 200 recettes personnelles est atteinte. Supprimez une recette inutilisée avant d’en créer une autre.");\n              return;\n            }', 'if (current.customRecipes.length >= 200) {\n              route.push({\n                id: "custom-limit", title: "Limite atteinte", headerHeight: 56,\n                header: (noticeRoute) => <Header title="Recettes personnelles" onBack={noticeRoute.pop} />,\n                render: () => <MobileScroll className="app-screen"><main className="page-content pushed-page"><p className="notice-banner" role="alert">La limite de 200 recettes personnelles est atteinte. Supprimez une recette inutilisée avant d’en créer une autre.</p></main></MobileScroll>,\n              });\n              return;\n            }', "custom recipe limit notice")
prototype = once(prototype, 'setAppNotice("Cette recette est encore utilisée dans une semaine. Remplacez-la dans le menu avant de la supprimer.");\n        return;', 'route.push({\n          id: "custom-delete-blocked", title: "Suppression impossible", headerHeight: 56,\n          header: (noticeRoute) => <Header title="Recette utilisée" onBack={noticeRoute.pop} />,\n          render: () => <MobileScroll className="app-screen"><main className="page-content pushed-page"><p className="notice-banner" role="alert">Cette recette est encore utilisée dans une semaine. Remplacez-la dans le menu avant de la supprimer.</p></main></MobileScroll>,\n        });\n        return;', "custom delete notice")

new_roll = '''    const rollPlans = () => {
      const today = isoDate(new Date());
      setAppState((current) => {
        const activeCurrent = current.currentPlan && !isPlanExpired(current.currentPlan, today) ? current.currentPlan : null;
        const expiredCurrent = current.currentPlan && !activeCurrent ? current.currentPlan : null;
        const expiredUpcoming = current.upcomingPlan && isPlanExpired(current.upcomingPlan, today) ? current.upcomingPlan : null;
        const upcomingReady = current.upcomingPlan && !expiredUpcoming && planDayOffset(current.upcomingPlan, today) >= 0
          ? current.upcomingPlan
          : null;
        const promoted = !activeCurrent ? upcomingReady : null;
        if (!expiredCurrent && !expiredUpcoming && !promoted) return current;

        const archived = [expiredCurrent, expiredUpcoming].filter((plan): plan is WeeklyPlan => Boolean(plan));
        if (expiredCurrent || expiredUpcoming) setArchivedWeek(expiredCurrent ?? expiredUpcoming);
        const archivedIds = new Set(archived.map((plan) => plan.id));
        return {
          ...current,
          currentPlan: activeCurrent ?? promoted,
          upcomingPlan: promoted || expiredUpcoming ? null : current.upcomingPlan,
          history: [...archived, ...current.history.filter((plan) => !archivedIds.has(plan.id))].slice(0, HISTORY_LIMIT),
          checkedShoppingItemIds: expiredCurrent || promoted ? [] : current.checkedShoppingItemIds,
        };
      });
    };
'''
prototype = between(prototype, "    const rollPlans = () => {", "    rollPlans();", new_roll, "date rollover")

prototype = once(prototype, '''  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  };''', '''  const install = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      // The browser can withdraw the prompt between display and activation.
    } finally {
      setInstallPrompt(null);
    }
  };''', "install prompt rejection")

prototype = once(prototype, '''  const enableReminders = async () => {
    if (typeof Notification === "undefined") { setPermission("unsupported"); return; }
    const result = await Notification.requestPermission();
    setPermission(result);
    onReminders(result === "granted");
  };''', '''  const enableReminders = async () => {
    if (typeof Notification === "undefined") { setPermission("unsupported"); return; }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      onReminders(result === "granted");
    } catch {
      setPermission("default");
      onReminders(false);
    }
  };''', "notification permission rejection")

prototype = once(prototype, '''    remindedOn.current = today;
    new Notification("À lancer ce soir", {
      body: due.map((item) => `${item.recipe.title} — ${formatRecipeDuration(item.minutes)} de repos`).join("\\n"),
      tag: `inflamm-menu-${today}`,
    });''', '''    try {
      new Notification("À lancer ce soir", {
        body: due.map((item) => `${item.recipe.title} — ${formatRecipeDuration(item.minutes)} de repos`).join("\\n"),
        tag: `inflamm-menu-${today}`,
      });
      remindedOn.current = today;
    } catch {
      // A revoked or platform-level permission must not break the application.
    }''', "notification constructor")

prototype = once(prototype, '''        const order: typeof mode[] = ["favorites", "catalogue", "history"];
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const next = order[(order.indexOf(mode) + step + order.length) % order.length];''', '''        const order: typeof mode[] = ["favorites", "catalogue", "history"];
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        const next = event.key === "Home"
          ? order[0]
          : event.key === "End"
            ? order[order.length - 1]
            : step
              ? order[(order.indexOf(mode) + step + order.length) % order.length]
              : null;
        if (!next) return;
        event.preventDefault();''', "tab Home End")

write("src/Prototype.tsx", prototype)

sw_test = read("tests/service-worker.test.mjs")
old = '  assert.match(precache, /url\\\\\\\\\\\\\(/);'
if old in sw_test:
    sw_test = sw_test.replace(old, '  assert.ok(precache.includes("matchAll(/url\\\\("));')
else:
    # Replace whichever heavily escaped form the generator produced.
    lines = sw_test.splitlines()
    lines = ['  assert.ok(precache.includes("matchAll(/url\\\\("));' if 'assert.match(precache' in line and 'url' in line else line for line in lines]
    sw_test = "\n".join(lines) + ("\n" if sw_test.endswith("\n") else "")
write("tests/service-worker.test.mjs", sw_test)

print("Final remediation adjustments applied.")
