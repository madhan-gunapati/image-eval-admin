import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST() {
  try {
    const prompts = await prisma.prompt.findMany({
      include: {
        user: true,
        brand: true,
        evaluations: true,
      },
      orderBy: {
        timeStamp: "desc",
      },
    });
    return NextResponse.json(prompts);
  } catch (error) {
    console.error("Error fetching prompts:", error);
    return NextResponse.json({ error: "Failed to fetch prompts" }, { status: 500 });
  }
}
