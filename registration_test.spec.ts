import { test, expect } from '@playwright/test';

test('Registration Page Behavior Test', async ({ page }) => {
  const url = 'http://localhost:5000/event/dfae3ff7-dc81-497c-95a8-fc32ea943897/701ea6c5-ea96-430f-a9d9-91e151bc4fc2';
  
  console.log('Navigating to:', url);
  await page.goto(url);
  
  // 1. View event details link/button
  console.log('--- Check 1: View event details ---');
  const viewDetails = page.getByRole('button', { name: /View event details/i }).or(page.getByText(/View event details/i));
  if (await viewDetails.isVisible()) {
      console.log('View details button found');
      await viewDetails.click();
      
      const modal = page.locator('.modal, [role="dialog"], .bottom-sheet').first();
      // Wait for modal content
      await expect(page.getByText(/About this event/i).or(page.getByText(/Gallery/i)).or(page.getByText(/Venue Map/i))).toBeVisible();
      console.log('Modal opened with expected content');
      
      // Close modal - look for close button or click outside
      const closeBtn = page.getByRole('button', { name: /close/i }).or(page.locator('button').filter({ hasText: 'X' }));
      if (await closeBtn.isVisible()) {
          await closeBtn.click();
          console.log('Modal closed via button');
      } else {
          await page.mouse.click(10, 10); // Click outside
          console.log('Clicked outside to close');
      }
  } else {
      console.log('View event details button NOT found');
  }

  // 2. Time-slot grid: no "Past" or "Full" labels
  console.log('--- Check 2: Time-slot grid labels ---');
  const slots = page.locator('.time-slot, .slot-grid-item'); // adjust based on common patterns
  const pastLabels = page.getByText(/Past/i);
  const fullLabels = page.getByText(/Full/i);
  
  const pastCount = await pastLabels.count();
  const fullCount = await fullLabels.count();
  
  console.log('Past labels found:', pastCount);
  console.log('Full labels found:', fullCount);
  
  if (pastCount === 0 && fullCount === 0) {
      console.log('No Past or Full labels visible');
  }

  // 3. Form interaction
  console.log('--- Check 3: Form Interaction ---');
  // Select Location
  const locationSelector = page.locator('select, .location-picker');
  if (await locationSelector.isVisible()) {
      await locationSelector.selectOption('edc6ce35-b234-43c7-955a-a32b57919d14');
  } else {
      // Maybe it's a list of buttons
      const mainStage = page.getByText('Main Stage');
      if (await mainStage.isVisible()) await mainStage.click();
  }
  
  // Pick future date/slot
  const futureSlot = page.locator('.time-slot:not(.disabled)').first();
  if (await futureSlot.isVisible()) await futureSlot.click();

  // Fill fields
  await page.getByLabel(/Full name/i).or(page.locator('input[name*="name"]')).fill('John Doe');
  await page.getByLabel(/WhatsApp/i).or(page.locator('input[name*="whatsapp"]')).fill('9876543210');
  await page.getByLabel(/T-Shirt Size/i).or(page.locator('input[placeholder*="T-Shirt"]')).fill('L');
  
  // Checkbox field
  const checkbox = page.locator('input[type="checkbox"]').first();
  if (await checkbox.isVisible()) {
      const isCheckedBefore = await checkbox.isChecked();
      await checkbox.click();
      const isCheckedAfter = await checkbox.isChecked();
      console.log('Checkbox toggled from', isCheckedBefore, 'to', isCheckedAfter);
  }

  // 4. Max Guests Stepper
  console.log('--- Check 4: Family members joining you stepper ---');
  const plusBtn = page.locator('button').filter({ hasText: '+' }).or(page.locator('[aria-label*="increment"]'));
  const guestCount = page.locator('.guest-count, .stepper-value');
  
  if (await plusBtn.isVisible()) {
      for (let i = 0; i < 5; i++) {
          if (await plusBtn.isEnabled()) {
              await plusBtn.click();
          } else {
              console.log('Plus button disabled at attempt', i);
              break;
          }
      }
      const finalCount = await guestCount.innerText();
      console.log('Final family member count:', finalCount);
  }

  // 5. Register button enabled
  console.log('--- Check 5: Register button enabled ---');
  const registerBtn = page.getByRole('button', { name: /Register/i });
  const isEnabled = await registerBtn.isEnabled();
  console.log('Register button enabled:', isEnabled);

  // Console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
  });
});
