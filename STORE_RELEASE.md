# TIQKETS store releases

Create a GitHub Release with a tag such as `v1.0.0` and customer-facing release
notes, then click **Publish release**. The **Publish mobile apps** workflow builds
the tagged commit on GitHub's runners, signs both apps using shared credentials,
attaches the signed AAB and IPA to that same GitHub Release, and submits them.
No developer laptop, Expo account, EAS service, personal Apple session, or personal
GitHub token is needed by the release workflow. Expo remains the app framework;
native builds and store delivery use Fastlane.

| GitHub action | Google Play | Apple |
| --- | --- | --- |
| Publish a normal release | Production submission | Submit for review; automatic release after approval |
| Publish a prerelease | Internal testing | TestFlight, internal testing only |
| Save a draft | No automatic upload | No automatic upload |
| Run workflow manually: build | Signed AAB attached to release | Signed IPA attached to release |

When manually building an unpublished draft, set the release target to the full
40-character commit SHA. GitHub does not create the tag reference until the
draft is published; the immutable SHA lets the workflow build the intended code
without depending on a moving branch.

Publishing a release submits the app; store review, account requirements, and any
managed publishing settings still control when customers can download it. Editing
release notes after publication does not trigger another upload. Use the manual
workflow to retry a failed platform, selecting the same tag and destination.
GitHub prereleases use a suffix such as `v1.0.1-rc.1`; iOS marketing versions use
the numeric part. Every workflow run receives new build numbers.

## Release notes

The GitHub Release body is the source for both stores. Use plain text, up to 500
characters. For longer technical notes, include a section like this:

```markdown
## Store notes
- Faster queue management.
- Improved event check-in.

## Engineering
Longer technical details or GitHub's generated release notes go here.
```

Only the Store notes section is sent to the stores. Simple Markdown is converted
to plain text. Empty or oversized notes stop before a build: they are never
silently shortened or replaced with invented changes. The original GitHub body
is preserved. Publishing through GitHub's UI or `gh release create` triggers the
workflow; a release created by another workflow's default GITHUB_TOKEN does not
trigger a second workflow automatically.

## Company ownership and credentials

- Apple organization: BETTERBOTS AI SOLUTIONS PRIVATE LIMITED, team `FF43UTULMB`.
- Google Play organization: Betterbots Ai Solutions Private Limited.
- Both application identifiers: `com.tiqkets.app`.
- Existing Restaurant Edition (`com.tiqkets.food`) is a separate app.
- GitHub repository: `Ashok-BetterBots/Tiqkets-Global` (must remain private).
- Signing storage: isolated `codex/signing` branch in that repository.

The signing branch contains no application code. Android recovery credentials
are encrypted with AES-256-GCM and a scrypt-derived key. Fastlane Match stores
Apple distribution certificates, private keys, and profiles there in Match's
encrypted format. The encryption password is the `MATCH_PASSWORD` GitHub secret.
During releases, Match is read-only and uses the job's short-lived GitHub token.
The separate **Set up shared Apple signing** workflow can create or renew Apple
credentials after a maintainer starts it. It never revokes unrelated certificates.

Google Play App Signing holds the app-signing key after enrollment; our separate
upload key signs submitted bundles. The Android key and encrypted remote backup
were initialized on September 5, 2026. Do not generate another key after the first
bundle is registered: use recovery or Google's upload-key reset process.

Repository **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
| --- | --- |
| ANDROID_KEYSTORE_BASE64 | Shared Android upload keystore |
| ANDROID_KEYSTORE_PASSWORD | Upload keystore password |
| ANDROID_KEY_ALIAS | Upload signing alias |
| ANDROID_KEY_PASSWORD | Upload key password |
| MATCH_PASSWORD | Signing storage encryption password |
| GOOGLE_PLAY_SERVICE_ACCOUNT_JSON | Company Google service account with TIQKETS release access |
| APP_STORE_CONNECT_KEY_ID | Company Apple team API key ID |
| APP_STORE_CONNECT_ISSUER_ID | Apple team API issuer ID |
| APP_STORE_CONNECT_KEY_BASE64 | Base64-encoded private `.p8` API key |

Repository variables:

| Variable | Value |
| --- | --- |
| EXPO_PUBLIC_API_URL | Confirmed production HTTPS API base URL |
| APPLE_TEAM_ID | FF43UTULMB |

Public store availability is restricted to **India only**. This is an app-record
setting that persists across binary uploads. Google Play production must target
India without `Rest of World`; App Store Connect must list only India and keep
automatic availability in future countries or regions disabled.

