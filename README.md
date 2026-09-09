# TIQKETS

TIQKETS is the separate mobile application for queue management,
event check-in, customer notifications, and service reporting. The React Native
application uses Expo as its framework, while native store builds and delivery
run through Fastlane and GitHub Actions.

## Project identifiers

- App name: **TIQKETS**
- Apple bundle identifier: `com.tiqkets.app`
- Android package: `com.tiqkets.app`
- Production API: `https://tiqketsglobal.replit.app`
- Apple team: BetterBots AI Solutions Private Limited (`FF43UTULMB`)
- Source repository: `Ashok-BetterBots/Tiqkets-Global`

## Repository map

| Path | Purpose |
| --- | --- |
| `client/` | React Native application screens, components, navigation, and services |
| `server/` | API, workers, notifications, billing, and web templates |
| `shared/` | Types, schemas, permissions, and shared business rules |
| `migrations/` | Database migrations |
| `assets/` | Runtime images, icons, and sounds |
| `fastlane/` | Store automation, metadata, screenshots, and signing configuration |
| `.github/workflows/` | CI and GitHub Release-driven mobile publishing |
| `scripts/` | Release validation, signing recovery, and build helpers |
| `docs/` | Client handoff and operational documentation |

Generated native projects, local dependencies, credentials, and release output
are intentionally excluded from Git.

## Local setup

1. Install Node.js 24 and Ruby 3.3.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` and configure the required environment values.
4. Start the API with `npm run server:dev`.
5. Start the application with the appropriate Expo command for the environment.

Never commit `.env`, keystores, Apple private keys, provisioning profiles, or
store API credentials.

## Validation

- `npm run check:types`
- `npm run lint`
- `npm run test:release`
- `bundle exec fastlane lanes`

## Releases

Customer-facing GitHub Release notes are used for both stores. A published stable
release submits production builds; a prerelease targets internal testing; a
manual build run only creates signed artifacts.

- Follow [docs/RELEASING.md](docs/RELEASING.md) for the step-by-step iOS and
  Android release process.
- See [STORE_RELEASE.md](STORE_RELEASE.md) for signing architecture, credential
  recovery, and detailed store-automation notes.
- See [docs/CLIENT_HANDOFF.md](docs/CLIENT_HANDOFF.md) for ownership and client
  handoff information.
