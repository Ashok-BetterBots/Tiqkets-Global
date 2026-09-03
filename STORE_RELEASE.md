# TIQKETS mobile release runbook

TIQKETS uses native Android/iOS builds generated from the Expo application
configuration. Store builds and uploads are handled by Fastlane; Expo Application
Services (EAS) is not used.

## Ownership and identifiers

- Apple Developer organization: BetterBots AI Solutions Private Limited
- Google Play organization: Betterbots Ai Solutions Private Limited
- iOS Bundle ID: `com.tiqkets.app`
- Android package: `com.tiqkets.app`

The existing `com.tiqkets.food` Restaurant Edition is a separate application and
must not share this app's store records or upload key.

## Android signing ownership

Google Play App Signing should hold the long-lived app-signing key. TIQKETS uses
a separate upload keystore for GitHub Actions. Store these GitHub Environment
secrets in both release environments:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`

Keep a second encrypted copy of the upload keystore and its passwords in the
company password manager. Never commit signing files or credentials. If the
upload key is compromised, replace it through Play Console without changing the
Google-managed app-signing key.

The Google service account must have access only to the TIQKETS app and only the
release permissions required by Fastlane Supply.

## GitHub environments

Create these repository environments:

- `google-play-testing` for internal, alpha, and beta tracks
- `google-play-production` for the production track

Set `EXPO_PUBLIC_API_URL` as an environment variable in both. Despite its name,
this is only the React Native build-time public API address; it does not use an
Expo service. Configure required reviewers on `google-play-production`.

## Automated Android release

The `Android release` GitHub workflow can be started manually or by pushing a
semantic tag such as `v1.0.0`. It:

1. validates the semantic version and application configuration;
2. generates Google Play release notes from commits;
3. runs Expo Prebuild to generate the native Android project;
4. restores the shared upload keystore from encrypted GitHub secrets;
5. builds the signed AAB with Gradle through Fastlane;
6. uploads metadata, release notes, and the AAB with Fastlane Supply; and
7. creates a GitHub Release with generated notes and the signed AAB attached.

Manual releases default to a draft on the internal track. Test there before
promotion. Production runs pass through the protected production environment.

Google Play requires the first AAB for a new package to be uploaded manually.
After that first release establishes the package, Fastlane Supply can manage
later uploads.

## Local validation

```sh
npm ci
EXPO_PUBLIC_API_URL=https://YOUR_API_HOST npm run release:check
```

To reproduce a signed Android release locally, provide the signing and Google
service-account environment variables listed above, install Ruby and Bundler,
then run:

```sh
bundle install
npm run build:android:release
```

## iOS signing

Once the Apple Account Holder accepts the current agreement and enables access
to Certificates, Identifiers & Profiles, use Fastlane Match with a private,
access-controlled certificate repository (or private cloud storage). Match
encrypts and shares the distribution certificate and provisioning profile so
authorized release engineers and GitHub Actions can reproduce releases. Do not
store raw Apple private keys in this application repository.

## Store information still required

- Support and account-deletion URLs
- Phone and tablet screenshots
- Apple App Privacy and Google Play Data safety declarations
- A non-production review account and role-specific review instructions
- Google content rating, target audience, ads declaration, and app-access steps
- Confirmation of backend data collection, retention, sharing, and deletion

Privacy declarations must reflect the deployed backend and third-party services,
not only the mobile source code.