Use a company-managed Google service account, enable the Google Play Android
Developer API on its project, and invite its service-account email to Play
Console with permissions limited to this app. The publisher currently has
app-level Admin access for TIQKETS only, not account-wide access.
The configured publisher is
`github-store-release@tiqkets-global-publishing.iam.gserviceaccount.com` in
Google Cloud project `tiqkets-global-publishing`. Its JSON key is installed in
GitHub as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, and
`devops.betterbots@gmail.com` has the Google Cloud permissions needed to manage
the service account and rotate its key without relying on the original creator.
Use an Apple **team API key**, created by an Account Holder/Admin. The key needs
the permissions required for App Store delivery and certificate/profile setup.
Store key files through GitHub Secrets, never in source, release assets, logs, or
chat. Key values cannot be retrieved from GitHub's Secrets UI.

Give at least two company maintainers repository and store access. Keep a second
copy of MATCH_PASSWORD, the Android recovery bundle, and Apple/Google API keys in
the company password manager. Reviewers with repository access can change release
automation, so repository write access is privileged release access. Branch
protections and required reviews should be configured by a repository Admin.

## Recover Android signing on another computer

1. Clone the private signing branch separately:
   `git clone --single-branch --branch codex/signing https://github.com/Ashok-BetterBots/Tiqkets-Global.git tiqkets-signing`
2. Obtain MATCH_PASSWORD from the company password manager and set it in the
   environment securely (not as a literal saved in shell history).
3. From an application checkout, run:
   `node scripts/recover-android-signing.mjs /path/to/tiqkets-signing/android/credentials.json.enc /private/recovery-directory`
4. Recovery authenticates the encrypted archive before writing private files.
   Use the restored keystore for local builds or restore the named GitHub secrets.

The initial local `.release-credentials/android-credentials.json` is a private,
ignored recovery copy containing the keystore, passwords, and MATCH_PASSWORD.
Move its contents into the company vault. It is not needed by GitHub runners.

For iOS, run `bundle exec fastlane match appstore --readonly` with authorized
repository access, MATCH_PASSWORD, Apple team/API settings, and Xcode installed.
Do not use `match nuke` or delete existing company certificates.

## First publication

### Apple setup status — September 9, 2026

- The release maintainer now has Admin and Certificates, Identifiers & Profiles
  access for team `FF43UTULMB`.
- `com.tiqkets.app` is registered as **TIQKETS**, with Push Notifications
  enabled. This does not configure notification delivery credentials by itself.
- App Store Connect record **TIQKETS**, Apple ID `6808904758`, SKU
  `TIQKETS-GLOBAL-IOS`, is bound to `com.tiqkets.app` with full team access.
- The obsolete Apple draft that used `app.replit.tiqkets` was removed by the
  account owner. Apple ID `6808904758` is the only store record used by this
  repository.
- App Store Connect API access is active. Company team key **TIQKETS GitHub
  Releases** (key ID `8TNK58H7YX`) has App Manager access and its issuer, key ID,
  and private key are installed as GitHub Actions secrets. It is not tied to a
  personal Apple session or an app-specific password. Keep the one-time `.p8`
  recovery copy in the company password manager.
- Apple Distribution certificate `5LABDNC357` was issued and verified against
  the locally generated private key. It expires September 5, 2027.
- The App Store profile `match AppStore com.tiqkets.app` includes that certificate
  and the production push-notification entitlement, and expires September 5, 2027.
- The certificate, private key, and profile are encrypted with `MATCH_PASSWORD`
  on `codex/signing` (commit `0b175f8`). A clean recovery into an isolated macOS
  keychain verified the signing identity and profile. GitHub build-only jobs
  restore them without an Apple login; submission still requires the company
  team API key.
