import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function POST(req) {
  try {
    const { name, email, password } = await req.json();
    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.admin.create({
      data: { name, email, password: hashed },
    });

    return NextResponse.json({ message: "User created", user });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }
}
