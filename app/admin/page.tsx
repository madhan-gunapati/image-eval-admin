"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export default function AdminDashboard() {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<{ [key: string]: any }>({});
  const [err, setErr] = useState(null)
    const router = useRouter()
    
useEffect(() => {
  const token = localStorage.getItem("mavic_token");
  
  if (!token) {
    window.location.href = "/login";
    return;
  }
  const fetchPrompts = async () => {
    try {
        
      const res = await fetch("/api/protected/prompts" ,{
        method:"POST",
        headers:{
        'Content-Type':'Application/json',
        'Accept':'Application/json',
        'Authorization':`Bearer ${token}`
    }

      });
      const data = await res.json();
      if(!res.ok){
        setErr(1)
      }
      setPrompts(data);
    } catch (e) {
      setErr(1)
    } finally {
      setLoading(false);
    }
  };
  fetchPrompts();
}, []);

async function handleEvaluate(promptId: string) {
    const token = localStorage.getItem("mavic_token")
    const res = await fetch(`/api/protected/evaluate/id`, { method: "POST" , headers:{
        'Content-Type':'Application/json',
        'Accept':'Application/json',
        'Authorization':`Bearer ${token}`
    }, body:JSON.stringify({promptId}) });
    const data = await res.json();
    
    setEvaluations((prev) => ({ ...prev, [promptId]: data }));
  }

  const logoutUser = ()=>{
    localStorage.removeItem('mavic_token')
    router.push('/login')
    
  }

  if (loading) return <div className="p-8 text-lg">Loading prompts...</div>;
if(err) return <div className="p-8 text-lg">Error Loading prompts...
 <button type="button" onClick={logoutUser} className="mt-4 w-1/8 m-2 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 ">Logout</button>
</div>;



  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-semibold mb-8 text-gray-800">Admin Dashboard</h1>
    <button type="button" onClick={logoutUser} className="mt-4 w-1/8 m-2 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 ">Logout</button>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {prompts.map((p) => {
          const evalData = evaluations[p.id];

          return (
            <div
              key={p.id}
              className="border rounded-2xl p-5 bg-white shadow hover:shadow-md transition"
            >
              <img
                src={`/${p.imagePath}`}
                alt={p.prompt}
                className="w-full h-48 object-cover rounded-xl mb-4"
              />
              <div className="space-y-2 text-gray-700">
                <p><strong>Prompt:</strong> {p.prompt}</p>
                <p><strong>Model:</strong> {p.LLM_Model}</p>
                <p><strong>User:</strong> {p.user?.userName}</p>
                <p><strong>Brand:</strong> {p.brand?.brandName}</p>
                {p.evaluation? <p><strong>Evaluation Score:</strong> {p.evaluation}</p>:''}
              </div>

              {evalData ? (
                <div className="mt-4 border-t pt-3 text-sm text-gray-800">
                  <p><strong>Size:</strong> {evalData.sizeScore.toFixed(1)}</p>
                  <p><strong>Subject:</strong> {evalData.subjectScore.toFixed(1)}</p>
                  <p><strong>Creativity:</strong> {evalData.creativityScore.toFixed(1)}</p>
                  <p><strong>Mood:</strong> {evalData.moodScore.toFixed(1)}</p>
                  <p className="text-lg font-semibold mt-2 text-blue-700">
                    🧠 Final Score: {evalData.endScore.toFixed(1)}
                  </p>
                </div>
              ) : (
                <button
                  className="mt-4 w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                  onClick={() => handleEvaluate(p.id)}
                >
                  Evaluate
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
