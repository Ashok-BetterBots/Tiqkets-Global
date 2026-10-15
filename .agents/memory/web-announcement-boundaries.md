---
name: Web announcement boundaries
description: Approved web-only audio scope, browser tab exclusivity limits, and remote selection revocation constraints.
---

Web dashboard playback must remain separate from mobile playback and the dedicated speaker page. The branch Audio announcement master is shared across mobile and web; browser Enable permission is still local. The same selected account may announce on both mobile and web; changing that requires separate approval.

**Why:** The user initially approved web-only playback, and later explicitly required the single branch master to sync across mobile and web. This does not change announcer selection, audio wording/timing, or the dedicated speaker page.

**How to apply:** Do not turn browser-tab ownership into account-wide or device-wide suppression. Preserve live queue updates independently of local sound enablement.

Browser tab ownership is limited to the same origin and browser profile. Different browsers, private profiles and different origins cannot coordinate through browser-native tab locks.

**Why:** The approved implementation uses browser-only coordination, not a server device lease. Calling this computer-wide exclusivity would overstate what browsers can guarantee.

**How to apply:** Explain this limit when discussing duplicate sound. True cross-browser or mobile/web exclusivity needs separately approved server/device selection work.

Remote announcer changes have no existing push notification dedicated to selection revocation. Local logout/branch changes can stop immediately; remote changes must be detected through existing read APIs.

**Why:** The user prohibited server changes. Instant remote revocation cannot be promised by a web-only implementation using the current stream.

**How to apply:** Keep audio eligibility checks separate from queue state, fail closed when access cannot be verified, and disclose polling/network/background-tab latency rather than claiming instantaneous remote detection.

Keep the web announcer section minimal: controls and status, with attention warnings only. Do not restore the normal announcement transcript, keep-awake guidance or voice/test details panel. Missing speech is an exception: show the unspoken wording once as fallback information.

**Why:** The user explicitly requested this reduced display while retaining warnings and information for staff when no suitable speech voice exists.

**How to apply:** Preserve voice checking, English fallback, wake lock, tab ownership and Test behavior even when their explanatory UI is hidden.
