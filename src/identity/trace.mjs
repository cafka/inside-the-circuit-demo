export function redactText(value, secrets=[]) {
  let s = String(value);
  for (const secret of secrets) if (typeof secret==='string' && secret.length>3) s = s.split(secret).join('[REDACTED]');
  return s.replace(/AIza[\w-]+/g,'[REDACTED_API_KEY]').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g,'[REDACTED_TOKEN]')
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g,'[REDACTED_IMAGE]')
    .replace(/[A-Za-z0-9+/]{512,}={0,2}/g,'[REDACTED_LONG_BINARY]').slice(0,16000);
}
export function safeCopy(value,secrets=[]) {
  return JSON.parse(JSON.stringify(value, (key,v) => /^(apiKey|appCheckToken|debugToken|base64|inlineData|credentials)$/i.test(key) ? '[REDACTED]' : typeof v==='string' ? redactText(v,secrets) : v));
}
