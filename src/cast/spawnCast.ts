// Subprocess spawn primitive — the load-bearing wedge under all future casts.
// Promise resolves once: the first of 'exit' or 'error' wins; later events are dropped.
// Sync spawner throws reject the promise; async spawn errors (ENOENT, EACCES) resolve
// with `{ code: null, error, stderrTail }` so callers can branch on the resolved shape.

import { spawn as nodeSpawn } from "child_process";

export interface CastSpawnConfig {
  binary: string;
  args: readonly string[];
  env: Record<string, string | undefined>;
  cwd?: string;
}

export interface CastSpawnPorts {
  spawner?: SpawnFn;
}

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: {
    env: Record<string, string | undefined>;
    cwd?: string;
    stdio: readonly ["ignore", "pipe", "pipe"];
  }
) => SpawnedProcess;

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

export interface CastExitInfo {
  code: number | null;
  stderrTail: string;
  error?: Error;
}

const STDERR_TAIL_LIMIT = 500;

interface StderrBuffer {
  message: string;
}

export class CastSpawner {
  constructor(private readonly ports?: CastSpawnPorts) {}

  run(config: CastSpawnConfig): Promise<CastExitInfo> {
    return new Promise<CastExitInfo>((resolve, reject) => {
      const spawner = this.getSpawner();

      const options = this.getOptions(config);

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

      this.listenToForgingProcess(child, safeResolve);
    });
  }

  private listenToForgingProcess(
    child: SpawnedProcess,
    safeResolve: (info: CastExitInfo) => void
  ) {
    // Drain stdout to prevent OS-level pipe backpressure from stalling the child.
    child.stdout.on("data", () => {});

    const stderrFull: StderrBuffer = { message: "" };
    child.stderr.on("data", (chunk) => {
      stderrFull.message += chunk.toString();
    });

    child.on("exit", this.handleForgingProcessExit(stderrFull, safeResolve));

    child.on("error", this.handleForgingProcessError(stderrFull, safeResolve));
  }

  private getSpawner() {
    return this.ports?.spawner ?? (nodeSpawn as unknown as SpawnFn);
  }

  private getOptions(config: CastSpawnConfig) {
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

  private handleForgingProcessError(
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

  private handleForgingProcessExit(
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
