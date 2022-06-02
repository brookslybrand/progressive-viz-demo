/**
 * @type {import('@remix-run/dev').AppConfig}
 */
module.exports = {
  ignoredRouteFiles: [
    ".*",
    "**/*.css",
    "**/*.test.{js,jsx,ts,tsx}",
    "README.md",
  ],
  serverDependenciesToBundle: [
    "d3-shape",
    "d3-path",
    "d3-scale",
    "d3-array",
    "d3-interpolate",
    "d3-color",
    "d3-time",
    "d3-format",
    "d3-time-format",
    "d3-axis",
    "d3-interpolate-path",
    "internmap",
  ],
};
