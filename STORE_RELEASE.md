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

Use a company-managed Google service account, enable the Google Play Android
Developer API on its project, and invite its service-account email to Play
Console with permissions limited to this app and the required release tracks.
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

### Apple setup status — September 5, 2026

- The release maintainer now has Admin and Certificates, Identifiers & Profiles
  access for team `FF43UTULMB`.
- `com.tiqkets.app` is registered as **TIQKETS Global**, with Push Notifications
  enabled. This does not configure notification delivery credentials by itself.
- App Store Connect record **TIQKETS Global**, Apple ID `6808904758`, SKU
  `TIQKETS-GLOBAL-IOS`, is bound to `com.tiqkets.app` with full team access.
- An existing **TIQKETS** draft, Apple ID `6764407653`, uses
  `app.replit.tiqkets` and SKU `EX1777404717595`. It is not the `com.tiqkets.app`
  record required by this repository. Leave it unchanged until the owner decides
  how to resolve the identity/name conflict; do not upload this project's build
  to that record or silently change the application's bundle identifier.
- App Store Connect API access has not been activated for the company. The
  account holder (`devops@betterbots.in`) must request access at **Users and Access
  → Integrations → App Store Connect API**. After activation, an Admin can create
  the team release key and install it in GitHub Secrets.
- Apple Distribution certificate `5LABDNC357` was issued and verified against
  the locally generated private key. It expires September 5, 2027.
- The App Store profile `match AppStore com.tiqkets.app` includes that certificate
  and the production push-notification entitlement, and expires September 5, 2027.
- The certificate, private key, and profile are encrypted with `MATCH_PASSWORD`
  on `codex/signing` (commit `85f4fd0`). GitHub build-only jobs restore them
  without an Apple login; submission still requires the company team API key.
- Ignored local recovery files remain in `.release-credentials/`. Move a copy to
  the company vault; GitHub Actions does not depend on those local files.

### Remaining steps

1. Production API URL `https://tiqketsglobal.replit.app` is verified and stored
   in the `EXPO_PUBLIC_API_URL` GitHub variable.
2. Install company Google/Apple API credentials in GitHub Secrets. Apple signing
   is already initialized, so do not run setup again unless renewing credentials.
4. Create an explicit tag and a draft GitHub Release with the first release notes.
   Run **Publish mobile apps**, choose that tag, destination `build`, and the desired
   platform. The workflow can build Android before the Google service account is ready.
5. Download the signed AAB from the draft GitHub Release and upload it to Play
   Console manually to initialize the new package and Google Play App Signing.
6. Complete listing assets, contact details, review access, ratings, countries,
   pricing, and privacy/data declarations in both consoles. Use a non-production
   review account; do not put its credentials in Git.
7. Publish a prerelease for internal testing. Once verified, publish a stable
   GitHub Release to submit to both stores.

App Store screenshots are uploaded separately with `bundle exec fastlane ios
screenshots` after review; normal releases preserve the screenshots already in
App Store Connect. The current iOS build enables iPad support, so an appropriate
iPad screenshot set is still needed. The supplied iPhone artwork also needs final
review: images 1 and 3 contain Android status indicators inside iPhone frames.
The Play listing still needs a 512×512 icon and 1024×500 feature graphic.

## Validation

`npm run test:release` checks notes selection, both-store consistency, limits,
and safe handling of shell-like text. `actionlint` validates workflows and
`bundle exec fastlane lanes` checks the Fastlane configuration. CI runs the same
notes and Fastlane checks without store secrets. Signed builds and real store
uploads remain separate required verification steps.
