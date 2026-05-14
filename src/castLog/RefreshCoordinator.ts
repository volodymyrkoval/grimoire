export interface RefreshCoordinator {
  start(onRefresh: () => void): void;
  stop(): void;
}
