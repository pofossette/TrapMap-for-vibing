declare module 'mime-types' {
  export function lookup(path: string): string | false;

  const mime: {
    lookup(path: string): string | false;
  };

  export default mime;
}
