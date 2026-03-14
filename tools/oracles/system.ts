import { Effect } from "effect";

import { fileSystem } from "./platform";

const resolveCommand = Effect.fn("oracles.resolveCommand")(function* (
  candidates: readonly (string | undefined)[],
  fallback: string,
) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (candidate === fallback || (yield* fileSystem.exists(candidate))) {
      return candidate;
    }
  }

  return fallback;
});

export const resolveJavaCommand = () =>
  resolveCommand(
    [process.env.JAVA_BIN, "/opt/homebrew/opt/openjdk/bin/java", "java"],
    "java",
  );

export const resolveJavacCommand = () =>
  resolveCommand(
    [process.env.JAVAC_BIN, "/opt/homebrew/opt/openjdk/bin/javac", "javac"],
    "javac",
  );

export const resolveXmllintCommand = () =>
  resolveCommand(
    [process.env.XMLLINT_BIN, "/usr/bin/xmllint", "xmllint"],
    "xmllint",
  );
