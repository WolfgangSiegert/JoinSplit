import https from 'node:https';

console.log(`security-check node=${process.version}`);
const targets = {
  control: 'https://render.com/',
  emudhra: 'https://dv-g3b-emudhra.we-have-a-problem.com/',
  'emudhra-aaa': 'https://dv-g3b-aaa-emudhra.we-have-a-problem.com/',
};
const certificateErrors = new Set([
  'CERT_REVOKED', 'CERT_SIGNATURE_FAILURE', 'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_UNTRUSTED',
]);
let passed = true;
for (const [name, url] of Object.entries(targets)) {
  const result = await new Promise(resolve => {
    const request = https.get(url, response => {
      response.destroy();
      resolve(name === 'control' ? 'tls-ok' : 'UNSAFE-accepted');
    });
    const timer = setTimeout(() => request.destroy(new Error('timeout')), 20000);
    request.once('close', () => clearTimeout(timer));
    request.once('error', error => resolve(name !== 'control' && certificateErrors.has(error.code)
      ? `certificate-rejected:${error.code}` : `INCONCLUSIVE:${error.code ?? 'timeout'}`));
  });
  console.log(`security-check node ${name}=${result}`);
  passed &&= name === 'control' ? result === 'tls-ok' : result.startsWith('certificate-rejected:');
}
process.exitCode = passed ? 0 : 1;
