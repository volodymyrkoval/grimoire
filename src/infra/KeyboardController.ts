import { KeymapEventHandler, Modifier, Scope } from "obsidian";

export type KeyHandler = () => boolean;

type Binding = { modifiers: Modifier[]; key: string; handler: KeyHandler };

/**
 * Opaque release token returned by `bind()`. Calling `release()` removes only
 * that one binding (both its active scope registration and its stored spec, so
 * subsequent `suspend()`/`resume()` cycles do not bring it back).
 */
export interface BindingRelease {
  release(): void;
}

/**
 * Manages key bindings on an Obsidian `Scope`, with support for suspend/resume,
 * scoped release, and focus-trap bindings.
 *
 * Internal invariant: `#bindings[i]` and `#registered[i]` are aligned by index —
 * the i-th binding spec corresponds to the currently-active KeymapEventHandler
 * at `#registered[i]`. `suspend()` clears `#registered` and `resume()` rebuilds
 * it from `#bindings`, preserving the alignment. `release()` uses the binding
 * spec's array index to tear down both rows together.
 */
export class KeyboardController {
  #bindings: Binding[] = [];
  #registered: KeymapEventHandler[] = [];

  constructor(private readonly scope: Scope) {}

  bind(modifiers: Modifier[], key: string, handler: KeyHandler): BindingRelease {
    const binding: Binding = { modifiers, key, handler };
    this.#bindings.push(binding);
    this.#registered.push(this.#registerBinding(binding));
    return {
      release: () => {
        const i = this.#bindings.indexOf(binding);
        if (i < 0) return;
        this.#bindings.splice(i, 1);
        const [reg] = this.#registered.splice(i, 1);
        if (reg) this.scope.unregister(reg);
      },
    };
  }

  suspend(): void {
    this.#registered.forEach((cb) => this.scope.unregister(cb));
    this.#registered = [];
  }

  resume(): void {
    this.#registered = this.#bindings.map((b) => this.#registerBinding(b));
  }

  unbindAll(): void {
    this.#registered.forEach((cb) => this.scope.unregister(cb));
    this.#registered = [];
    this.#bindings = [];
  }

  #registerBinding({ modifiers, key, handler }: Binding): KeymapEventHandler {
    return this.scope.register(modifiers, key, (e: KeyboardEvent) => {
      if (!handler()) return true;
      e.preventDefault();
      return false;
    });
  }

  /**
   * Like `bind()`, but always consumes the event regardless of handler return value.
   * Use to prevent the platform from acting on a key (e.g. swallowing Tab inside a
   * focus trap) while still running an internal action.
   */
  bindTrap(modifiers: Modifier[], key: string, handler: KeyHandler): void {
    this.scope.register(modifiers, key, (e: KeyboardEvent) => {
      handler();
      e.preventDefault();
      return false;
    });
  }
}
