import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Command from "@effect/platform/Command";
import * as CommandExecutor from "@effect/platform/CommandExecutor";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { Effect, Fiber, Stream } from "effect";

const PlatformLive = NodeContext.layer;

export const fileSystem = Effect.runSync(
  FileSystem.FileSystem.pipe(Effect.provide(PlatformLive)),
);

export const path = Effect.runSync(
  Path.Path.pipe(Effect.provide(PlatformLive)),
);

const commandExecutor = Effect.runSync(
  CommandExecutor.CommandExecutor.pipe(Effect.provide(PlatformLive)),
);

export const runEffect = Effect.runPromise;

export interface CommandResult {
  readonly args: readonly string[];
  readonly command: string;
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

export const runCommand = ({
  args,
  command,
  cwd,
  env,
}: {
  args?: readonly string[];
  command: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
}) =>
  runEffect(
    Effect.scoped(
      Effect.gen(function* () {
        let processCommand = Command.make(command, ...(args ?? []));

        if (cwd) {
          processCommand = Command.workingDirectory(processCommand, cwd);
        }

        if (env) {
          processCommand = Command.env(processCommand, env);
        }

        const process = yield* commandExecutor.start(processCommand);
        const stdoutFiber = yield* Effect.fork(
          process.stdout.pipe(
            Stream.decodeText(),
            Stream.runFold("", (output, chunk) => output + chunk),
          ),
        );
        const stderrFiber = yield* Effect.fork(
          process.stderr.pipe(
            Stream.decodeText(),
            Stream.runFold("", (output, chunk) => output + chunk),
          ),
        );

        const exitCode = yield* process.exitCode;
        const stdout = yield* Fiber.join(stdoutFiber);
        const stderr = yield* Fiber.join(stderrFiber);

        return {
          args: args ?? [],
          command,
          exitCode: Number(exitCode),
          stderr,
          stdout,
        } satisfies CommandResult;
      }),
    ),
  );
