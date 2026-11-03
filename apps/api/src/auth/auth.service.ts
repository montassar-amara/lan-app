import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { checkPw, hashPw } from './password';

export type SessionUser = { id: number; username: string };

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit() {
    if (!env.ADMIN_PASS) return;
    if ((await this.prisma.user.count()) === 0) {
      await this.prisma.user.create({
        data: { username: env.ADMIN_USER, passwordHash: await hashPw(env.ADMIN_PASS) },
      });
    }
  }

  async validate(username: string, password: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !(await checkPw(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { id: user.id, username: user.username };
  }

  sign(user: SessionUser) {
    return this.jwt.signAsync({ sub: user.id, username: user.username });
  }
}
