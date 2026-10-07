import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** Test-only CMS signer. Production trust comes from the configured bundle. */
export class DeviceCmsFixture {
  readonly directory: string;
  readonly caPem: string;
  private readonly extraDirs: string[] = [];

  constructor() {
    this.directory = mkdtempSync(join(tmpdir(), 'namat-cms-fixture-'));
    this.openssl([
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      'ca.key',
      '-out',
      'ca.pem',
      '-days',
      '2',
      '-nodes',
      '-subj',
      '/CN=Test Device CA',
    ]);
    this.openssl([
      'req',
      '-newkey',
      'rsa:2048',
      '-keyout',
      'leaf.key',
      '-out',
      'leaf.csr',
      '-nodes',
      '-subj',
      '/CN=Test iPhone',
    ]);
    this.openssl([
      'x509',
      '-req',
      '-in',
      'leaf.csr',
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-out',
      'leaf.pem',
      '-days',
      '2',
    ]);
    this.caPem = readFileSync(join(this.directory, 'ca.pem'), 'utf8');
  }

  sign(xml: string): Buffer {
    writeFileSync(join(this.directory, 'payload.xml'), xml);
    this.openssl([
      'cms',
      '-sign',
      '-in',
      'payload.xml',
      '-signer',
      'leaf.pem',
      '-inkey',
      'leaf.key',
      '-nodetach',
      '-outform',
      'DER',
      '-out',
      'signed.der',
    ]);
    return readFileSync(join(this.directory, 'signed.der'));
  }

  /** CMS signed by a CA that is not the configured trust anchor. */
  signWithUntrustedCa(xml: string): Buffer {
    const dir = mkdtempSync(join(tmpdir(), 'namat-cms-untrusted-'));
    try {
      const run = (args: string[]) =>
        execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
      run([
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-keyout',
        'ca.key',
        '-out',
        'ca.pem',
        '-days',
        '2',
        '-nodes',
        '-subj',
        '/CN=Untrusted Device CA',
      ]);
      run([
        'req',
        '-newkey',
        'rsa:2048',
        '-keyout',
        'leaf.key',
        '-out',
        'leaf.csr',
        '-nodes',
        '-subj',
        '/CN=Untrusted iPhone',
      ]);
      run([
        'x509',
        '-req',
        '-in',
        'leaf.csr',
        '-CA',
        'ca.pem',
        '-CAkey',
        'ca.key',
        '-CAcreateserial',
        '-out',
        'leaf.pem',
        '-days',
        '2',
      ]);
      writeFileSync(join(dir, 'payload.xml'), xml);
      run([
        'cms',
        '-sign',
        '-in',
        'payload.xml',
        '-signer',
        'leaf.pem',
        '-inkey',
        'leaf.key',
        '-nodetach',
        '-outform',
        'DER',
        '-out',
        'signed.der',
      ]);
      return readFileSync(join(dir, 'signed.der'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /** An authority whose certificate already expired. Time checks must reject it. */
  expiredAuthority(): { caPem: string; sign: (xml: string) => Buffer } {
    const dir = mkdtempSync(join(tmpdir(), 'namat-cms-expired-'));
    this.extraDirs.push(dir);
    const run = (args: string[]) =>
      execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
    writeFileSync(join(dir, 'index.txt'), '');
    writeFileSync(join(dir, 'serial'), '01\n');
    execFileSync('mkdir', ['-p', join(dir, 'certs')]);
    writeFileSync(
      join(dir, 'ca.cnf'),
      `[ca]
default_ca = CA_default
[CA_default]
database = index.txt
new_certs_dir = certs
serial = serial
private_key = ca.key
certificate = ca.pem
default_md = sha256
policy = policy_any
default_startdate = 20010101000000Z
default_enddate = 20010102000000Z
unique_subject = no
x509_extensions = v3_ca
[policy_any]
commonName = supplied
[req]
distinguished_name = dn
prompt = no
[dn]
CN = Expired Device CA
[v3_ca]
basicConstraints = critical,CA:true
keyUsage = critical,keyCertSign,cRLSign
[v3_leaf]
basicConstraints = CA:false
keyUsage = digitalSignature
`,
    );
    run(['genrsa', '-out', 'ca.key', '2048']);
    run(['req', '-new', '-key', 'ca.key', '-out', 'ca.csr', '-config', 'ca.cnf']);
    run([
      'ca',
      '-selfsign',
      '-in',
      'ca.csr',
      '-out',
      'ca.pem',
      '-config',
      'ca.cnf',
      '-batch',
      '-extensions',
      'v3_ca',
    ]);
    run([
      'req',
      '-newkey',
      'rsa:2048',
      '-keyout',
      'leaf.key',
      '-out',
      'leaf.csr',
      '-nodes',
      '-subj',
      '/CN=Expired iPhone',
    ]);
    run([
      'ca',
      '-in',
      'leaf.csr',
      '-out',
      'leaf.pem',
      '-config',
      'ca.cnf',
      '-batch',
      '-startdate',
      '20010101000000Z',
      '-enddate',
      '20010102000000Z',
      '-extensions',
      'v3_leaf',
    ]);
    const caPem = readFileSync(join(dir, 'ca.pem'), 'utf8');
    return {
      caPem,
      sign: (xml: string) => {
        writeFileSync(join(dir, 'payload.xml'), xml);
        run([
          'cms',
          '-sign',
          '-in',
          'payload.xml',
          '-signer',
          'leaf.pem',
          '-inkey',
          'leaf.key',
          '-certfile',
          'ca.pem',
          '-nodetach',
          '-outform',
          'DER',
          '-out',
          'signed.der',
        ]);
        return readFileSync(join(dir, 'signed.der'));
      },
    };
  }

  dispose(): void {
    rmSync(this.directory, { recursive: true, force: true });
    for (const dir of this.extraDirs) rmSync(dir, { recursive: true, force: true });
  }

  private openssl(args: string[]): void {
    execFileSync('openssl', args, { cwd: this.directory, stdio: 'pipe' });
  }
}
