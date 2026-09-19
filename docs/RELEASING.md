# Releasing TIQKETS on iOS and Android

This is the operational guide for publishing a new TIQKETS mobile build. The
normal release process is driven by a GitHub Release: publishing one stable
release builds, signs, and submits the same version to both Apple App Store and
Google Play through GitHub Actions and Fastlane.

No Expo account, EAS subscription, app-specific Apple password, or developer
laptop is required. Store credentials and signing keys are company-managed and
stored as encrypted GitHub configuration.

## At a glance

| GitHub Release type | Android destination | iOS destination |
| --- | --- | --- |
| Stable release, for example `v1.1.0` | Google Play production | App Store review, then automatic public release after approval |
| Prerelease, for example `v1.1.0-rc.1` | Google Play internal testing | Internal TestFlight |
| Draft release | No automatic submission | No automatic submission |

The workflow is **Publish mobile apps** in `.github/workflows/mobile-release.yml`.

iOS uses the `macos-26` GitHub runner with Xcode **26.6** pinned. Expo SDK 57
requires Xcode 26.4 or newer; Xcode 26.3 on `macos-15` is unsupported. Validate
native build changes with a full archive on the pinned CI toolchain. A local
framework build using a different Xcode version does not verify the release.
Failed archives retain the full Xcode log in an `ios-diagnostics` artifact.

## Market policy

TIQKETS is distributed publicly in **India only** on both Google Play and the
Apple App Store. Store availability is configured on the app records and is
preserved when GitHub Actions uploads later builds; a normal release must not add
other countries or enable automatic availability in future App Store regions.

## Before every release

1. Confirm all intended changes are merged into the repository's default
   branch and the release checks are passing.
2. Confirm the production API is healthy at
   `https://tiqketsglobal.replit.app`.
3. Decide the next semantic version:
   - Patch, such as `1.0.2` to `1.0.3`, for fixes.
   - Minor, such as `1.0.2` to `1.1.0`, for backward-compatible features.
   - Major, such as `1.0.2` to `2.0.0`, for a major or breaking release.
4. Prepare customer-facing release notes. Store notes must be plain, meaningful,
   and no more than 500 characters.
5. Check running workflows before starting another release. Submissions are
   serialized per platform, so an iOS retry can proceed while Android builds.
6. Confirm both store records still show India as the only public country or
   region. A binary upload should not change this setting, but it is part of the
   release verification checklist.

Do not manually change the iOS build number or Android version code. The workflow
generates a new value for every run. The GitHub tag controls the public marketing
version on both platforms.

## Publish a public release to both stores

1. Open the repository on GitHub:
   `https://github.com/Ashok-BetterBots/Tiqkets-Global`.
2. Open **Releases**, then select **Draft a new release**.
3. Choose **Create new tag** and enter the next stable tag in the exact format
   `vX.Y.Z`, for example `v1.0.3`.
