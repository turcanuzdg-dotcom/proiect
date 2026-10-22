// Înlocuitorul lui node:util: doar promisify, pentru scrypt.
export function promisify(fn: (...args: any[]) => void) {
  return (...args: unknown[]) => new Promise((rezolva, respinge) => fn(...args, (e: Error | null, v: unknown) => (e ? respinge(e) : rezolva(v))));
}
