import { test, expect } from "@playwright/test";

/*
 * This is intentionally an authenticated, non-destructive smoke check.
 *
 * Set these variables to a dedicated event-staff account before running:
 *   EVENT_STAFF_TEST_EMAIL
 *   EVENT_STAFF_TEST_PASSWORD
 * Optionally set E2E_BASE_URL (defaults to the Expo web preview) and
 * EVENT_STAFF_TEST_EVENT_ID when the account has more than one event.
 *
 * The test does not submit the form. The two request guards below make that
 * invariant explicit: a future accidental submit cannot create a registration
 * or send a WhatsApp message from this check.
 */
const staffEmail = process.env.EVENT_STAFF_TEST_EMAIL;
const staffPassword = process.env.EVENT_STAFF_TEST_PASSWORD;
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:8081";
const eventId = process.env.EVENT_STAFF_TEST_EVENT_ID;

test.describe("event staff manual registration on a phone-sized preview", () => {
  test.skip(
    !staffEmail || !staffPassword,
    "Set EVENT_STAFF_TEST_EMAIL and EVENT_STAFF_TEST_PASSWORD to run the safe event-staff check.",
  );

  test.use({
    baseURL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });

  test("opens the registration sheet without creating or messaging an attendee", async ({
    page,
  }) => {
    let registrationAttempted = false;
    let whatsappAttempted = false;

    await page.route(
      "**/api/dashboard/events/registrations/manual",
      async (route) => {
        registrationAttempted = true;
        await route.fulfill({
          status: 418,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Blocked by the non-destructive mobile smoke check",
          }),
        });
      },
    );
    await page.route("**/*whatsapp*", async (route) => {
      whatsappAttempted = true;
      await route.abort();
    });

    await page.goto("/");

    const organizationLogin = page.getByTestId("button-org-login");
    if (await organizationLogin.isVisible().catch(() => false)) {
      await organizationLogin.click();
    }

    await page.getByPlaceholder("Enter your email").fill(staffEmail!);
    await page.getByPlaceholder("Enter your password").fill(staffPassword!);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();

    const addCustomer = page.getByTestId("button-add-customer");
    await expect(addCustomer).toBeVisible({ timeout: 30_000 });

    if (eventId) {
      const eventSelector = page.getByTestId("button-event-selector");
      await eventSelector.click();
      if (
        await page
          .getByTestId(`modal-item-${eventId}`)
          .isVisible()
          .catch(() => false)
      ) {
        await expect(page.getByTestId(`modal-item-${eventId}`)).toBeVisible();
        await page.getByTestId(`modal-item-${eventId}`).click();
      }
    }

    await addCustomer.click();
    const sheet = page.getByTestId("manual-reg-sheet");
    const scroll = page.getByTestId("manual-reg-scroll");
    await expect(sheet).toBeVisible();
    await expect(page.getByText("Add Customer", { exact: true })).toBeVisible();
    await expect(page.getByTestId("input-manual-reg-name")).toBeVisible({
      timeout: 15_000,
    });

    const sheetBox = await sheet.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(sheetBox!.height).toBeGreaterThan(844 * 0.7);
    expect(sheetBox!.height).toBeLessThan(844 * 0.8);

    const initialScroll = await scroll.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }));
    expect(initialScroll.scrollHeight).toBeGreaterThan(
      initialScroll.clientHeight,
    );

    // The generated-ticket option is the safe default for a new registration.
    await expect(
      page.getByTestId("button-ticket-method-generate"),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      page.getByTestId("button-ticket-method-preprinted"),
    ).toHaveAttribute("aria-checked", "false");

    // Payment controls live inside the scrollable sheet body and are reachable
    // on a phone viewport rather than being clipped behind the footer.
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect(page.getByTestId("manual-reg-payment")).toBeVisible();
    await expect(page.getByTestId("manual-reg-footer")).toBeVisible();
    await expect(
      page.getByTestId("button-payment-mode-offline_paid"),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("input-amount-collected")).toBeVisible();
    await expect(page.getByText("Fully paid", { exact: true })).toBeVisible();

    // Switching treatment still exposes its required explanation field.
    await page.getByTestId("button-payment-mode-complimentary").click();
    await expect(page.getByTestId("input-payment-reason")).toBeVisible();
    await page.getByTestId("button-payment-mode-offline_paid").click();

    // Exercise the pre-printed path and confirm the manual fallback field is
    // available even when native camera access is not.
    await page.getByTestId("button-ticket-method-preprinted").click();
    await expect(page.getByTestId("input-preprinted-ticket")).toBeVisible();
    await page.getByTestId("button-scan-preprinted-ticket").click();
    await expect(
      page.getByText(
        "Camera scanning is unavailable here. Enter the printed ticket ID instead.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByTestId("input-preprinted-ticket").fill("ptk-mobile-smoke");
    await expect(page.getByTestId("input-preprinted-ticket")).toHaveValue(
      "PTK-MOBILE-SMOKE",
    );

    // No action above is allowed to perform either side effect.
    expect(registrationAttempted).toBe(false);
    expect(whatsappAttempted).toBe(false);
  });
});
