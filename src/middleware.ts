import { NextRequest, NextResponse } from "next/server";

const SITE_PASSWORD = process.env.SITE_PASSWORD || "026F3AA3A";

export function middleware(request: NextRequest) {
  // Check for auth cookie
  const authCookie = request.cookies.get("cpuagen-auth");
  if (authCookie?.value === "authenticated") {
    return NextResponse.next();
  }

  // Check if this is a password submission
  if (request.method === "POST" && request.nextUrl.pathname === "/api/auth") {
    return NextResponse.next();
  }

  // Check URL param for password (for simple auth flow)
  const url = request.nextUrl;
  if (url.searchParams.get("pwd") === SITE_PASSWORD) {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set("cpuagen-auth", "authenticated", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return response;
  }

  // Show login page
  return new NextResponse(getLoginHTML(), {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

function getLoginHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CPUAGEN - Access Required</title>
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
    .container {
      text-align: center;
      max-width: 400px;
      padding: 2rem;
    }
    .logo {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      background: rgba(109, 40, 217, 0.2);
      border: 1px solid rgba(109, 40, 217, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
      font-weight: bold;
      color: #8b5cf6;
      font-size: 1.25rem;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    p {
      color: #71717a;
      font-size: 0.875rem;
      margin-bottom: 2rem;
    }
    form {
      display: flex;
      gap: 0.5rem;
    }
    input {
      flex: 1;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      border: 1px solid #1e1e2e;
      background: #0c0c12;
      color: #e4e4e7;
      font-family: 'Courier New', monospace;
      font-size: 0.875rem;
      outline: none;
      letter-spacing: 0.1em;
    }
    input:focus {
      border-color: rgba(109, 40, 217, 0.5);
    }
    input::placeholder {
      color: rgba(113, 113, 122, 0.5);
      letter-spacing: normal;
    }
    button {
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      border: none;
      background: #6d28d9;
      color: white;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover {
      background: #8b5cf6;
    }
    .error {
      color: #ef4444;
      font-size: 0.75rem;
      margin-top: 1rem;
      display: none;
    }
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
      const pwd = document.getElementById('pwd').value;
      window.location.href = '/?pwd=' + encodeURIComponent(pwd);
      return false;
    }
  </script>
</body>
</html>`;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
