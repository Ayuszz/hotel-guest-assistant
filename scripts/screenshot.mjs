import { chromium, devices } from "@playwright/test";
const base = process.env.BASE_URL ?? "http://localhost:3300";
const b = await chromium.launch();
for (const [name, ctx] of [["desktop", { viewport: { width: 1280, height: 800 } }], ["mobile", devices["Pixel 7"]]]) {
  const c = await b.newContext(ctx); const p = await c.newPage();
  await p.goto(base);
  await p.getByLabel("Your question").fill("Is breakfast included?"); await p.keyboard.press("Enter");
  await p.getByTestId("assistant-text").first().waitFor();
  await p.getByLabel("Your question").fill("Do you have rooms available?"); await p.keyboard.press("Enter");
  const f = p.getByTestId("availability-form"); await f.waitFor();
  const d = f.locator('input[type="date"]'); await d.nth(0).fill("2026-10-10"); await d.nth(1).fill("2026-10-12"); await f.locator('input[type="number"]').fill("3");
  await f.getByRole("button", { name: "Check" }).click();
  await p.getByTestId("availability-card").waitFor();
  await p.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: false });
  await c.close();
}
await b.close();
