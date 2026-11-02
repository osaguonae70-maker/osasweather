// Runs before first paint (loaded synchronously in <head>) so there is no flash of the wrong theme.
// localStorage only caches the *theme choice* for this device; the source of truth for signed-in users is PostgreSQL.
(function () {
  var pref = 'system';
  try { pref = localStorage.getItem('osw-theme') || 'system'; } catch (e) { /* storage blocked */ }
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function resolve(p) { return p === 'system' ? (mq && mq.matches ? 'dark' : 'light') : p; }
  document.documentElement.setAttribute('data-theme', resolve(pref));
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function () {
      var cur = 'system';
      try { cur = localStorage.getItem('osw-theme') || 'system'; } catch (e) { /* ignore */ }
      if (cur === 'system') { document.documentElement.setAttribute('data-theme', resolve('system')); document.dispatchEvent(new CustomEvent('osw:theme')); }
    });
  }
})();
