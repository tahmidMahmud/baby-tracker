/*
 * Custom SVG icon set — cinematic line style.
 * 24x24 viewBox, 1.8px rounded strokes, currentColor throughout so icons
 * inherit text color and glow from CSS. Icon(name, cls) returns markup.
 */
const Icons = (() => {
  const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const F = 'fill="currentColor" stroke="none"';

  const defs = {
    // Crescent moon — nap / sleep action
    moon: `<path ${S} d="M20.2 13.6A8.4 8.4 0 1 1 10.4 3.8a6.8 6.8 0 0 0 9.8 9.8Z"/>`,

    // Moon with sparkle — night sleep
    nightMoon: `<path ${S} d="M18.6 14.8A7.2 7.2 0 1 1 9.2 5.4a5.9 5.9 0 0 0 9.4 9.4Z"/>
      <path ${F} d="m18.7 3 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z"/>`,

    // Baby bottle — feed
    bottle: `<path ${S} d="M12 2.4c1.1 0 1.9.8 1.9 1.9v1H10.1v-1c0-1.1.8-1.9 1.9-1.9Z"/>
      <rect ${S} x="9" y="5.3" width="6" height="2.4" rx="1.1"/>
      <rect ${S} x="8.3" y="7.7" width="7.4" height="13.6" rx="3"/>
      <path ${S} d="M10.8 12.4h2.4M10.8 15.6h2.4"/>`,

    // Droplet — wet diaper / nursing
    drop: `<path ${S} d="M12 3.6S6.7 9.4 6.7 13.4a5.3 5.3 0 0 0 10.6 0C17.3 9.4 12 3.6 12 3.6Z"/>`,

    // Swirl — dirty diaper
    swirl: `<path ${S} d="M7.2 20.2h9.6a2.7 2.7 0 0 0 .6-5.3 3.1 3.1 0 0 0-2.1-4.2 3.4 3.4 0 0 0-2.5-3.2c.3-1-.1-2.2-1.3-3-.1 1-.6 1.8-1.5 2.4a3.4 3.4 0 0 0-1.5 3.8 3.1 3.1 0 0 0-2 4.2 2.7 2.7 0 0 0 .7 5.3Z"/>`,

    // Droplet + swirl — both
    both: `<path ${S} d="M7.5 3.8S3.8 8 3.8 10.9a3.7 3.7 0 0 0 7.4 0C11.2 8 7.5 3.8 7.5 3.8Z"/>
      <path ${S} d="M13.4 20.4h6.2a2 2 0 0 0 .4-3.9 2.3 2.3 0 0 0-1.5-3.1 2.5 2.5 0 0 0-1.8-2.4c.2-.8-.1-1.6-1-2.2 0 .7-.4 1.3-1 1.8a2.5 2.5 0 0 0-1.1 2.8 2.3 2.3 0 0 0-1.5 3.1 2 2 0 0 0 .5 3.9Z"/>`,

    // Folded diaper — diaper action
    diaper: `<path ${S} d="M4.6 7h14.8a1.6 1.6 0 0 1 1.6 1.7c-.2 6-4.3 10.6-9 10.6S3.2 14.7 3 8.7A1.6 1.6 0 0 1 4.6 7Z"/>
      <path ${S} d="M3.2 10.2c2 .8 3.6 2.5 4.2 4.8M20.8 10.2c-2 .8-3.6 2.5-4.2 4.8"/>`,

    home: `<path ${S} d="M4.2 11.2 12 4.4l7.8 6.8V19a1.8 1.8 0 0 1-1.8 1.8H6A1.8 1.8 0 0 1 4.2 19Z"/>
      <path ${S} d="M9.9 20.8v-4.6a2.1 2.1 0 0 1 4.2 0v4.6"/>`,

    list: `<circle cx="5" cy="6.5" r="1.1" ${F}/><circle cx="5" cy="12" r="1.1" ${F}/><circle cx="5" cy="17.5" r="1.1" ${F}/>
      <path ${S} d="M9 6.5h10.5M9 12h10.5M9 17.5h10.5"/>`,

    chart: `<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M5.5 20v-6.5M12 20V6.5M18.5 20v-9.5"/>`,

    sliders: `<path ${S} d="M4 7.5h7.5M18.5 7.5H20"/><circle ${S} cx="15.8" cy="7.5" r="2.3"/>
      <path ${S} d="M4 16.5h1.5M10.5 16.5H20"/><circle ${S} cx="8.2" cy="16.5" r="2.3"/>`,

    pause: `<path fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" d="M9 6v12M15 6v12"/>`,

    play: `<path ${F} d="M8.6 6v12c0 .9 1 1.5 1.8 1l9.2-6c.7-.5.7-1.5 0-2l-9.2-6c-.8-.5-1.8.1-1.8 1Z"/>`,

    swap: `<path ${S} d="M6.5 8.2h11l-3.1-3.1M17.5 15.8h-11l3.1 3.1"/>`,

    sparkle: `<path ${F} d="M12 3.2 13.9 9l5.9 1.9-5.9 1.9L12 18.6l-1.9-5.8-5.9-1.9L10.1 9Z"/>`,

    check: `<path ${S} d="m5 12.8 4.4 4.4L19 7.4"/>`,

    key: `<circle ${S} cx="8" cy="12" r="3.3"/><path ${S} d="M11.3 12H20M17.2 12v3M14.3 12v2.2"/>`,

    warn: `<path ${S} d="M12 4.2 21 19.4H3Z"/><path ${S} d="M12 10.2v3.6"/><circle cx="12" cy="16.6" r="1" ${F}/>`,

    sync: `<path ${S} d="M19.8 12a7.8 7.8 0 1 1-2.2-5.4M19.8 3.8V8h-4.2"/>`,

    book: `<path ${S} d="M12 5.6C10 4.1 7.6 3.6 4.9 3.9a1 1 0 0 0-.9 1v12.5a1 1 0 0 0 1.1 1c2.3-.2 4.5.2 6.9 1.7 2.4-1.5 4.6-1.9 6.9-1.7a1 1 0 0 0 1.1-1V4.9a1 1 0 0 0-.9-1c-2.7-.3-5.1.2-7.1 1.7Z"/>
      <path ${S} d="M12 5.6v14"/>`,
  };

  function Icon(name, cls = '') {
    const body = defs[name] || defs.sparkle;
    return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  }

  return { Icon };
})();
const Icon = Icons.Icon;
