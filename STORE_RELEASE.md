# TIQKETS mobile release runbook

The app uses Expo Application Services (EAS) managed credentials. This is the
recommended team setup: credentials belong to the Expo organization rather than
to one developer's laptop, and authorized organization members can create later
releases without exchanging private key files.

## Accounts and ownership

Before the first release, use organization-owned accounts rather than an
individual employee's account:

- An Apple Developer Program organization account. Invite release engineers in
  App Store Connect and the Apple Developer portal.
- A Google Play Console organization account. Invite release engineers under
  **Users and permissions**.
- An Expo organization. Invite release engineers with Developer or Admin access.

The permanent app identifiers are `com.tiqkets.app` on both stores. Confirm that
Tiqkets controls these identifiers before creating either store listing; changing
them after publication creates a different app.

## One-time Expo and credential setup

1. Install dependencies: `npm ci`.
2. Authenticate to the team Expo account: `npx eas-cli login`.
3. Link or create the EAS project: `npx eas-cli init`. This writes the real
   `expo.extra.eas.projectId` to `app.json`. If the project belongs to an Expo
   organization, also add `expo.owner`.
4. Add the public production API URL to the EAS `production` environment:
   `npx eas-cli env:create --environment production --name EXPO_PUBLIC_API_URL --value https://YOUR_API_HOST`.
5. Run `npx eas-cli credentials --platform ios`. Let EAS create and manage the
   Apple distribution certificate and provisioning profile in the organization
   account.
6. Run `npx eas-cli credentials --platform android`. Let EAS generate and manage
   the Android upload keystore. Keep Google Play App Signing enabled: Google then
   protects the app-signing key while EAS holds the replaceable upload key.

Do not commit exported certificates, provisioning profiles, private keys,
keystores, passwords, App Store Connect API keys, or Play service-account JSON.
The repository ignores common credential file types as an additional safeguard.

## Shared submission access

For unattended iOS submissions, create a team App Store Connect API key with the
minimum required access and configure it through `eas credentials`. For Android,
create a dedicated Google Cloud service account, grant it release access to only
this app in Play Console, and upload its JSON key through EAS credentials. Store
backup copies in the company's password manager, not in Git or chat.

Every release engineer needs access to all three team systems (Expo, Apple, and
Google); possession of a local certificate alone is neither necessary nor a good
handoff strategy.

## Build and submit

Run these checks before producing store artifacts:

```sh
npm run check:types
npm run lint
npx expo-doctor
```

Then create signed production builds:

```sh
npx eas-cli build --platform all --profile production
```

Submit a specific successful build after testing it:

```sh
npx eas-cli submit --platform ios --profile production
npx eas-cli submit --platform android --profile production
```

Android submissions are deliberately configured as draft releases on the
internal track. Promote them in Play Console only after device testing. iOS
builds should go through TestFlight before App Review.

## GitHub Actions Android releases

The `Android release` workflow supports semantic version tags such as `v1.0.0`
and manual runs from the Actions page. It performs these operations in order:

1. validates the version, Expo configuration, and Android JavaScript bundle;
2. generates English (United States) Google Play release notes from commits;
3. creates a signed Android App Bundle with EAS managed credentials;
4. uploads the bundle and release notes to the selected Google Play track;
5. creates a GitHub Release with generated changelog and the signed AAB; and
6. records the build ID, track, status, and notes in the Actions summary.

Configure these repository settings before the first run:

- GitHub secret `EXPO_TOKEN`: an Expo access token belonging to the account that
  owns or can build the linked EAS project.
- GitHub secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`: the complete JSON credential
  for a dedicated Google service account with access only to the TIQKETS app.
- GitHub environment variable `EXPO_PUBLIC_API_URL` in both
  `google-play-testing` and `google-play-production` environments.
- Required reviewers on `google-play-production`, so no production deployment
  can proceed without human approval.

The workflow defaults to a draft release on the internal track. Use a completed
internal release only after testing, and use the production track only through
the protected production environment.

Before automation can make its first Play upload, initialize EAS once from a
trusted workstation: link the EAS project, create its Android upload keystore,
and make one signed build. Google Play may require the first AAB to be uploaded
through Play Console before Android Publisher API uploads are accepted.

## Store information still required

- Support URL, marketing URL, privacy-policy URL, and account-deletion URL
- Store description, subtitle/short description, keywords, category, and contact
- Phone and tablet screenshots in the store-required sizes
- App Privacy / Play Data safety answers covering account data, profile photos,
  precise or approximate location, notifications, camera-based QR scanning, and
  any analytics or diagnostics actually used by the production service
- Apple review credentials for a non-production demo account and review notes
- Google content rating, target audience, ads declaration, and app-access steps

The privacy answers must reflect the deployed backend as well as this client.
Do not guess them from the mobile source alone.
