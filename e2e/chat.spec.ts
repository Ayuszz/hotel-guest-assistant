import { expect, test, type Page } from "@playwright/test";

function uniqueEmail(tag: string): string {
  return `pw-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function signUp(page: Page, email: string, password = "correct horse battery staple") {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
}

/** The thread sidebar is an off-canvas drawer below the sm breakpoint (mobile project); open it first. */
async function openSidebar(page: Page) {
  const toggle = page.getByLabel("Open threads");
  if (await toggle.isVisible()) await toggle.click();
}

/** Closes the mobile drawer (backdrop tap) after a read-only check, so it doesn't cover the input underneath. */
async function closeSidebar(page: Page) {
  const backdrop = page.getByTestId("sidebar-backdrop");
  if (await backdrop.isVisible()) await backdrop.click();
}

test("unauthenticated visitors are redirected to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong credentials on login show an inline error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody-pw@example.test");
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("auth-error")).toContainText(/incorrect|invalid/i);
  await expect(page).toHaveURL(/\/login$/);
});

/** Runs against the mock LLM provider so the flow is deterministic and needs no API key. Supabase is real. */
test("guest signs up, asks a question, follows up, checks availability, books a room, and sees an error handled", async ({ page }) => {
  await signUp(page, uniqueEmail("flow"));
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

  // 4. Book & pay (simulated) on the first available room
  await card.getByRole("button", { name: /Book & pay/ }).first().click();
  await expect(card.getByTestId("booking-confirmation").first()).toContainText("Booked & paid");

  // 5. The thread now appears in the sidebar, titled from the first message
  await openSidebar(page);
  await expect(page.getByTestId("thread-item").first()).toContainText("What time is check-in?");
  await closeSidebar(page);

  // 6. Backend failure -> graceful error with retry
  await page.route("**/api/chat", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ type: "error", message: "Something went wrong on our side. Please try again.", code: "INTERNAL" }) }));
  await page.getByLabel("Your question").fill("What is the cancellation policy?");
  await page.getByLabel("Your question").press("Enter");
  await expect(page.getByTestId("assistant-error")).toContainText("Something went wrong");
  await page.unroute("**/api/chat");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("assistant-text").last()).toContainText(/48 hours/);

  // 7. Booking shows up on the bookings page
  await openSidebar(page);
  await page.getByRole("link", { name: "My bookings" }).click();
  await expect(page).toHaveURL(/\/bookings$/);
  await expect(page.getByTestId("bookings-list")).toBeVisible();
  await expect(page.getByTestId("booking-item").first()).toContainText("Junior Suite");
  await expect(page.getByTestId("booking-item").first()).toContainText("Paid");
});

test("new chat starts a fresh thread; switching threads reloads its own history", async ({ page }) => {
  await signUp(page, uniqueEmail("threads"));

  await page.getByLabel("Your question").fill("Does the hotel have a swimming pool?");
  await page.getByLabel("Your question").press("Enter");
  await expect(page.getByTestId("assistant-text").first()).toContainText(/pool/i);

  await openSidebar(page);
  await expect(page.getByTestId("thread-item").first()).toBeVisible();
  await page.getByRole("button", { name: "+ New chat" }).click();
  await expect(page.getByTestId("user-message")).toHaveCount(0);

  await page.getByLabel("Your question").fill("Is breakfast included?");
  await page.getByLabel("Your question").press("Enter");
  await expect(page.getByTestId("assistant-text").first()).toContainText(/breakfast/i);
  await openSidebar(page);
  await expect(page.getByTestId("thread-item")).toHaveCount(2);

  // Switch back to the first thread and confirm its own history reloads, not the second thread's.
  await page.getByTestId("thread-item").nth(1).click();
  await expect(page.getByTestId("assistant-text").first()).toContainText(/pool/i);
});

test("signing out returns to the login screen and re-blocks the app", async ({ page }) => {
  await signUp(page, uniqueEmail("signout"));
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("health endpoint reports the provider", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).provider).toBe("mock");
});
