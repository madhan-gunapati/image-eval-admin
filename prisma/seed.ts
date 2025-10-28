import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function readCSV(filePath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

async function main() {
  const dataDir = path.join(process.cwd(), "data");

  const users = await readCSV(path.join(dataDir, "users.csv"));
  const brands = await readCSV(path.join(dataDir, "brands.csv"));
  
  const prompts = await readCSV(path.join(dataDir, "prompts.csv"));

  // ✅ Insert users
  for (const u of users) {
    await prisma.user.upsert({
      where: { userId: u.userId },
      update: {},
      create: {
        userId: u.userId,
        userName: u.userName,
        userRole: u.userRole,
      },
    });
  }

  // ✅ Insert brands
  for (const b of brands) {
    await prisma.brand.upsert({
      where: { brandId: b.brandId },
      update: {},
      create: {
        brandId: b.brandId,
        brandName: b.brandName,
        brandDescription: b.brandDescription,
        style: b.style,
        brandVision: b.brandVision,
        brandVoice: b.brandVoice,
        colors: b.colors,
      },
    });
  }

  // ✅ Insert prompts
  for (const p of prompts) {
    await prisma.prompt.create({
      data: {
        imagePath: p.imagePath,
        prompt: p.prompt,
        LLM_Model: p.LLM_Model,
        channel: p.channel,
        userId: p.userId,
        brandId: p.brandId,
        timeStamp: new Date(p.timeStamp),
        evaluation: p.evaluation || null,
      },
    });
  }

  console.log("✅ All CSV data inserted successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
