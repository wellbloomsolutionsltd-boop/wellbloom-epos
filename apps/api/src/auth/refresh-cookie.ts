import type {
  CookieOptions,
  Request,
  Response,
} from "express";
import {
  UnauthorizedException,
} from "@nestjs/common";

export const REFRESH_COOKIE_NAME =
  "wellbloom_refresh";

const REFRESH_COOKIE_PATH = "/auth";

const DURATION_UNITS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_536_000_000,
} as const;

function refreshCookieMaxAge() {
  const value = String(
    process.env.JWT_REFRESH_EXPIRES_IN ??
      "7d",
  );
  const match =
    /^(\d+)(ms|s|m|h|d|w|y)$/i.exec(
      value,
    );

  if (!match) {
    throw new Error(
      "JWT_REFRESH_EXPIRES_IN must be a duration such as 7d",
    );
  }

  const amount = Number(match[1]);
  const unit =
    match[2].toLowerCase() as keyof typeof DURATION_UNITS;

  return amount * DURATION_UNITS[unit];
}

export function resolveRefreshCookieSecure(
  environment: NodeJS.ProcessEnv =
    process.env,
) {
  const configured =
    environment.AUTH_COOKIE_SECURE
      ?.trim()
      .toLowerCase();

  if (
    configured === undefined ||
    configured === ""
  ) {
    return false;
  }

  if (configured === "true") {
    return true;
  }

  if (configured === "false") {
    return false;
  }

  throw new Error(
    "AUTH_COOKIE_SECURE must be true or false",
  );
}

export function refreshCookieOptions(
  environment: NodeJS.ProcessEnv =
    process.env,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: resolveRefreshCookieSecure(
      environment,
    ),
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshCookieMaxAge(),
  };
}

function parseCookieHeader(
  cookieHeader: string | undefined,
) {
  if (!cookieHeader) {
    return new Map<string, string>();
  }

  return new Map(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");

        if (separator < 0) {
          return [part, ""] as const;
        }

        const name = part.slice(0, separator);
        const value = part.slice(separator + 1);

        try {
          return [
            name,
            decodeURIComponent(value),
          ] as const;
        } catch {
          return [name, ""] as const;
        }
      }),
  );
}

export function requireRefreshCookie(
  request: Request,
) {
  const refreshToken =
    parseCookieHeader(
      request.headers.cookie,
    ).get(REFRESH_COOKIE_NAME);

  if (!refreshToken) {
    throw new UnauthorizedException(
      "Invalid or expired refresh token",
    );
  }

  return refreshToken;
}

export function setRefreshCookie(
  response: Response,
  refreshToken: string,
) {
  response.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    refreshCookieOptions(),
  );
}

export function clearRefreshCookie(
  response: Response,
) {
  const options =
    refreshCookieOptions();

  response.clearCookie(
    REFRESH_COOKIE_NAME,
    {
      httpOnly: options.httpOnly,
      sameSite: options.sameSite,
      secure: options.secure,
      path: options.path,
    },
  );
}
