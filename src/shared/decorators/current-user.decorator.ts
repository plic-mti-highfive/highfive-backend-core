import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { UserContext } from '@plic-mti-highfive/shared-types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: UserContext }>();
    return request.user;
  },
);
