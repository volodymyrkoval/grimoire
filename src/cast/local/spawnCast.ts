// Subprocess spawn primitive — the load-bearing wedge under all future casts.
// Promise resolves once: the first of 'exit' or 'error' wins; later events are dropped.
// Sync spawner throws reject the promise; async spawn errors (ENOENT, EACCES) resolve
// with `{ code: null, error, stderrTail }` so callers can branch on the resolved shape.

import { Platform } from "obsidian";
import type { Logger } from "../../infra/Logger";

/**
 * Configuration for spawning a cast process.
 */
export interface CastSpawnConfig {
  binary: string;
  args: readonly string[];
  env: Record<string, string | undefined>;
  cwd?: string;
  echoOutput?: boolean;
}

/**
 * Dependency injection ports for CastSpawner.
 */
export interface CastSpawnPorts {
  spawner?: SpawnFn;
  logger?: Logger;
}

/**
 * Function signature for spawning a child process.
 */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: {
    env: Record<string, string | undefined>;
    cwd?: string;
    stdio: readonly ["ignore", "pipe", "pipe"];
  }
) => SpawnedProcess;

/**
 * Duck-typed interface for a spawned child process (mirrors Node.js ChildProcess).
 */
export interface SpawnedProcess {
  stdout: {
    on(event: "data", listener: (chunk: Uint8Array | string) => void): void;
  };
  stderr: {
    on(event: "data", listener: (chunk: Uint8Array | string) => void): void;
  };
  on(event: "exit", listener: (code: number | null) => void): void;
  on(event: "error", listener: (err: Error) => void): void;
}

/**
 * Result of a cast process termination: exit code, captured stderr, and any spawn error.
 */
export interface CastExitInfo {
  code: number | null;
  stderrTail: string;
  error?: Error;
}

const STDERR_TAIL_LIMIT = 500;

interface StderrBuffer {
  message: string;
}

/**
 * Spawns a child process, manages its event stream (stdout drained, stderr buffered), and resolves once on the first terminal event.
 * Abstracts the Platform.isDesktop check and the Node.js child_process binding, which is
 * loaded via a desktop-guarded require() — see #loadSpawner for why require() and not a
 * dynamic import().
 */
export class CastSpawner {
  readonly #ports: CastSpawnPorts | undefined;
  readonly #logger: Logger | undefined;

  constructor(ports?: CastSpawnPorts) {
    this.#ports = ports;
    this.#logger = ports?.logger;
  }

  /**
   * Spawn a process and return once it exits or an error is encountered.
   * Resolves with exit code and captured stderr; rejects on sync spawn errors (e.g., ENOENT).
   */
  async run(config: CastSpawnConfig): Promise<CastExitInfo> {
    const spawner = this.#ports?.spawner ?? this.#loadSpawner();
    const options = this.#getOptions(config);

    return new Promise<CastExitInfo>((resolve, reject) => {
      let child: SpawnedProcess;
      try {
        child = spawner(config.binary, config.args, options);
      } catch (err) {
        reject(err as Error);
        return;
      }

      let fired = false;
      const safeResolve = (info: CastExitInfo): void => {
        if (fired) return;
        fired = true;
        resolve(info);
      };

      const echoConfig = this.#deriveEchoConfig(config);
      this.#listenToForgingProcess(child, safeResolve, echoConfig);
    });
  }

  #loadSpawner(): SpawnFn {
    if (!Platform.isDesktop) {
      throw new Error("CastSpawner requires a desktop environment");
    }
    // require() (not dynamic import) so esbuild keeps the external child_process as a
    // CJS require("child_process") call — Electron resolves it, whereas a dynamic
    // import() leaves a bare ESM specifier the Obsidian renderer cannot resolve.
    // Guarded by Platform.isDesktop above so mobile bundles never invoke it.
    const { spawn } = require("child_process") as typeof import("child_process");
    return spawn as unknown as SpawnFn;
  }

  #listenToForgingProcess(
    child: SpawnedProcess,
    safeResolve: (info: CastExitInfo) => void,
    echoConfig: { echoOn: boolean; prefix: string }
  ) {
    const stderrFull: StderrBuffer = { message: "" };

    this.#attachStdoutListener(child, echoConfig);
    this.#attachStderrListener(child, stderrFull, echoConfig);

    child.on("exit", this.#handleForgingProcessExit(stderrFull, safeResolve));

    child.on("error", this.#handleForgingProcessError(stderrFull, safeResolve));
  }

  /**
   * Derives the echo configuration once from the spawn config.
   * The prefix is built here — not per chunk — so the string allocation happens once.
   */
  #deriveEchoConfig(config: CastSpawnConfig): { echoOn: boolean; prefix: string } {
    return {
      echoOn: !!config.echoOutput,
      prefix: `[${config.env.CAST_ID ?? "cast"}] `,
    };
  }

  /**
   * Attaches a stdout `data` listener that always drains the stream to prevent
   * OS-level pipe backpressure from stalling the child process.
   * When `echoConfig.echoOn`, each chunk is also written to `console.debug`.
   */
  #attachStdoutListener(
    child: SpawnedProcess,
    echoConfig: { echoOn: boolean; prefix: string }
  ): void {
    // Drain stdout to prevent OS-level pipe backpressure from stalling the child.
    child.stdout.on("data", (chunk) => {
      if (echoConfig.echoOn) {
        // console.debug is suppressed by Obsidian's DevTools filter by default;
        // console.log ensures cast output is visible in the developer console.
        // eslint-disable-next-line obsidianmd/rule-custom-message
        console.log(echoConfig.prefix + chunk.toString());
      }
    });
  }

  /**
   * Attaches a stderr `data` listener that always accumulates chunks into
   * `stderrFull.message` so the failure path has the full buffer available.
   * When `echoConfig.echoOn`, each chunk is also written to `console.error`.
   */
  #attachStderrListener(
    child: SpawnedProcess,
    stderrFull: StderrBuffer,
    echoConfig: { echoOn: boolean; prefix: string }
  ): void {
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrFull.message += text;
      if (echoConfig.echoOn) {
        console.error(echoConfig.prefix + text);
      }
    });
  }

  #getOptions(config: CastSpawnConfig) {
    const mergedEnv: Record<string, string | undefined> = {
      ...process.env,
      ...config.env,
    };
    return {
      env: mergedEnv,
      ...(config.cwd ? { cwd: config.cwd } : {}),
      stdio: ["ignore", "pipe", "pipe"] as const,
    };
  }

  #handleForgingProcessError(
    stderrFull: StderrBuffer,
    safeResolve: (info: CastExitInfo) => void
  ) {
    return (err: Error) => {
      const stderrTail = stderrFull.message.slice(-STDERR_TAIL_LIMIT);
      this.#logger?.error(
        `Forge spawn error: ${err.message}\nstderr:\n${stderrFull.message}`
      );
      safeResolve({ code: null, stderrTail, error: err });
    };
  }

  #handleForgingProcessExit(
    stderrFull: StderrBuffer,
    safeResolve: (info: CastExitInfo) => void
  ) {
    return (code: number | null) => {
      const stderrTail = stderrFull.message.slice(-STDERR_TAIL_LIMIT);
      if (code !== 0) {
        this.#logger?.error(`Forge spawn stderr:\n${stderrFull.message}`);
      }
      safeResolve({ code, stderrTail });
    };
  }
}
