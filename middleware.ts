import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "mavic_secret");

export async function middleware(req) {
  const authHeader = req.headers.get("Authorization"); // note lowercase key
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.split(" ")[1];
  try {
    // verify token
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch (err) {
    console.error("JWT Error:", err.message);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

// Apply to specific protected routes
export const config = {
  matcher: ["/api/protected/:path*"],
};
