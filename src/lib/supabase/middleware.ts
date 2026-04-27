import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // Skip session refresh for Next.js internal prefetch requests.
  // These headers are only set by the Next.js router on same-origin
  // navigation prefetches. The `purpose` header is excluded because
  // it can be trivially forged in an external HTTP request.
  const isPrefetch =
    request.headers.get("x-middleware-prefetch") === "1" ||
    request.headers.get("next-router-prefetch") === "1";

  if (isPrefetch) {
    return NextResponse.next({ request });
  }

  const acceptsHtml = request.headers.get("accept")?.includes("text/html") ?? false;

  // Public routes that don't require authentication
  const publicPaths = [
    "/login",
    "/auth/callback",
    "/api/auth/passkey/login",
    "/api/auth/passkey/login/verify",
    "/api/admin/notifications/dispatch",
    "/api/calendar/feed",
  ];
  const isPublicPath = publicPaths.some((path) => request.nextUrl.pathname.startsWith(path));

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // On public paths we only need to know if the user *might* be signed in
  // (e.g. to bounce them off /login). getSession() reads from the cookie and
  // only refreshes when the access token is expired, avoiding a /auth/v1/user
  // round-trip on every anonymous page load. Protected paths still validate
  // via getUser() so we can't be spoofed by a forged session cookie.
  let user: { id: string } | null = null;
  if (isPublicPath || !acceptsHtml) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    user = session?.user ?? null;
  } else {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    user = authUser ?? null;
  }

  // If not authenticated and not on a public path, redirect to login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If authenticated, check if onboarding is needed
  if (user && acceptsHtml && !isPublicPath && request.nextUrl.pathname !== "/onboarding") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("invite_status")
      .eq("id", user.id)
      .single();

    if (profile?.invite_status === "pending") {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  // If authenticated and on login page, redirect to home
  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
