# TIQKETS Global client handoff

Prepared on September 5, 2026.

## What is delivered

- Complete application and server source code.
- Fastlane configuration for Android and iOS.
- GitHub Actions release workflow driven by GitHub Releases and their notes.
- Google Play and App Store metadata and screenshots.
- Public account-deletion request page and in-app deletion links for customer,
  organization, and event accounts.
- Shared Android upload signing and Apple distribution signing configuration.
- Verified signed Android App Bundle and iOS IPA in the client delivery package.
- Release, deployment, recovery, and store-publication documentation.

The delivery package intentionally contains no plaintext signing passwords,
private keys, service-account JSON, Apple API key, database credentials, or
production environment secrets.

## Verified release artifacts

### Android

- File: `tiqkets-1.0.0-210771865.aab`
- Package: `com.tiqkets.app`
- Version: `1.0.0` (`210771865`)
- Signer: TIQKETS Upload, BetterBots AI Solutions Private Limited
- SHA-256: `c8e59dc6074a09b54c67afb9eff458002e5d3364c49c18c560d4705e1e8432ce`
- GitHub Actions run: <https://github.com/Ashok-BetterBots/Tiqkets-Global/actions/runs/33964123854>
- Status: published to the active Google Play internal-testing track; the
  **TIQKETS Internal Testers** list contains one authorized tester

### iOS

- File: `tiqkets-1.0.0-8.1.ipa`
- Bundle: `com.tiqkets.app`
- Version: `1.0.0` (`8.1`)
- Team application identifier: `FF43UTULMB.com.tiqkets.app`
- SHA-256: `1fc45d041dccc0e5b9a0a3da2beaec9bfb9946f02cd770fad39431b289df6660`
- GitHub Actions run: <https://github.com/Ashok-BetterBots/Tiqkets-Global/actions/runs/33964123854>
- Status: Ready to Test in the automatically distributed **TIQKETS Internal**
  group and selected for the App Store version; one authorized internal tester
  is enrolled

## Store records

- App Store Connect: **TIQKETS Global**, Apple ID `6808904758`, SKU
  `TIQKETS-GLOBAL-IOS`, bundle `com.tiqkets.app`.
- Google Play: **TIQKETS**, package `com.tiqkets.app`.
- Google Play internal-test opt-in:
  <https://play.google.com/apps/internaltest/4701748236699726598>

The older Apple draft named TIQKETS with Apple ID `6764407653` belongs to bundle
`app.replit.tiqkets` and must not receive this application's build.

## Credentials and ownership

Release credentials are designed for company ownership rather than one laptop:

- Android upload credentials are installed as GitHub Actions secrets and have an
  encrypted recovery copy on the private `codex/signing` branch.
- Apple distribution certificate and App Store provisioning profile are stored
  by Fastlane Match on the private `codex/signing` branch.
- The company App Store Connect team key **TIQKETS GitHub Releases** is installed
  in GitHub Actions with App Manager access. It does not depend on a personal
  Apple login or app-specific password.
- `MATCH_PASSWORD`, the Android recovery material, Apple API key, and Google
  service-account JSON must also be stored in the client's company password
  manager with access for at least two authorized maintainers.
- Never email or place plaintext credential files in the delivery ZIP.

The detailed recovery procedure and the exact GitHub secret names are in
[`STORE_RELEASE.md`](../STORE_RELEASE.md).

## Client actions required before public launch

1. Provide a stable non-production reviewer login and clear review instructions.
2. Store the Apple API `.p8` recovery file and `MATCH_PASSWORD` in the company
   password manager with access for at least two authorized maintainers.
3. Create and authorize a company Google Play service account and install its JSON
   as the `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` GitHub Actions secret.
4. Have an authorized representative accept the IARC terms and complete content
   rating, target audience, Data Safety, and remaining privacy declarations.
5. Deploy the current server commit so the public account-deletion URL returns
   successfully; the available Replit login opened a new personal account and
   does not own the existing deployment.
6. Visually approve the uploaded App Store iPhone screenshots; two supplied
   images contain Android status indicators inside iPhone frames.
7. Approve the prepared Apple privacy attestation and provide review credentials.
8. Test the internal Android build and iOS TestFlight build before publishing the
   stable GitHub Release.

The Google Play account-deletion URL is
`https://tiqketsglobal.replit.app/account-deletion`. Deploy the current server
commit and verify this URL before saving the Data Safety form.

## Normal release process

1. Merge approved changes to the release commit.
2. Create a GitHub Release with customer-facing notes. For an unpublished draft,
   set the target to the full 40-character release commit SHA; publishing creates
   the version tag.
3. Use a GitHub prerelease for internal testing or a stable release for production.
4. GitHub Actions builds the tagged commit, applies shared signing, attaches the
   AAB and IPA, and sends the same release notes through Fastlane.
5. Confirm each store's processing and review state.

Publishing remains subject to Apple and Google account requirements and review.

## Documentation index

- [`STORE_RELEASE.md`](../STORE_RELEASE.md): store automation, signing recovery,
  current publication status, and operational procedure.
- [`STORE_METADATA_DRAFT.md`](../STORE_METADATA_DRAFT.md): listing text and
  remaining metadata decisions.
- [`DEPLOYMENT.md`](../DEPLOYMENT.md): server deployment instructions.
- [`LIGHTSAIL_DEPLOY.md`](../LIGHTSAIL_DEPLOY.md): AWS Lightsail deployment.
- [`design_guidelines.md`](../design_guidelines.md): application design guidance.
