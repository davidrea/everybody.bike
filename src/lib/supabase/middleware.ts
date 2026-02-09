import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
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

  // Refresh session — this must be called so the session cookie is refreshed.
  // Do not remove this line.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public routes that don't require authentication
  const publicPaths = [
    "/login",
    "/auth/callback",
    "/api/admin/notifications/dispatch",
  ];
  const isPublicPath = publicPaths.some((path) => request.nextUrl.pathname.startsWith(path));

  // If not authenticated and not on a public path, redirect to login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If authenticated, check if onboarding is needed
  if (user && !isPublicPath && request.nextUrl.pathname !== "/onboarding") {
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
