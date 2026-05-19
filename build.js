const fs = require('fs');

const key = process.env.SUPABASE_ANON_KEY || '';

fs.writeFileSync(
  'il-config.js',
  `window.IL_SUPABASE_ANON_KEY = ${JSON.stringify(key)};
window.IL_FN_BASE = 'https://nifbuyoghesveotugday.supabase.co/functions/v1';
window.ilFnHeaders = function ilFnHeaders() {
  var h = { 'Content-Type': 'application/json' };
  var k = window.IL_SUPABASE_ANON_KEY;
  if (k) {
    h.apikey = k;
    h.Authorization = 'Bearer ' + k;
  }
  return h;
};
`
);

console.log('il-config.js written');
