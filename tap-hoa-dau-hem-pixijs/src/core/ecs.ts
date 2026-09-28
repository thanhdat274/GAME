/** Minimal typed component store used by the shop scene's transient actors. */
export type Entity = number;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ComponentType<T> = abstract new (...args: any[]) => T;

export class World {
  private nextEntity = 1;
  private readonly components = new Map<Function, Map<Entity, unknown>>();
  private readonly alive = new Set<Entity>();

  create(): Entity {
    const entity = this.nextEntity++;
    this.alive.add(entity);
    return entity;
  }

  add<T extends object>(entity: Entity, component: T): T {
    if (!this.alive.has(entity)) throw new Error(`Entity ${entity} is not alive.`);
    let store = this.components.get(component!.constructor);
    if (!store) {
      store = new Map();
      this.components.set(component!.constructor, store);
    }
    store.set(entity, component);
    return component;
  }

  get<T>(entity: Entity, componentType: ComponentType<T>): T | undefined {
    return this.components.get(componentType)?.get(entity) as T | undefined;
  }

  query<T>(componentType: ComponentType<T>): IterableIterator<[Entity, T]> {
    return (this.components.get(componentType) ?? new Map<Entity, T>()).entries() as IterableIterator<[Entity, T]>;
  }

  remove(entity: Entity): void {
    if (!this.alive.delete(entity)) return;
    for (const store of this.components.values()) store.delete(entity);
  }

  clear(): void {
    this.alive.clear();
    for (const store of this.components.values()) store.clear();
  }
}
