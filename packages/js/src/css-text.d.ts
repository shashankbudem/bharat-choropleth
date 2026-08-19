// The IIFE build imports the stylesheet as a string (esbuild `text` loader) so a
// script-tag page needs no separate <link>. Bundler/ESM consumers import
// `bharat-choropleth-js/style.css` as a real stylesheet instead.
declare module "*.css" {
  const content: string;
  export default content;
}