- The current signed iOS release build completed successfully from commit
  `235d2eb20f87d438db3989aa7f8fc879a85fe903` in
  [run 33964123854](https://github.com/Ashok-BetterBots/Tiqkets-Global/actions/runs/33964123854).
  Draft release `v1.0.0-rc.2` contains `tiqkets-1.0.0-8.1.ipa`; independent
  verification confirms bundle `com.tiqkets.app`, version `1.0.0` (build `8.1`),
  team-prefixed
  application identifier `FF43UTULMB.com.tiqkets.app`, and a valid code signature.
  The IPA SHA-256 is
  `1fc45d041dccc0e5b9a0a3da2beaec9bfb9946f02cd770fad39431b289df6660`.
- Version `1.0.0` (build `8.1`) was uploaded through Fastlane with the company
  API key, finished Apple processing, and received the GitHub release changelog
  on September 5, 2026. It is **Ready to Test** in the automatically distributed
  **TIQKETS Internal** group (one build, one authorized internal tester). This
  verifies the login-independent TestFlight delivery path.
- Ignored local recovery files remain in `.release-credentials/`. Move a copy to
  the company vault; GitHub Actions does not depend on those local files.

### Public-review status

1. Production API URL `https://tiqketsglobal.replit.app` is verified and stored
   in the `EXPO_PUBLIC_API_URL` GitHub variable.
2. Apple and Google API credentials and signing material are installed. Do not
   run setup again unless rotating or renewing credentials.
3. The corrected Android build completed successfully in GitHub Actions
   ([run 34111367362](https://github.com/Ashok-BetterBots/Tiqkets-Global/actions/runs/34111367362)).
   Draft release `v1.0.1` contains `tiqkets-1.0.1-210939941.aab`; its SHA-256 is
   `5a8ebc744dc700ed896a0e12be339e3691c75090e542bf7299e5710db33c16f5`.
   Independent verification confirms package `com.tiqkets.app` and signer
   `TIQKETS Upload` / BetterBots AI Solutions Private Limited.
4. The bundle is accepted by Play Console as version code `210939941` (version
   `1.0.1`, target SDK 36) and released to the active internal-testing track.
   The **TIQKETS Internal Testers** list currently has one tester. Later releases
   can upload
   through Fastlane after the Google service-account secret is installed.
5. Apple version `1.0` (build `8.1`) was submitted on September 9, 2026 and is
   **Waiting for Review**. Automatic release after approval is enabled.
6. Google Play version `1.0.2` (`211084903`) was published on September 9, 2026.
   The change removing 175 other countries/regions and `Rest of World` is in
   Google review. India remains selected, and the restriction will publish
   automatically after approval because Managed publishing is off.
7. Monitor both reviews and respond to any reviewer questions. No manual release
   action is expected after approval under the current settings.

### Google Play setup status — September 9, 2026

- The default English (United States) store listing is saved and ready to send
  for review. It includes the description, a 512×512 icon, a 1024×500 feature
  graphic, and six ordered 1080×1920 phone screenshots.
- The app is categorized as **Business**. Public support details are
  `hello@tiqkets.in`, `+91 91500 86103`, and `https://www.tiqkets.in`.
- All initial Play setup tasks are complete. The submitted policy
  declarations state that this app has no ads, does not use Advertising ID, is
  not a government app, does not provide regulated financial features, and has
  no health features.
- Permanent organization and event reviewer accounts are saved in the private
  **Sign in details** declaration, and the target audience is **18 and over**.
  The IARC questionnaire was submitted with ratings ranging from All ages/3+ to
  Everyone, and the Data Safety declaration was certified with the verified
  public deletion-information URL.
- A non-personal Google service account now has Admin permission for the TIQKETS
  app only (no account-wide access). Its JSON is installed in GitHub Actions, so
  future GitHub Releases can upload to Play without a personal login.
- Account deletion is available inside both customer and organization settings.
  The public deletion instructions are deployed at
  `https://tiqkets-global-publishing.web.app/account-deletion` from
  `docs/account-deletion.html` using Firebase Hosting in the shared publishing
  project. The URL is verified and saved in the Data Safety draft. Run
  `npx firebase-tools deploy --only hosting --project tiqkets-global-publishing`
  after changing the page.
- Internal release **1.0.1 (210939941)** is available to testers with the GitHub
  Store notes. This build removes broad Android photo/video permissions and uses
  the system photo picker. The track is active with the **TIQKETS Internal
  Testers** list selected; its opt-in URL is
  `https://play.google.com/apps/internaltest/4701748236699726598`.

Six App Store iPhone screenshots are uploaded at Apple’s accepted 1284×2778
size. The next release build is iPhone-only, so an inaccurate stretched iPad set
is not required. Normal releases preserve the screenshots already in App Store
Connect. The artwork should still receive a final human review: images 1 and 3
contain Android status indicators inside iPhone frames.

Apple build `8.1` is submitted for App Store version `1.0`. Permanent reviewer
credentials and contact details are saved privately in App Store Connect.
Content Rights and App Privacy are published, and the submission is **Waiting
for Review**.

## Validation

`npm run test:release` checks notes selection, both-store consistency, limits,
and safe handling of shell-like text. `actionlint` validates workflows and
`bundle exec fastlane lanes` checks the Fastlane configuration. CI runs the same
notes and Fastlane checks without store secrets. Signed builds and real store
uploads remain separate required verification steps.
