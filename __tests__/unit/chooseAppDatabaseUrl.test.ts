import { chooseAppDatabaseUrl } from '@/lib/db/resolveDatabaseUrl';

const localUrl = 'postgresql://postgres:secret@localhost:5432/amfgi_dev';
const remoteUrl = 'postgresql://postgres:secret@167.233.84.228:10026/amfgi';

describe('chooseAppDatabaseUrl', () => {
  it('uses the local .env database when a remote shell URL would override development', () => {
    expect(chooseAppDatabaseUrl(remoteUrl, localUrl, 'development')).toBe(localUrl);
  });

  it('keeps an intentional local shell URL', () => {
    const shellLocal = 'postgresql://postgres:secret@127.0.0.1:5432/amfgi_dev';
    expect(chooseAppDatabaseUrl(shellLocal, localUrl, 'development')).toBe(shellLocal);
  });

  it('does not override a remote URL outside development', () => {
    expect(chooseAppDatabaseUrl(remoteUrl, localUrl, 'production')).toBe(remoteUrl);
  });

  it('uses the shell URL when .env is missing', () => {
    expect(chooseAppDatabaseUrl(remoteUrl, undefined, 'development')).toBe(remoteUrl);
  });
});
