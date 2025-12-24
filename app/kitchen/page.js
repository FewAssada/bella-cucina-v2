"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function KitchenPage() {
  const [tables, setTables] = useState([]);
  
  // ดึงข้อมูลโต๊ะ
  const fetchTables = async () => {
    const { data } = await supabase
      .from('restaurant_tables')
      .select('*')
      .order('table_number');
    if (data) setTables(data);
  };

  useEffect(() => {
    fetchTables();
    const interval = setInterval(fetchTables, 2000); // อัปเดตทุก 2 วิ
    return () => clearInterval(interval);
  }, []);

  // ฟังก์ชันสลับสถานะ (แก้ชื่อให้ตรงกับที่ปุ่มเรียกใช้)
  const toggleTable = async (id, currentStatus) => {
    const newStatus = currentStatus === 'available' ? 'occupied' : 'available';
    const newSessionKey = newStatus === 'occupied' 
      ? Math.random().toString(36).substring(2, 10) 
      : null;

    const { error } = await supabase
      .from('restaurant_tables')
      .update({ status: newStatus, session_key: newSessionKey })
      .eq('id', id);

    if (error) {
      console.error("Update failed:", error);
      alert("เกิดข้อผิดพลาด: " + error.message);
    } else {
      fetchTables();
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">👨‍🍳 จัดการโต๊ะ</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tables.map((table) => (
          <div key={table.id} className={`p-4 rounded-xl border-2 ${table.status === 'available' ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
            <h2 className="text-xl font-bold">โต๊ะ {table.table_number}</h2>
            <div className="my-2">
              <span className={`px-2 py-1 rounded text-sm ${table.status === 'available' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                {table.status === 'available' ? 'ว่าง' : 'ไม่ว่าง'}
              </span>
            </div>
            
            {/* ปุ่มกดเรียกใช้ฟังก์ชัน toggleTable (ตรวจสอบชื่อแล้ว) */}
            <button
              onClick={() => toggleTable(table.id, table.status)}
              className="w-full mt-2 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
            >
              {table.status === 'available' ? 'เปิดโต๊ะ' : 'เคลียร์โต๊ะ'}
            </button>
            
            {table.session_key && <p className="text-xs text-gray-400 mt-1">Key: {table.session_key}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}