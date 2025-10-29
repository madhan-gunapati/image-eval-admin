import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/* ---------- AGENT A: SIZE COMPLIANCE (Heuristic) ---------- */
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

/* ---------- GEMINI FUNCTION SCHEMAS ---------- */
const functions = [
  {
    name: "evaluate_subject_adherence",
    description:
      "Evaluate how well the image name or description matches the prompt’s subject. Return an integer score 0–100.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        imageName: { type: "string" },
      },
      required: ["prompt", "imageName"],
    },
  },
  {
    name: "evaluate_creativity_and_mood",
    description:
      "Analyze the prompt text and return creativityScore and moodScore (0–100).",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string" },
      },
      required: ["prompt"],
    },
  },
];

/* ---------- AGENT B: SUBJECT ADHERENCE (Gemini function call) ---------- */
async function agentB_subjectAdherence(prompt: string, imagePath: string) {
  const imageName = path.basename(imagePath);
  const model = genAI.getGenerativeModel({
    model:  "gemini-2.0-flash" ,
    tools: [{ functionDeclarations: [functions[0]] }],
  });

  const promptText = `
Given a prompt and image file name, assess how well the image name matches the subject described.
Return a numeric "subjectScore" (0–100) — 100 means perfect alignment.
`;

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: promptText },
          {
            functionCall: {
              name: "evaluate_subject_adherence",
              args: { prompt, imageName },
            },
          },
        ],
      },
    ],
  });

  const call = result.response.functionCalls()?.[0];
  let score = 0;
  if (call?.args) {
    const parsed = JSON.parse(JSON.stringify(call.args));
    score =
      parsed.subjectScore ||
      parsed.score ||
      parsed.value ||
      Number(Object.values(parsed)[0]) ||
      0;
  } else {
    // fallback textual extraction
    const txt = result.response.text();
    const match = txt.match(/\d+/);
    score = match ? Number(match[0]) : 50;
  }

  return { name: "subjectScore", score };
}

/* ---------- AGENT C: CREATIVITY & MOOD (Gemini function call) ---------- */
async function agentC_creativityAndMood(prompt: string) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash" ,
    tools: [{ functionDeclarations: [functions[1]] }],
  });

  const promptText = `
Analyze this text prompt and rate its creativity and mood (0–100 each).
Return JSON with two fields: "creativityScore" and "moodScore".
`;

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: promptText },
          {
            functionCall: {
              name: "evaluate_creativity_and_mood",
              args: { prompt },
            },
          },
        ],
      },
    ],
  });

  const call = result.response.functionCalls()?.[0];
  let creativityScore = 0,
    moodScore = 0;
  if (call?.args) {
    const parsed = JSON.parse(JSON.stringify(call.args));
    creativityScore =
      parsed.creativityScore ||
      Number(parsed.creativity) ||
      Number(Object.values(parsed)[0]) ||
      0;
    moodScore =
      parsed.moodScore ||
      Number(parsed.mood) ||
      Number(Object.values(parsed)[1]) ||
      0;
  } else {
    // fallback text parse
    const txt = result.response.text();
    const nums = txt.match(/\d+/g);
    creativityScore = nums?.[0] ? Number(nums[0]) : 60;
    moodScore = nums?.[1] ? Number(nums[1]) : 60;
  }

  return { creativityScore, moodScore };
}

/* ---------- AGGREGATOR ---------- */
function aggregateScores(scores: {
  sizeScore: number;
  subjectScore: number;
  creativityScore: number;
  moodScore: number;
}) {
  const total =
    scores.sizeScore +
    scores.subjectScore +
    scores.creativityScore +
    scores.moodScore;
  return Math.round(total / 4);
}

/* ---------- MAIN ROUTE ---------- */
export async function POST(req: Request) {
  try {
    const { promptId } = await req.json();

    const prompt = await prisma.prompt.findUnique({
      where: { id: promptId },
    });
    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Prompt not found" },
        { status: 404 },
      );
    }

    const imagePath = prompt.imagePath;
    const promptText = prompt.prompt;

    const sizeRes = await agentA_checkSize(imagePath);
    const subjectRes = await agentB_subjectAdherence(promptText, imagePath);
    const { creativityScore, moodScore } =
      await agentC_creativityAndMood(promptText);

    const scores = {
      sizeScore: sizeRes.score,
      subjectScore: subjectRes.score,
      creativityScore,
      moodScore,
    };

    const endScore = aggregateScores(scores);

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

    await prisma.prompt.update({
      where: { id: promptId },
      data: { evaluation: String(endScore) },
    });

    return NextResponse.json({
      success: true,
      evaluation,
      ...scores,
      endScore,
      message: "Evaluation completed using Gemini function calls.",
    });
  } catch (err: any) {
    console.error("Evaluation error:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
