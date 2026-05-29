/** Inline before paint — default light unless user chose dark. */
export function ThemeScript() {
  const script = `(function(){try{var k='scout-theme';var s=localStorage.getItem(k);var d=s==='dark';document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
