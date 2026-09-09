# TIQKETS client handoff

Prepared on September 9, 2026.

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

- File: `tiqkets-1.0.2-211084903.aab`
- Package: `com.tiqkets.app`
- Version: `1.0.2` (`211084903`)
- Signer: TIQKETS Upload, BetterBots AI Solutions Private Limited
- SHA-256: `630cf1b08732b75f7ad1bb3eaf97d6f25f765c4142f270fb0aa78f8b70d7fcdd`
- Build run: <https://github.com/Ashok-BetterBots/Tiqkets-Global/actions/runs/34304216486>
- Submission run: <https://github.com/Ashok-BetterBots/Tiqkets-Global/actions/runs/34308212333>
- Status: submitted to Google Play production review for full rollout in 177
  countries and regions. Version 1.0.2 replaces the rejected 1.0.1 launcher
  icon with the TIQKETS ticket artwork that matches the store listing.

### iOS

- File: `tiqkets-1.0.0-8.1.ipa`
- Bundle: `com.tiqkets.app`
- Version: `1.0.0` (`8.1`)
- Team application identifier: `FF43UTULMB.com.tiqkets.app`
- SHA-256: `1fc45d041dccc0e5b9a0a3da2beaec9bfb9946f02cd770fad39431b289df6660`
- GitHub Actions run: <https://github.com/Ashok-BetterBots/Tiqkets-Global/actions/runs/33964123854>
- Status: App Store version `1.0` is **Waiting for Review** with automatic
  release after approval; the build remains available in **TIQKETS Internal**

## Store records

- App Store Connect: **TIQKETS**, Apple ID `6808904758`, SKU
  `TIQKETS-GLOBAL-IOS`, bundle `com.tiqkets.app`.
- Google Play: **TIQKETS**, package `com.tiqkets.app`.
- Google Play internal-test opt-in:
  <https://play.google.com/apps/internaltest/4701748236699726598>

The obsolete Apple draft that used `app.replit.tiqkets` was removed by the
account owner. Apple ID `6808904758` is the release record for this repository.

## Credentials and ownership

Release credentials are designed for company ownership rather than one laptop:

- Android upload credentials are installed as GitHub Actions secrets and have an
  encrypted recovery copy on the private `codex/signing` branch.
- Apple distribution certificate and App Store provisioning profile are stored
  by Fastlane Match on the private `codex/signing` branch.
- The company App Store Connect team key **TIQKETS GitHub Releases** is installed
  in GitHub Actions with App Manager access. It does not depend on a personal
  Apple login or app-specific password.
- Google Play publishing uses the non-personal service account
  `github-store-release@tiqkets-global-publishing.iam.gserviceaccount.com` in
  project `tiqkets-global-publishing`. Its key is installed in GitHub Actions,
  it has Admin access to TIQKETS only (not account-wide access), and
  `devops.betterbots@gmail.com` can
  manage the service account and rotate the key.
- `MATCH_PASSWORD`, the Android recovery material, Apple API key, and Google
  service-account JSON must also be stored in the client's company password
  manager with access for at least two authorized maintainers.
- Never email or place plaintext credential files in the delivery ZIP.

The detailed recovery procedure and the exact GitHub secret names are in
[`STORE_RELEASE.md`](../STORE_RELEASE.md).

## Review and launch follow-up

1. Keep the two permanent reviewer accounts active; both are now saved privately
   in Apple and Google with role-specific navigation instructions.
2. Store the Apple API `.p8` recovery file and `MATCH_PASSWORD` in the company
   password manager with access for at least two authorized maintainers.
3. Store a recovery copy of the Google service-account JSON in the company
   password manager. If it is unavailable, the designated DevOps maintainer can
   rotate the key in Google Cloud and replace the GitHub secret.
4. The IARC content rating, Google Data Safety, Apple Content Rights, and Apple
   App Privacy declarations are complete and submitted.
5. Keep the Firebase-hosted deletion-information page available and update it
   from `docs/account-deletion.html` whenever the deletion process changes.
6. Monitor Apple and Google review messages and respond if either reviewer asks
   for clarification or replacement assets.
7. Apple is configured to release automatically after approval. Google Managed
   publishing is off, so the production rollout also publishes automatically
   after approval.
8. For later versions, publish a stable GitHub Release with customer-facing
   notes; the workflow builds, signs, uploads, and submits both stores through
   Fastlane using organization-owned credentials.

The Google Play account-deletion URL is
`https://tiqkets-global-publishing.web.app/account-deletion`. It is deployed in
the shared Google Cloud/Firebase project and is already saved in Data Safety.

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
