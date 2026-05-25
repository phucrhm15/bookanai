import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { auth } from "@clerk/tanstack-react-start/server";

/** Used by protected layouts — redirects guests to sign-in. */
export const ensureAuthenticated = createServerFn({ method: "GET" }).handler(async () => {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    throw redirect({ to: "/sign-in" });
  }
  return { userId };
});

/** Sign-in/up pages — redirect signed-in users home. */
export const redirectIfAuthenticated = createServerFn({ method: "GET" }).handler(async () => {
  const { isAuthenticated } = await auth();
  if (isAuthenticated) {
    throw redirect({ to: "/marketplace" });
  }
  return null;
});
