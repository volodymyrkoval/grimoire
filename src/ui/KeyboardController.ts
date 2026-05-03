import { KeymapEventHandler, Modifier, Scope } from "obsidian";

export type KeyHandler = () => boolean;

export class KeyboardController {
  #registered: KeymapEventHandler[] = [];

  constructor(private readonly scope: Scope) {}

  bind(modifiers: Modifier[], key: string, handler: KeyHandler): void {
    const reg = this.scope.register(modifiers, key, (e: KeyboardEvent) => {
      if (!handler()) return true;
      e.preventDefault();
      return false;
    });
    this.#registered.push(reg);
  }

  unbindAll() {
    this.#registered.forEach((cb) => this.scope.unregister(cb));
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
