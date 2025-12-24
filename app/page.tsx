// @ts-nocheck
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const router = useRouter();
  const [tables, setTables] = useState<any[]>([]);

  useEffect(() => {
    // ดึงรายชื่อโต๊ะจาก Supabase
    const fetchTables = async () => {
      const { data } = await supabase.from('restaurant_tables').select('*').order('table_number');
      if (data) setTables(data);
    };
    fetchTables();
  }, []);

  const handleKitchenLogin = () => {
    const pin = prompt("รหัสผ่านห้องครัว:");
    if (pin === "45698") router.push("/kitchen");
    else alert("รหัสผิดครับ!");
  };

  return (
    <main className="min-h-screen bg-[#0b1220] text-[#e8edf7] flex flex-col items-center justify-center p-6 font-sans">
      <div className="text-center max-w-4xl w-full">
        <h1 className="text-5xl font-extrabold mb-8 text-[#ffd166] font-serif">เลือกโต๊ะของคุณ</h1>
        
        {/* Grid แสดงโต๊ะ */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          {tables.map((t) => (
            <Link key={t.id} href={`/order?table=${t.table_number}`} 
              className="bg-[#111a2e] p-6 rounded-2xl border border-white/5 hover:bg-white/5 hover:scale-105 transition-all flex flex-col items-center group">
              <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">🍽️</span>
              <span className="font-bold text-xl">โต๊ะ {t.table_number}</span>
            </Link>
          ))}
        </div>

        {/* ปุ่มเข้าครัว */}
        <button onClick={handleKitchenLogin} className="px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-[#a9b4c7] hover:text-white transition-colors text-sm">
          🔒 จัดการร้าน / ห้องครัว
        </button>
      </div>
    </main>
  );
}