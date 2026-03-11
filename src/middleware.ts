import { NextRequest, NextResponse } from "next/server";

const SITE_PASSWORD = process.env.SITE_PASSWORD || "026F3AA3A";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Admin pages bypass site auth (admin has its own auth system)
  // But add security headers to prevent indexing and clickjacking
  if (pathname.startsWith("/admin")) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    response.headers.set("Pragma", "no-cache");
    return response;
  }

  // Check for auth cookie — authenticated users pass through
  const authCookie = request.cookies.get("cpuagen-auth");
  if (authCookie?.value === "authenticated") {
    return NextResponse.next();
  }

  // Check URL param for password (password submission)
  const url = request.nextUrl;
  const submittedPwd = url.searchParams.get("pwd");

  if (submittedPwd !== null) {
    // Check global lockout status before processing password
    try {
      const lockoutRes = await fetch(new URL("/api/admin/lockout", request.url));
      if (lockoutRes.ok) {
        const lockoutData = await lockoutRes.json();
        if (lockoutData.siteLocked) {
          return new NextResponse(getLockoutHTML(), {
            status: 503,
            headers: { "Content-Type": "text/html" },
          });
        }
      }
    } catch {
      // If lockout check fails, continue with normal auth
    }

    if (submittedPwd === SITE_PASSWORD) {
      const dest = new URL("/", request.url);
      dest.searchParams.delete("pwd");
      const response = NextResponse.redirect(dest);
      response.cookies.set("cpuagen-auth", "authenticated", {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return response;
    }

    // Wrong password — record failure via API
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";

    try {
      const failRes = await fetch(new URL("/api/admin/site-fail", request.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      if (failRes.ok) {
        const failData = await failRes.json();
        if (failData.locked) {
          return new NextResponse(getLockoutHTML(), {
            status: 503,
            headers: { "Content-Type": "text/html" },
          });
        }
      }
    } catch {
      // If recording fails, still show error
    }

    return new NextResponse(getLoginHTML(true), {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Initial page load — check lockout before showing login
  try {
    const lockoutRes = await fetch(new URL("/api/admin/lockout", request.url));
    if (lockoutRes.ok) {
      const lockoutData = await lockoutRes.json();
      if (lockoutData.siteLocked) {
        return new NextResponse(getLockoutHTML(), {
          status: 503,
          headers: { "Content-Type": "text/html" },
        });
      }
    }
  } catch {
    // If lockout check fails, show login normally
  }

  // No password submitted — show login page
  return new NextResponse(getLoginHTML(false), {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

function getLockoutHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CPUAGEN - Service Unavailable</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #050508;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container { text-align: center; max-width: 400px; padding: 2rem; }
    .icon {
      width: 64px; height: 64px; border-radius: 12px;
      background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3);
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 1.5rem; font-size: 1.5rem;
    }
    h1 { font-size: 1.25rem; font-weight: 600; color: #ef4444; margin-bottom: 0.75rem; }
    p { color: #71717a; font-size: 0.8rem; line-height: 1.6; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      margin-top: 1.5rem; padding: 0.5rem 1rem; border-radius: 0.5rem;
      background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2);
      font-family: 'Courier New', monospace; font-size: 0.65rem; color: #ef4444;
    }
    .dot {
      width: 6px; height: 6px; border-radius: 50%; background: #ef4444;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">\u{1F6E1}\u{FE0F}</div>
    <h1>Access Suspended</h1>
    <p>This service has been locked due to multiple failed authentication attempts. All security data has been preserved. Contact the system administrator to restore access.</p>
    <div class="badge"><span class="dot"></span>ENFORCEMENT LOCKOUT ACTIVE</div>
  </div>
</body>
</html>`;
}

function getLoginHTML(showError = false): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CPUAGEN - Access Required</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #050508; color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
    }
    .container { text-align: center; max-width: 400px; padding: 2rem; }
    .logo {
      width: 48px; height: 48px; border-radius: 8px;
      background: rgba(109, 40, 217, 0.2); border: 1px solid rgba(109, 40, 217, 0.4);
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 1.5rem; font-weight: bold; color: #8b5cf6; font-size: 1.25rem;
    }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; }
    p { color: #71717a; font-size: 0.875rem; margin-bottom: 2rem; }
    form { display: flex; gap: 0.5rem; }
    input {
      flex: 1; padding: 0.75rem 1rem; border-radius: 0.5rem;
      border: 1px solid #1e1e2e; background: #0c0c12; color: #e4e4e7;
      font-family: 'Courier New', monospace; font-size: 0.875rem;
      outline: none; letter-spacing: 0.1em;
    }
    input:focus { border-color: rgba(109, 40, 217, 0.5); }
    input::placeholder { color: rgba(113, 113, 122, 0.5); letter-spacing: normal; }
    button {
      padding: 0.75rem 1.5rem; border-radius: 0.5rem; border: none;
      background: #6d28d9; color: white; font-weight: 600;
      font-size: 0.875rem; cursor: pointer; transition: background 0.2s;
    }
    button:hover { background: #8b5cf6; }
    .error { color: #ef4444; font-size: 0.75rem; margin-top: 1rem; display: ${showError ? "block" : "none"}; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">C</div>
    <h1>CPUAGEN</h1>
    <p>This site is in private alpha. Enter the access code to continue.</p>
    <form id="authForm" onsubmit="return handleSubmit(event)">
      <input type="password" id="pwd" placeholder="Access code" autofocus autocomplete="off" />
      <button type="submit">Enter</button>
    </form>
    <div id="error" class="error">Invalid access code.</div>
  </div>
  <script>
    function handleSubmit(e) {
      e.preventDefault();
      var pwd = document.getElementById('pwd').value;
      window.location.href = '/?pwd=' + encodeURIComponent(pwd);
      return false;
    }
  </script>
</body>
</html>`;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|robots\\.txt).*)"],
};
