import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";
import sharp from "sharp";

const prisma = new PrismaClient();

/* ---------- AGENT A: SIZE COMPLIANCE ---------- */
async function agentA_checkSize(imagePath: string) {
  try {
    const fullPath = path.join(process.cwd(), "public", imagePath);
    const buffer = fs.readFileSync(fullPath);
    const metadata = await sharp(buffer).metadata();

    const { width = 0, height = 0 } = metadata;
    const meets = width >= 300 && height >= 300;
    const score = meets ? 100 : Math.round(((width * height) / (300 * 300)) * 100);

    return { name: "sizeScore", score, width, height };
  } catch (err) {
    console.error("Agent A error:", err);
    return { name: "sizeScore", score: 0 };
  }
}

/* ---------- AGENT B: SUBJECT ADHERENCE ---------- */
function agentB_subjectAdherence(prompt: string, imagePath: string) {
  const imageName = path.basename(imagePath).toLowerCase();
  const promptWords = prompt.toLowerCase().split(/\s+/);
  const matchCount = promptWords.filter((w) => imageName.includes(w)).length;

  const adherence = Math.min(100, (matchCount / promptWords.length) * 200);
  return { name: "subjectScore", score: Math.round(adherence) };
}

/* ---------- AGENT C: CREATIVITY & MOOD ---------- */
function agentC_creativityAndMood(prompt: string) {
  const wordCount = prompt.split(/\s+/).length;
  const creativityScore = Math.min(100, (wordCount / 15) * 100); // heuristic
  const moodScore = 60 + Math.random() * 40; // pseudo-random mood
  return {
    creativityScore: Math.round(creativityScore),
    moodScore: Math.round(moodScore),
  };
}

/* ---------- AGGREGATOR ---------- */
function aggregateScores(scores: {
  sizeScore: number;
  subjectScore: number;
  creativityScore: number;
  moodScore: number;
}) {
  const total = scores.sizeScore + scores.subjectScore + scores.creativityScore + scores.moodScore;
  return Math.round(total / 4);
}

/* ---------- MAIN ROUTE ---------- */
export async function POST(
  req: Request
) {
  try {
    const {promptId} = await req.json()
    console.log(promptId)
    
   
    // Fetch prompt from DB
    const prompt = await prisma.prompt.findUnique({
      where: { id: promptId },
    });
    
    if (!prompt) {
      
      return NextResponse.json({ success: false, error: "Prompt not found" }, { status: 404 });
    }

    const imagePath = prompt.imagePath;
    const promptText = prompt.prompt;

    // Run multi-agent evaluation
    const sizeRes = await agentA_checkSize(imagePath);
    const subjectRes = agentB_subjectAdherence(promptText, imagePath);
    const { creativityScore, moodScore } = agentC_creativityAndMood(promptText);

    const scores = {
      sizeScore: sizeRes.score,
      subjectScore: subjectRes.score,
      creativityScore,
      moodScore,
    };

    const endScore = aggregateScores(scores);

    // ✅ Persist evaluation in Evaluation table
    const evaluation = await prisma.evaluation.create({
      data: {
        promptId,
        sizeScore: scores.sizeScore,
        subjectScore: scores.subjectScore,
        creativityScore: scores.creativityScore,
        moodScore: scores.moodScore,
        endScore,
      },
    });

    // ✅ Update the Prompt table with evaluation result
    await prisma.prompt.update({
      where: { id: promptId },
      data: {
        evaluation: String(endScore),
        
      },
    });
    

    return NextResponse.json({
      success: true,
      evaluation,
      sizeScore:scores.sizeScore,
      subjectScore:scores.subjectScore,
      creativityScore:scores.creativityScore,
      moodScore:scores.moodScore,
      endScore,
      message: "Evaluation completed and prompt updated successfully.",
    });
  } catch (err: any) {
    console.error("Evaluation error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
