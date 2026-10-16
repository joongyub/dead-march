/**
 * Reuses objects instead of allocating during gameplay (bullets, zombies, damage numbers, particles).
 * Allocating in update() causes garbage-collection pauses, which show up as frame hitches on phones.
 */
export class Pool<T> {
  private readonly free: T[] = [];
  private created = 0;

  constructor(
    private readonly create: () => T,
    private readonly onRelease: (item: T) => void,
    prewarm = 0,
  ) {
    for (let i = 0; i < prewarm; i++) this.free.push(this.make());
  }

  acquire(): T {
    return this.free.pop() ?? this.make();
  }

  release(item: T): void {
    this.onRelease(item);
    this.free.push(item);
  }

  /** Objects ever created; if this keeps growing during play, something is not being released. */
  get size(): number {
    return this.created;
  }

  get available(): number {
    return this.free.length;
  }

  private make(): T {
    this.created++;
    return this.create();
  }
}
