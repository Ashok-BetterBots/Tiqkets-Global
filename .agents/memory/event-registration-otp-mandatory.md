---
name: Public event registration OTP is mandatory
description: Customer event registration must verify the WhatsApp number between Details and Schedule.
---

Public customer event registration must always follow Details → WhatsApp OTP → Schedule. Event-level OTP settings must not bypass sending, verification, or the final verification-token requirement.

**Why:** The required customer journey explicitly places successful WhatsApp verification after Screen 1 and before Screen 2; a configurable bypass made the OTP screen disappear.

**How to apply:** Keep the public registration send/verify endpoints and final registration handler aligned. Schedule may open only after a valid code returns a verification token for the entered phone.