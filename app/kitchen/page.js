"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ADMIN_PIN = "160942"; 

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [activeTab, setActiveTab] = useState('tables');
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menus, setMenus] = useState([]);
  const [newMenu, setNewMenu] = useState({ name: '', price: '', category: 'Food', image_url: '' });

  // Login Check
  useEffect(() => {
    if (sessionStorage.getItem("admin_auth") === "true") setIsAuthenticated(true);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (pinInput === ADMIN_PIN) {
        setIsAuthenticated(true);
        sessionStorage.setItem("admin_auth", "true");
    } else {
        alert("รหัสผิด!");
        setPinInput("");
    }
  };

  // Realtime Data
  const fetchData = async () => {
    const { data: t } = await supabase.from('restaurant_tables').select('*').order('table_number');
    if (t) setTables(t);
    const { data: o } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (o) setOrders(o);
    const { data: m } = await supabase.from('restaurant_menus').select('*').order('id');
    if (m) setMenus(m);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();
    const channel = supabase.channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, fetchData)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [isAuthenticated]);

  // --- ฟังก์ชันเปิดโต๊ะ (กำหนดรหัสได้) ---
  const handleOpenTable = async (id) => {
    // ถามพนักงานว่าจะใช้รหัสอะไร
    const customKey = prompt("ตั้งรหัสเข้าโต๊ะ (กด OK เลยเพื่อสุ่มอัตโนมัติ):", Math.floor(1000 + Math.random() * 9000));
    
    if (customKey) {
        await supabase.from('restaurant_tables').update({ status: 'occupied', session_key: customKey }).eq('id', id);
        // ไม่ต้อง fetch เพราะ Realtime จะทำงานเอง แต่กันเหนียวก็ดี
        fetchData();
    }
  };

  const handleCloseTable = async (id) => {
      if(confirm("ต้องการปิดโต๊ะและเคลียร์ลูกค้าใช่ไหม?")) {
        await supabase.from('restaurant_tables').update({ status: 'available', session_key: null }).eq('id', id);
        fetchData();
      }
  };
  
  // (ฟังก์ชันอื่นๆ ย่อไว้)
  const addTable = async () => { const next = tables.length > 0 ? Math.max(...tables.map(t => t.table_number)) + 1 : 1; await supabase.from('restaurant_tables').insert([{ table_number: next, status: 'available' }]); fetchData(); };
  const updateOrder = async (id, status) => { await supabase.from('orders').update({ status }).eq('id', id); fetchData(); };
  const handleAddMenu = async (e) => { e.preventDefault(); await supabase.from('restaurant_menus').insert([newMenu]); setNewMenu({ name: '', price: '', category: 'Food', image_url: '' }); fetchData(); };
  const deleteMenu = async (id) => { if(confirm("ลบ?")) await supabase.from('restaurant_menus').delete().eq('id', id); fetchData(); };

  if (!isAuthenticated) return (
    <div className="h-screen flex items-center justify-center bg-gray-900 text-white"><form onSubmit={handleLogin} className="text-center"><h1 className="text-2xl mb-4">Admin Login</h1><input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)} className="p-2 rounded text-center text-black" placeholder="PIN" autoFocus/><button className="block w-full bg-blue-600 mt-2 p-2 rounded">Login</button></form></div>
  );

  return (
    <div className="min-h-screen bg-[#0f172a] p-6 text-white font-sans">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Admin Manager</h1>
        <div className="flex bg-gray-800 p-1 rounded-lg">
           <button onClick={() => setActiveTab('tables')} className={`px-4 py-2 rounded ${activeTab === 'tables' ? 'bg-blue-600' : ''}`}>โต๊ะ</button>
           <button onClick={() => setActiveTab('orders')} className={`px-4 py-2 rounded ${activeTab === 'orders' ? 'bg-blue-600' : ''}`}>ออเดอร์</button>
           <button onClick={() => setActiveTab('menu')} className={`px-4 py-2 rounded ${activeTab === 'menu' ? 'bg-blue-600' : ''}`}>เมนู</button>
        </div>
      </div>

      {activeTab === 'tables' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {tables.map((t) => (
            <div key={t.id} className={`p-6 rounded-2xl border-2 text-center ${t.status === 'available' ? 'border-green-500 bg-gray-800/50' : 'border-red-500 bg-gray-800'}`}>
              <h3 className="text-4xl font-black mb-2">{t.table_number}</h3>
              {t.status === 'occupied' && (
                  <div className="bg-yellow-400 text-black font-black text-2xl py-2 rounded-lg mb-4 tracking-widest border-4 border-yellow-200">
                      {t.session_key}
                  </div>
              )}
              <div className="mb-4">
                <span className={`px-2 py-1 rounded text-xs uppercase ${t.status === 'available' ? 'text-green-400' : 'text-red-400'}`}>
                   {t.status === 'available' ? 'ว่าง (รอเปิด)' : 'ลูกค้าใช้งานอยู่'}
                </span>
              </div>
              
              {t.status === 'available' ? (
                  <button onClick={() => handleOpenTable(t.id)} className="w-full py-3 rounded-xl font-bold bg-green-600 hover:bg-green-500 shadow-lg active:scale-95 transition-transform">
                    ⚡ เปิดโต๊ะ (ระบุรหัส)
                  </button>
              ) : (
                  <button onClick={() => handleCloseTable(t.id)} className="w-full py-3 rounded-xl font-bold bg-red-600 hover:bg-red-500 shadow-lg active:scale-95 transition-transform">
                    เช็คบิล / ปิดโต๊ะ
                  </button>
              )}
            </div>
          ))}
          <button onClick={addTable} className="border-2 border-dashed border-gray-600 rounded-2xl flex items-center justify-center text-gray-500 hover:text-white hover:border-white">+ เพิ่มโต๊ะ</button>
        </div>
      )}
      
      {activeTab === 'orders' && <div className="text-center text-gray-400 mt-10">... (หน้าออเดอร์ใช้โค้ดเดิม) ...</div>}
      {activeTab === 'menu' && <div className="text-center text-gray-400 mt-10">... (หน้าเมนูใช้โค้ดเดิม) ...</div>}
    </div>
  );
}