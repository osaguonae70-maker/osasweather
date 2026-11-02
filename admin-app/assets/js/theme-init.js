(function () {
  var pref = 'system';
  try { pref = localStorage.getItem('osw-admin-theme') || 'system'; } catch (e) { /* ignore */ }
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
