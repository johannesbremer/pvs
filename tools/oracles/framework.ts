import { oraclePluginRegistry } from "./index";

export const listOraclePlugins = () =>
  oraclePluginRegistry.plugins.map((plugin) => plugin);

export const getOraclePlugin = (family: string) =>
  oraclePluginRegistry.plugins.find((plugin) => plugin.family === family);

export const buildOraclePlan = ({
  artifactId,
  documentId,
  family,
  profileVersion,
}: {
  artifactId?: string;
  documentId?: string;
  family: string;
  profileVersion?: string;
}) => {
  const plugin = getOraclePlugin(family);
  if (!plugin) {
    return undefined;
  }

  return {
    family: plugin.family,
    fixtureRoot: plugin.fixtureRoot,
    inputKind: plugin.inputKind,
    pluginKind: plugin.kind,
    ...("command" in plugin ? { command: plugin.command } : {}),
    ...("workingDirectory" in plugin
      ? { workingDirectory: plugin.workingDirectory }
      : {}),
    expectedOutputs: plugin.expectedOutputs,
    passFailRule: plugin.passFailRule,
    ...(artifactId ? { artifactId } : {}),
    ...(documentId ? { documentId } : {}),
    ...(profileVersion ? { profileVersion } : {}),
  };
};

export const stubOracleReport = ({
  family,
  passed,
  summary,
}: {
  family: string;
  passed: boolean;
  summary: string;
}) => ({
  family,
  passed,
  severity: passed ? "info" : "error",
  summary,
});