4. Set the release target to the tested commit on the default branch.
5. Enter a clear release title, normally `TIQKETS X.Y.Z`.
6. Add the customer-facing notes. If the GitHub description also needs technical
   details, use the format shown in [Release-note format](#release-note-format).
7. Make sure **Set as a pre-release** is not selected.
8. Select **Publish release**.

Publishing triggers **Actions → Publish mobile apps** automatically. It performs
the following actions:

1. Resolves the immutable commit identified by the published tag.
2. Validates and converts the GitHub Release notes for both stores.
3. Builds and signs an Android App Bundle (`.aab`) on a Linux runner.
4. Uploads the bundle and release notes to the Google Play production track.
5. Builds and signs an iOS archive (`.ipa`) on a macOS runner.
6. Uploads the build to TestFlight, waits for Apple processing, and submits the
   version for App Store review with automatic release enabled.
7. Attaches the signed `.aab` and `.ipa` files to the GitHub Release as retained
   release artifacts.

Keep the Actions page open until both the **android** and **ios** jobs are green.
A successful workflow means the builds were accepted by the store services; it
does not bypass store review.

## Publish a testing release

Use this flow when staff or testers must verify a build before public release.

1. Create a GitHub Release using a tag such as `v1.1.0-rc.1`.
2. Add valid customer-facing Store notes.
3. Select **Set as a pre-release**.
4. Select **Publish release**.

The workflow sends Android to the internal-testing track and iOS to internal
TestFlight. It does not submit either build for public review.

After testing succeeds, create a new stable tag such as `v1.1.0` on the approved
commit and follow the public-release process. Do not rename the prerelease tag.

## Release-note format

If the entire GitHub Release description is 500 characters or fewer, that text
can be used directly. For longer GitHub notes, add a `## Store notes` section.
Only that section is sent to Apple and Google.

```markdown
## Store notes
- Faster queue processing.
- Improved event check-in reliability.
- General stability improvements.

## Engineering
Detailed implementation notes, issue links, and contributor information can go
here. This section remains on GitHub and is not sent to the stores.
```

The workflow stops before building if the Store notes are empty or exceed 500
characters. It never invents or silently truncates release notes.

## Monitor and verify the release

### GitHub Actions

1. Open **Actions → Publish mobile apps**.
2. Open the run created for the release tag.
3. Confirm the **prepare**, **android**, and **ios** jobs succeed.
4. Open the GitHub Release and confirm both signed artifacts are attached.

### Google Play

1. Open Google Play Console and select **TIQKETS**.
2. Open **Test and release → Production**.
3. Confirm the new version is the latest production release.
4. Open **Countries / regions** and confirm the track targets exactly **1 country
   / region: India**. `Rest of World` must not be targeted.
5. During review, monitor **Publishing overview** for required action.
6. After approval, confirm the public listing has an **Install** button for an
   India-based Play account:
   `https://play.google.com/store/apps/details?id=com.tiqkets.app`.

Managed publishing is currently off, so an approved production update becomes
public automatically. Availability can still take time to propagate by region,
account, device compatibility, and Play Store cache.

### Apple App Store

1. Open App Store Connect and select **TIQKETS**.
2. Open the new App Store version and confirm the uploaded build is selected.
3. Open **Pricing and Availability → App Availability** and confirm only
   **India** is selected. **Make your app automatically available in all future
   App Store countries or regions** must remain off.
4. Monitor its status through **Waiting for Review** and **In Review**.
5. Respond to any reviewer message in App Store Connect if Apple requests more
   information.
6. After approval, confirm that the version status is **Ready for Distribution**
   and verify the public App Store listing using an India-based account.

Automatic release is enabled by the workflow, so no manual release button is
normally required after Apple approves the version.

## Retry one platform without creating a new release

If one platform succeeds and the other fails for a temporary reason, do not
publish another tag immediately.

1. Open **Actions → Publish mobile apps**.
2. Select **Run workflow**.
3. Enter the existing GitHub Release tag.
4. Choose `production` or `testing` to match the original release.
5. Choose only the failed platform: `android` or `ios`.
6. Run the workflow and monitor that job.

Only retry when the store did not already accept that build. If the error says a
version or build number was already uploaded, inspect the relevant store first;
re-running creates a new build identifier and may produce an unnecessary build.

For Android only, **Resubmit existing Android bundle** can upload the exact `.aab`
already attached to a stable GitHub Release. Use this when the binary is correct
and only the Play submission needs to be repeated. Choose the existing tag and
the required `internal` or `production` track.

For iOS, **Publish existing iOS build** submits an already signed IPA without
compiling again. Use it after a successful build-only run, not after Apple has
already accepted that build number:

1. Enter the stable release tag and the original **Publish mobile apps** run ID
   (the number after `/actions/runs/` in its URL).
2. Select mode `upload` and destination `testing` or `production`. The workflow checks that the original iOS
   job succeeded, downloads its exact artifact, and verifies the IPA's bundle
   identifier, version, and build number before calling Fastlane.
3. For a draft release, explicitly enable **publish_draft**. After successful
   store submission, the workflow publishes the GitHub draft using its job
   token. This does **not** trigger a second build or submit Android. Use this
   only for an intentional iOS-only release or when Android is handled
   separately.

If Apple accepted the upload but processing timed out or review submission
failed, do not re-upload the same IPA. Run this workflow in **inspect** mode to
read Apple's build/upload diagnostics and App Store version states without
changing anything. Once the build is available, use **resume** mode with the
same tag/run ID. It waits for that exact uploaded version/build, updates the
TestFlight notes, and completes the requested store submission; it does not
upload, download, or build an IPA. A processing timeout alone is not a reason
to generate a new build number. Resolve any Apple processing error first.

The original Actions artifact must still be available for `upload` mode
(30-day retention); `inspect` and `resume` do not need the artifact.

## Build signed artifacts without submitting

This is useful for independent QA or an exceptional manual upload.

1. Create an unpublished draft GitHub Release with a valid tag and release notes.
2. Set its target to the full 40-character commit SHA. Draft releases do not yet
   have a real Git tag, so a branch name is not sufficiently immutable.
3. Open **Actions → Publish mobile apps → Run workflow**.
4. Enter the draft release tag.
5. Select `build` as the destination and choose the required platform(s).

The workflow creates signed artifacts and attaches them to the draft release but
does not contact either store.

## Required company-owned configuration

These values must remain configured under **Repository Settings → Secrets and
variables → Actions**. Maintainers should verify their presence, not reveal or
copy their values into issues, logs, release notes, or source code.

### Secrets

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `MATCH_PASSWORD`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_KEY_BASE64`

### Variables

- `EXPO_PUBLIC_API_URL`
- `APPLE_TEAM_ID`

The Android upload key and Apple signing files are shared company assets. Apple
certificates and profiles are encrypted on the private `codex/signing` branch via
Fastlane Match. Google publishing uses a company service account, and Apple
publishing uses a team App Store Connect API key. The release does not depend on
one employee's computer or personal store session.

At least two authorized company maintainers should retain access to GitHub,
Google Play Console, App Store Connect, and the company password manager. The
password manager should contain recovery copies of the Android signing material,
`MATCH_PASSWORD`, and store API credentials.

## When credentials need maintenance

Normal releases do not require certificate setup. Use **Set up shared Apple
signing** only when an authorized maintainer intentionally creates or renews the
Apple distribution certificate and provisioning profile. Do not use `match nuke`
and do not delete unrelated company certificates.

If Google rejects an upload key, recover the existing company upload keystore or
use Google Play's upload-key reset process. Do not create an unrelated key and
expect Play Console to accept it.

If a store API key is rotated, update the corresponding GitHub secret and make a
safe build or testing run before the next production release.

## Failure checklist

- **Release notes rejected before build:** add a non-empty `## Store notes`
  section containing no more than 500 characters.
- **Invalid tag:** use `vX.Y.Z` for production or `vX.Y.Z-rc.N` for testing.
- **Missing configuration:** have a repository administrator restore the named
  GitHub secret or variable; never place its value in the workflow file.
- **Android native build appears idle:** allow the workflow up to its configured
  90-minute limit. Native CMake compilation can produce little output for several
  minutes. Investigate only if the job fails or reaches the timeout.
- **Google policy rejection:** read the exact policy issue in Play Console and
  correct the binary, listing, or declaration identified there before resubmitting.
- **Apple review rejection:** resolve the item in App Store Connect, create a new
  build if the binary changed, and reply to App Review with concise test details.
- **Only one platform failed:** use the one-platform retry process above.

For signing architecture, recovery instructions, and historical setup details,
see [`../STORE_RELEASE.md`](../STORE_RELEASE.md). For current ownership and client
handoff information, see [`CLIENT_HANDOFF.md`](CLIENT_HANDOFF.md).
