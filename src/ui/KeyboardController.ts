import { KeymapEventHandler, Modifier, Scope } from "obsidian";

export type KeyHandler = () => boolean;

type Binding = { modifiers: Modifier[]; key: string; handler: KeyHandler };

export class KeyboardController {
  #bindings: Binding[] = [];
  #registered: KeymapEventHandler[] = [];

  constructor(private readonly scope: Scope) {}

  bind(modifiers: Modifier[], key: string, handler: KeyHandler): void {
    this.#bindings.push({ modifiers, key, handler });
    const reg = this.scope.register(modifiers, key, (e: KeyboardEvent) => {
      if (!handler()) return true;
      e.preventDefault();
      return false;
    });
    this.#registered.push(reg);
  }

  suspend(): void {
    this.#registered.forEach((cb) => this.scope.unregister(cb));
    this.#registered = [];
  }

  resume(): void {
    this.#bindings.forEach(({ modifiers, key, handler }) => {
      const reg = this.scope.register(modifiers, key, (e: KeyboardEvent) => {
        if (!handler()) return true;
        e.preventDefault();
        return false;
      });
      this.#registered.push(reg);
    });
  }

  unbindAll() {
    this.#registered.forEach((cb) => this.scope.unregister(cb));
    this.#registered = [];
    this.#bindings = [];
  }

  // bindTrap — always consumes the event regardless of handler return value.
  // Use when the binding's purpose is to prevent the platform from acting on
  // a key (e.g. swallowing Tab inside a focus trap) while still running an
  // internal action.
  bindTrap(modifiers: Modifier[], key: string, handler: KeyHandler): void {
    this.scope.register(modifiers, key, (e: KeyboardEvent) => {
      handler();
      e.preventDefault();
      return false;
    });
  }
}
