export interface TickCoordinator {
  start(onTick: () => void): void;
  stop(): void;
}
