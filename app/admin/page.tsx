"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [filteredPrompts, setFilteredPrompts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<{ [key: string]: any }>({});
  const [error, setError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("mavic_token");
    if (!token) {
      router.push("/login");
      return;
    }

    const fetchPrompts = async () => {
      try {
        const res = await fetch("/api/protected/prompts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) throw new Error(`Error: ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("Invalid data format");
        setPrompts(data);
        setFilteredPrompts(data);
      } catch (e: any) {
        console.error(e);
        setError("Failed to load prompts. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchPrompts();
  }, [router]);

  async function handleEvaluate(promptId: string) {
    const token = localStorage.getItem("mavic_token");
    if (!token) {
      router.push("/login");
      return;
    }

    setEvaluating(promptId);
    try {
      const res = await fetch(`/api/protected/evaluate/id`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ promptId }),
      });

      const data = await res.json();
      if (!res.ok || !data) throw new Error("Evaluation failed");

      setEvaluations((prev) => ({ ...prev, [promptId]: data }));

      // Update filtered data as well
      setPrompts((prev) =>
        prev.map((p) =>
          p.id === promptId ? { ...p, evaluation: data.endScore } : p
        )
      );
    } catch (e) {
      console.error(e);
      alert("Error during evaluation. Try again.");
    } finally {
      setEvaluating(null);
    }
  }

  const logoutUser = () => {
    localStorage.removeItem("mavic_token");
    router.push("/login");
  };

  // --- Filtering logic ---
  useEffect(() => {
    if (filter === "all") {
      setFilteredPrompts(prompts);
    } else {
      const threshold = Number(filter);
      const filtered = prompts.filter((p) => {
        const score = Number(p.evaluation);
        if (isNaN(score)) return false;
        return score >= threshold;
      });
      setFilteredPrompts(filtered);
    }
  }, [filter, prompts]);

  // --- UI STATES ---

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen text-lg text-gray-700">
        Loading prompts...
      </div>
    );

  if (error)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center">
        <p className="text-lg text-red-500">{error}</p>
        <button
          type="button"
          onClick={logoutUser}
          className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
        >
          Logout
        </button>
      </div>
    );

  if (filteredPrompts.length === 0)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-gray-700">
        <p>No prompts found for this filter.</p>
        <button
          type="button"
          onClick={logoutUser}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
        >
          Logout
        </button>
      </div>
    );

  // --- MAIN DASHBOARD ---
  return (
    <div className="p-6 sm:p-10 bg-gray-50 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-10 gap-4">
        <h1 className="text-3xl font-semibold text-gray-800">Admin Dashboard</h1>

        <div className="flex flex-wrap items-center gap-3">
          {/* Filter Dropdown */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Scores</option>
            <option value="80">Score ≥ 80</option>
            <option value="60">Score ≥ 60</option>
            <option value="40">Score ≥ 40</option>
            <option value="20">Score ≥ 20</option>
          </select>

          <button
            type="button"
            onClick={logoutUser}
            className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filteredPrompts.map((p) => {
          const evalData = evaluations[p.id];
          const isEvaluating = evaluating === p.id;

          return (
            <div
              key={p.id}
              className="border rounded-2xl p-5 bg-white shadow-sm hover:shadow-lg transition-all"
            >
              <img
                src={p.imagePath ? `/${p.imagePath}` : "/placeholder.jpg"}
                alt={p.prompt || "Generated Image"}
                className="w-full h-48 object-cover rounded-xl mb-4"
              />

              <div className="space-y-2 text-gray-700">
                <p>
                  <strong>Prompt:</strong> {p.prompt || "—"}
                </p>
                <p>
                  <strong>Model:</strong> {p.LLM_Model || "Unknown"}
                </p>
                <p>
                  <strong>User:</strong> {p.user?.userName || "Anonymous"}
                </p>
                <p>
                  <strong>Brand:</strong> {p.brand?.brandName || "—"}
                </p>
                {p.evaluation && (
                  <p>
                    <strong>Saved Score:</strong> {p.evaluation}
                  </p>
                )}
              </div>

              {/* Evaluation results */}
              {evalData ? (
                <div className="mt-4 border-t pt-3 text-sm text-gray-800">
                  <p>
                    <strong>Size:</strong> {evalData.sizeScore?.toFixed(1)}
                  </p>
                  <p>
                    <strong>Subject:</strong> {evalData.subjectScore?.toFixed(1)}
                  </p>
                  <p>
                    <strong>Creativity:</strong> {evalData.creativityScore?.toFixed(1)}
                  </p>
                  <p>
                    <strong>Mood:</strong> {evalData.moodScore?.toFixed(1)}
                  </p>
                  <p className="text-lg font-semibold mt-2 text-blue-700">
                    🧠 Final Score: {evalData.endScore?.toFixed(1)}
                  </p>
                </div>
              ) : (
                <button
                  className={`mt-4 w-full py-2 rounded-md text-white transition ${
                    isEvaluating
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                  onClick={() => !isEvaluating && handleEvaluate(p.id)}
                  disabled={isEvaluating}
                >
                  {isEvaluating ? "Evaluating..." : "Evaluate"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
