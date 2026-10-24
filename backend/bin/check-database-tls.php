<?php

use Illuminate\Contracts\Console\Kernel;

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

function reportDatabaseTls(string $name, string $result): void
{
    fwrite(STDOUT, 'database-tls '.$name.'='.$result.PHP_EOL);
}

$passed = true;
$temporaryCa = null;
try {
    $connection = $app['db']->connection('pgsql');
    $config = $connection->getConfig();
    $ca = $config['sslrootcert'] ?? '';
    $mode = $config['sslmode'] ?? '';
    reportDatabaseTls('effective-mode', $mode);
    if ($mode !== 'verify-full' || $ca !== '/etc/ssl/certs/ca-certificates.crt' || ! is_readable($ca)) {
        throw new RuntimeException('unsafe-config');
    }
    $package = trim((string) shell_exec("dpkg-query -W -f='\${Version}' ca-certificates 2>/dev/null"));
    reportDatabaseTls('ca-package', $package);
    reportDatabaseTls('ca-sha256', hash_file('sha256', $ca));
    if (! preg_match('/^(\d{8})/', $package, $matches) || $matches[1] < '20261019') {
        throw new RuntimeException('old-ca-package');
    }
    $connection->select('SELECT 1');
    reportDatabaseTls('control', 'connected');

    $host = $config['host'];
    if (! is_string($host) || ! preg_match('/^[a-z0-9.-]+\.neon\.tech$/i', $host)) {
        throw new RuntimeException('unexpected-host');
    }
    $ip = gethostbyname($host);
    if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        throw new RuntimeException('dns-failed');
    }
    $key = openssl_pkey_new(['private_key_bits' => 2048]);
    $csr = openssl_csr_new(['commonName' => 'Untrusted TLS test CA'], $key);
    $certificate = openssl_csr_sign($csr, null, $key, 1);
    openssl_x509_export($certificate, $pem);
    $temporaryCa = tempnam(sys_get_temp_dir(), 'database-tls-ca-');
    file_put_contents($temporaryCa, $pem);
    chmod($temporaryCa, 0600);

    $database = str_replace("'", "\\'", $config['database']);
    $port = (int) ($config['port'] ?? 5432);
    foreach (['hostname' => ['tls-negative-check.invalid', $ca], 'untrusted-ca' => [$host, $temporaryCa]] as $name => [$probeHost, $probeCa]) {
        $dsn = "pgsql:host={$probeHost};hostaddr={$ip};port={$port};dbname='{$database}';sslmode=verify-full;sslrootcert={$probeCa};connect_timeout=8";
        try {
            // TLS must reject before authentication; never send real credentials in negative probes.
            new PDO($dsn, 'tls_negative_probe', 'unused-negative-probe-password');
            $result = 'UNSAFE-accepted';
            $passed = false;
        } catch (PDOException $exception) {
            $expected = $name === 'hostname'
                ? str_contains($exception->getMessage(), 'does not match host name')
                : str_contains($exception->getMessage(), 'certificate verify failed');
            $result = $expected ? 'rejected' : 'INCONCLUSIVE';
            $passed = $passed && $expected;
        }
        reportDatabaseTls($name, $result);
    }
} catch (Throwable) {
    reportDatabaseTls('status', 'FAILED');
    $passed = false;
} finally {
    if (is_string($temporaryCa)) {
        unlink($temporaryCa);
    }
}
reportDatabaseTls('result', $passed ? 'PASS' : 'FAIL');
exit($passed ? 0 : 1);
