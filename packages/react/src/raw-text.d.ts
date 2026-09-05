// Vite's `?raw` suffix imports a file as a string. Used by the test that keeps
// this package's copied modules byte-identical to the framework-free package's.
declare module "*?raw" {
  const content: string;
  export default content;
}
