import { checkPw, hashPw } from './password';

describe('password hashing', () => {
  it('verifies a matching password', async () => {
    const stored = await hashPw('correct horse battery staple');
    await expect(checkPw('correct horse battery staple', stored)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPw('correct horse battery staple');
    await expect(checkPw('wrong password', stored)).resolves.toBe(false);
  });
});
