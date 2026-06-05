const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const MetroSymlinksResolver = require("@rnx-kit/metro-resolver-symlinks");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const resolveSymlinks = MetroSymlinksResolver({
  projectRoot: __dirname,
  nodeModulesPaths: [path.resolve(__dirname, "node_modules")],
});

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Supabase optional telemetry — not needed in the app bundle
  if (moduleName === "@opentelemetry/api") {
    return { type: "empty" };
  }
  return resolveSymlinks(context, moduleName, platform);
};

module.exports = config;
