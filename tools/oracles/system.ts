import { existsSync } from "node:fs";

export const resolveJavaCommand = () => {
  const candidates = [
    process.env.JAVA_BIN,
    "/opt/homebrew/opt/openjdk/bin/java",
    "java",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (candidate === "java" || existsSync(candidate)) {
      return candidate;
    }
  }

  return "java";
};

export const resolveJavacCommand = () => {
  const candidates = [
    process.env.JAVAC_BIN,
    "/opt/homebrew/opt/openjdk/bin/javac",
    "javac",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (candidate === "javac" || existsSync(candidate)) {
      return candidate;
    }
  }

  return "javac";
};

export const resolveXmllintCommand = () => {
  const candidates = [
    process.env.XMLLINT_BIN,
    "/usr/bin/xmllint",
    "xmllint",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (candidate === "xmllint" || existsSync(candidate)) {
      return candidate;
    }
  }

  return "xmllint";
};
