import { expect, test } from "@playwright/test";

/** Runs against the mock LLM provider so the flow is deterministic and needs no API key. */
test("guest asks a question, follows up, checks availability, and sees an error handled", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Marigold Bay Hotel" })).toBeVisible();

  // 1. Ask a hotel question
  await page.getByLabel("Your question").fill("What time is check-in?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("user-message").first()).toHaveText("What time is check-in?");
  await expect(page.getByTestId("assistant-text").first()).toContainText("15:00");

  // 2. Follow-up in the same conversation
  await page.getByLabel("Your question").fill("Is breakfast included?");
  await page.getByLabel("Your question").press("Enter");
  await expect(page.getByTestId("assistant-text").nth(1)).toContainText(/breakfast/i);

  // 3. Availability without dates -> clarification form -> tool result card
  await page.getByLabel("Your question").fill("Do you have rooms available?");
  await page.getByLabel("Your question").press("Enter");
  const form = page.getByTestId("availability-form");
  await expect(form).toBeVisible();
  const dates = form.locator('input[type="date"]');
  await dates.nth(0).fill("2030-03-10");
  await dates.nth(1).fill("2030-03-12");
  await form.locator('input[type="number"]').fill("3");
  await form.getByRole("button", { name: "Check" }).click();
  const card = page.getByTestId("availability-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Junior Suite");
  await expect(card).toContainText("2 nights");

  // 4. Backend failure -> graceful error with retry
  await page.route("**/api/chat", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ type: "error", message: "Something went wrong on our side. Please try again.", code: "INTERNAL" }) }));
  await page.getByLabel("Your question").fill("What is the cancellation policy?");
  await page.getByLabel("Your question").press("Enter");
  await expect(page.getByTestId("assistant-error")).toContainText("Something went wrong");
  await page.unroute("**/api/chat");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("assistant-text").last()).toContainText(/48 hours/);
});

test("health endpoint reports the provider", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).provider).toBe("mock");
});
