// Convention: Bootstrap owns layout/forms/buttons/utilities; Tailwind owns fine-grained visual detail.
// Every Tailwind class carries the `tw-` prefix and preflight is OFF, so the two systems cannot collide.
module.exports = {
  prefix: 'tw-',
  corePlugins: { preflight: false },
  content: ['./*.html', './assets/js/**/*.js'],
  theme: { extend: {} },
};
