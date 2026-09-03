const releaseVersion = process.env.RELEASE_VERSION?.replace(/^v/, "");

if (
  releaseVersion &&
  !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(releaseVersion)
) {
  throw new Error(
    `RELEASE_VERSION must be a semantic version, received: ${releaseVersion}`,
  );
}

module.exports = ({ config }) => ({
  ...config,
  version: releaseVersion || config.version,
});
