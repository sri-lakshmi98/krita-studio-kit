/* ui-style theme switch: light / dark, starts on the system setting, remembers the choice.
   Put the one-line pre-paint script from SKILL.md in <head>, and this at the end of <body>.
   It wires every [data-theme-toggle] button, or adds one at the top right if there is none.
   With JavaScript off there is no button and the page simply follows the system. */
(() => {
  const STORAGE_KEY = 'ui-theme';
  const root = document.documentElement;
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const SUN =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/>' +
    '<path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const MOON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" fill="currentColor"/></svg>';

  let buttons = [...document.querySelectorAll('[data-theme-toggle]')];
  if (!buttons.length) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'float';
    document.body.append(button);
    buttons = [button];
  }

  const currentTheme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');

  // The button shows the theme one click switches to.
  const paint = (button) => {
    const isDark = currentTheme() === 'dark';
    button.innerHTML = (isDark ? SUN : MOON) + '<span>' + (isDark ? 'Light' : 'Dark') + '</span>';
    button.setAttribute('aria-label', isDark ? 'Switch to the light theme' : 'Switch to the dark theme');
    button.hidden = false;
  };

  const toggle = () => {
    root.dataset.theme = currentTheme() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, root.dataset.theme);
    } catch (_) {
      // Storage blocked (private window): the switch still works until the page closes.
    }
    buttons.forEach(paint);
  };

  buttons.forEach((button) => {
    button.type = 'button';
    button.classList.add('theme-toggle');
    button.addEventListener('click', toggle);
    paint(button);
  });
  systemDark.addEventListener('change', () => buttons.forEach(paint));
})();
