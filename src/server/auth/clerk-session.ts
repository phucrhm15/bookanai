import { auth } from "@clerk/tanstack-react-start/server";

export class UnauthorizedError extends Error {
  constructor(message = "Sign in required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Clerk session user id — throws if not signed in. */
export async function requireClerkUserId(): Promise<string> {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    throw new UnauthorizedError();
  }
  return userId;
}

export function unauthorizedJsonResponse(): Response {
  return Response.json({ error: "Sign in required", code: "UNAUTHORIZED" }, { status: 401 });
}
