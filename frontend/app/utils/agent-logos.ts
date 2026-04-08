export function getAgentLogoDataUri(agent: string): string {
  const a = (agent || '').toLowerCase();
  let svg = '';
  if (a === 'claude') {
    svg = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>
  <circle cx='12' cy='12' r='11' fill='#7c3aed' />
  <text x='12' y='16' font-size='12' font-family='Segoe UI, Roboto, Helvetica, Arial' text-anchor='middle' fill='#fff' font-weight='700'>C</text>
</svg>`;
  } else if (a === 'copilot') {
    svg = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>
  <rect x='1' y='1' width='22' height='22' rx='4' ry='4' fill='#0ea5e9' />
  <text x='12' y='16' font-size='10' font-family='Segoe UI, Roboto, Helvetica, Arial' text-anchor='middle' fill='#fff' font-weight='700'>CP</text>
</svg>`;
  } else if (a === 'gemini') {
    svg = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>
  <circle cx='12' cy='12' r='11' fill='#34d399' />
  <text x='12' y='16' font-size='12' font-family='Segoe UI, Roboto, Helvetica, Arial' text-anchor='middle' fill='#fff' font-weight='700'>G</text>
</svg>`;
  } else {
    const initial = (agent || '').slice(0, 2).toUpperCase();
    svg = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>
  <circle cx='12' cy='12' r='11' fill='#94a3b8' />
  <text x='12' y='16' font-size='10' font-family='Segoe UI, Roboto, Helvetica, Arial' text-anchor='middle' fill='#fff' font-weight='700'>${initial}</text>
</svg>`;
  }
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
