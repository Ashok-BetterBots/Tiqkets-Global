# TIQKETS Global client handoff

Prepared on September 5, 2026.

## What is delivered

- Complete application and server source code.
- Fastlane configuration for Android and iOS.
- GitHub Actions release workflow driven by GitHub Releases and their notes.
- Google Play and App Store metadata and screenshots.
- Shared Android upload signing and Apple distribution signing configuration.
- Verified signed Android App Bundle and iOS IPA in the client delivery package.
- Release, deployment, recovery, and store-publication documentation.

The delivery package intentionally contains no plaintext signing passwords,
private keys, service-account JSON, Apple API key, database credentials, or
production environment secrets.

## Verified release artifacts

### Android

- File: `tiqkets-1.0.0-210753775.aab`
- Package: `com.tiqkets.app`
- Version: `1.0.0` (`210753775`)
- Signer: TIQKETS Upload, BetterBots AI Solutions Private Limited
- SHA-256: `f74b98d63ed22e31b960c6074b7c89a7d897692f7bf7207b988236f7825696ed`
- GitHub Actions run: <https://github.com/Ashok-BetterBots/Tiqkets-Global/actions/runs/33950563282>
- Status: published to Google Play internal testing

### iOS

- File: `tiqkets-1.0.0-4.1.ipa`
- Bundle: `com.tiqkets.app`
- Version: `1.0.0` (`4.1`)
- Team application identifier: `FF43UTULMB.com.tiqkets.app`
- SHA-256: `2b4fb77545e514b2d44bf40d42fb6654e2e48e7b0960529f74ed41e636e34d1e`
- GitHub Actions run: <https://github.com/Ashok-BetterBots/Tiqkets-Global/actions/runs/33953307577>
- Status: signed and ready for App Store upload after API access is enabled

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
- `MATCH_PASSWORD`, the Android recovery material, Apple API key, and Google
  service-account JSON must also be stored in the client's company password
  manager with access for at least two authorized maintainers.
- Never email or place plaintext credential files in the delivery ZIP.

The detailed recovery procedure and the exact GitHub secret names are in
[`STORE_RELEASE.md`](../STORE_RELEASE.md).

## Client actions required before public launch

1. Add the client's Google accounts to an internal-testing email list.
2. Provide a stable non-production reviewer login and clear review instructions.
3. Have the Apple Account Holder request App Store Connect API access, then create
   a company API key and install its three values as GitHub Actions secrets.
4. Create and authorize a company Google Play service account and install its JSON
   as the `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` GitHub Actions secret.
5. Have an authorized representative accept the IARC terms and complete content
   rating, target audience, Data Safety, and remaining privacy declarations.
6. Supply corrected App Store iPhone screenshots and the required iPad set.
7. Complete Apple review contact information, privacy answers, age rating,
   countries, pricing, and review credentials.
8. Test the internal Android build and iOS TestFlight build before publishing the
   stable GitHub Release.

## Normal release process

1. Merge approved changes to the release commit.
2. Create a version tag and GitHub Release with customer-facing notes.
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

