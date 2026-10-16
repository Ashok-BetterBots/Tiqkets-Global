fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## Android

### android build

```sh
[bundle exec] fastlane android build
```

Build a signed Android App Bundle

### android publish

```sh
[bundle exec] fastlane android publish
```

Publish an existing AAB and its store metadata to Google Play

### android release

```sh
[bundle exec] fastlane android release
```

Build and publish in one local command

----


## iOS

### ios certificates

```sh
[bundle exec] fastlane ios certificates
```

Create or renew the shared Apple distribution identity (run by an authorized maintainer)

### ios build

```sh
[bundle exec] fastlane ios build
```

Build an IPA using the company's encrypted Fastlane Match credentials

### ios publish

```sh
[bundle exec] fastlane ios publish
```

Upload the exact build to TestFlight, or submit it to App Store review with automatic release

### ios screenshots

```sh
[bundle exec] fastlane ios screenshots
```

Upload the reviewed iPhone/iPad screenshot set without submitting a build

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
