/** Inline before paint to avoid light-mode flash when user prefers dark. */
export function ThemeScript() {
  const script = `(function(){try{var k='scout-theme';var s=localStorage.getItem(k);var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
