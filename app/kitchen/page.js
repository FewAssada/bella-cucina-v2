"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function KitchenPage() {
  const [tables, setTables] = useState([]);
  
  // 1. ดึงข้อมูลโต๊ะ
  const fetchTables = async () => {
    const { data } = await supabase
      .from('restaurant_tables')
      .select('*')
      .order('table_number');
    if (data) setTables(data);
  };

  useEffect(() => {
    fetchTables();
    const interval = setInterval(fetchTables, 2000); // รีเฟรชทุก 2 วิ
    return () => clearInterval(interval);
  }, []);

  // 2. ฟังก์ชัน "เพิ่มโต๊ะ" (Add Table)
  const addTable = async () => {
    // หาเลขโต๊ะต่อไป (เช่น มีโต๊ะ 1,2 -> ต่อไปคือ 3)
    const nextNumber = tables.length > 0 
      ? Math.max(...tables.map(t => t.table_number)) + 1 
      : 1;

    const { error } = await supabase
      .from('restaurant_tables')
      .insert([{ table_number: nextNumber, status: 'available' }]);

    if (error) {
      alert("เพิ่มโต๊ะไม่สำเร็จ: " + error.message);
    } else {
      fetchTables();
    }
  };

  // 3. ฟังก์ชัน "เปิด/ปิดโต๊ะ" (Toggle)
  const toggleTable = async (id, currentStatus) => {
    const newStatus = currentStatus === 'available' ? 'occupied' : 'available';
    // สร้างกุญแจใหม่ถ้าเปิดโต๊ะ, ลบทิ้งถ้าเคลียร์โต๊ะ
    const newSessionKey = newStatus === 'occupied' 
      ? Math.random().toString(36).substring(2, 10) 
      : null;

    const { error } = await supabase
      .from('restaurant_tables')
      .update({ status: newStatus, session_key: newSessionKey })
      .eq('id', id);

    if (error) {
      alert("เปลี่ยนสถานะไม่สำเร็จ: " + error.message);
    } else {
      fetchTables();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      {/* ส่วนหัว + ปุ่มเพิ่มโต๊ะ */}
      <div className="flex justify-between items-center mb-8 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold">👨‍🍳 ครัว & จัดการร้าน</h1>
        <button 
          onClick={addTable}
          className="bg-teal-500 hover:bg-teal-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg transition-all active:scale-95"
        >
          + เพิ่มโต๊ะ
        </button>
      </div>

      {/* รายการโต๊ะ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
        {tables.map((table) => (
          <div 
            key={table.id}
            className={`
              relative p-6 rounded-2xl shadow-xl border-2 transition-all
              ${table.status === 'available' 
                ? 'bg-gray-800 border-green-500' 
                : 'bg-gray-800 border-red-500'
              }
            `}
          >
            <div className="text-center mb-4">
              <span className="text-gray-400 text-xs uppercase tracking-widest">Table</span>
              <h2 className="text-5xl font-black">{table.table_number}</h2>
            </div>

            <div className="flex justify-center mb-4">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${table.status === 'available' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                {table.status === 'available' ? 'ว่าง (Available)' : 'ลูกค้าเข้า (Occupied)'}
              </span>
            </div>

            <button
              onClick={() => toggleTable(table.id, table.status)}
              className={`
                w-full py-3 rounded-xl font-bold text-lg shadow-md transition-transform active:scale-95
                ${table.status === 'available'
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-red-600 hover:bg-red-500 text-white'
                }
              `}
            >
              {table.status === 'available' ? 'เปิดโต๊ะ ✅' : 'เช็คบิล 🏁'}
            </button>
            
            {/* แสดงกุญแจ (Debugging) */}
            {table.session_key && (
              <p className="mt-3 text-center text-xs text-gray-500 font-mono">Key: {table.session_key}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}