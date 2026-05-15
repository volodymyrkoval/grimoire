// Subprocess spawn primitive — the load-bearing wedge under all future casts.
// Promise resolves once: the first of 'exit' or 'error' wins; later events are dropped.
// Sync spawner throws reject the promise; async spawn errors (ENOENT, EACCES) resolve
// with `{ code: null, error, stderrTail }` so callers can branch on the resolved shape.

import { Platform } from "obsidian";

/**
 * Configuration for spawning a cast process.
 */
export interface CastSpawnConfig {
  binary: string;
  args: readonly string[];
  env: Record<string, string | undefined>;
  cwd?: string;
}

/**
 * Dependency injection ports for CastSpawner.
 */
export interface CastSpawnPorts {
  spawner?: SpawnFn;
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
 * Abstracts Platform.isDesktop check and dynamic import of Node.js child_process.
 */
export class CastSpawner {
  readonly #ports: CastSpawnPorts | undefined;

  constructor(ports?: CastSpawnPorts) {
    this.#ports = ports;
  }

  /**
   * Spawn a process and return once it exits or an error is encountered.
   * Resolves with exit code and captured stderr; rejects on sync spawn errors (e.g., ENOENT).
   */
  async run(config: CastSpawnConfig): Promise<CastExitInfo> {
    const spawner = this.#ports?.spawner ?? await this.#loadSpawner();
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

      this.#listenToForgingProcess(child, safeResolve);
    });
  }

  async #loadSpawner(): Promise<SpawnFn> {
    if (!Platform.isDesktop) {
      throw new Error("CastSpawner requires a desktop environment");
    }
    const { spawn } = await import("child_process");
    return spawn as unknown as SpawnFn;
  }

  #listenToForgingProcess(
    child: SpawnedProcess,
    safeResolve: (info: CastExitInfo) => void
  ) {
    // Drain stdout to prevent OS-level pipe backpressure from stalling the child.
    child.stdout.on("data", () => {});

    const stderrFull: StderrBuffer = { message: "" };
    child.stderr.on("data", (chunk) => {
      stderrFull.message += chunk.toString();
    });

    child.on("exit", this.#handleForgingProcessExit(stderrFull, safeResolve));

    child.on("error", this.#handleForgingProcessError(stderrFull, safeResolve));
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
      console.error(
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
        console.error(`Forge spawn stderr:\n${stderrFull.message}`);
      }
      safeResolve({ code, stderrTail });
    };
  }
}
