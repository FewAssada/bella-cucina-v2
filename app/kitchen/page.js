"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function KitchenPage() {
  // ตัวแปรสลับหน้า (tables, orders, menu)
  const [activeTab, setActiveTab] = useState('tables'); 
  
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menus, setMenus] = useState([]);
  const [newMenu, setNewMenu] = useState({ name: '', price: '', category: 'Food', image_url: '' });

  // --- โหลดข้อมูล Realtime ---
  const fetchData = async () => {
    // 1. โต๊ะ
    const { data: t } = await supabase.from('restaurant_tables').select('*').order('table_number');
    if (t) setTables(t);
    // 2. ออเดอร์ (เฉพาะที่ยังไม่จบ)
    const { data: o } = await supabase.from('orders').select('*').neq('status', 'completed').order('created_at', { ascending: true });
    if (o) setOrders(o);
    // 3. เมนู
    const { data: m } = await supabase.from('restaurant_menus').select('*').order('id');
    if (m) setMenus(m);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('kitchen-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, fetchData)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // --- ฟังก์ชันจัดการ ---
  const addTable = async () => {
    const next = tables.length > 0 ? Math.max(...tables.map(t => t.table_number)) + 1 : 1;
    await supabase.from('restaurant_tables').insert([{ table_number: next, status: 'available' }]);
    fetchData();
  };
  const toggleTable = async (id, status) => {
    const newStatus = status === 'available' ? 'occupied' : 'available';
    const key = newStatus === 'occupied' ? Math.random().toString(36).substring(2, 10) : null;
    await supabase.from('restaurant_tables').update({ status: newStatus, session_key: key }).eq('id', id);
    fetchData();
  };
  const handleAddMenu = async (e) => {
    e.preventDefault();
    await supabase.from('restaurant_menus').insert([newMenu]);
    setNewMenu({ name: '', price: '', category: 'Food', image_url: '' });
    fetchData();
  };
  const deleteMenu = async (id) => {
    if(confirm("ลบเมนูนี้?")) { await supabase.from('restaurant_menus').delete().eq('id', id); fetchData(); }
  };
  const updateOrder = async (id, status) => {
    await supabase.from('orders').update({ status }).eq('id', id);
    fetchData();
  };

  return (
    <div className="min-h-screen bg-[#0f172a] p-6 text-white font-sans">
      
      {/* === ส่วนหัว (Header) แบบเดิมที่คุณชอบ === */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
           <span className="text-3xl">👨‍🍳</span>
           <h1 className="text-2xl font-bold">ครัว & จัดการร้าน</h1>
        </div>

        {/* ปุ่มสลับหน้า (Tabs) */}
        <div className="flex bg-gray-800 p-1 rounded-lg">
           <button 
             onClick={() => setActiveTab('orders')}
             className={`px-4 py-2 rounded-md font-bold transition-all ${activeTab === 'orders' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
           >
             ออเดอร์ {orders.length > 0 && <span className="ml-1 bg-red-500 text-xs px-1.5 rounded-full">{orders.length}</span>}
           </button>
           <button 
             onClick={() => setActiveTab('menu')}
             className={`px-4 py-2 rounded-md font-bold transition-all ${activeTab === 'menu' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
           >
             เมนู
           </button>
           <button 
             onClick={() => setActiveTab('tables')}
             className={`px-4 py-2 rounded-md font-bold transition-all ${activeTab === 'tables' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
           >
             โต๊ะ
           </button>
           <button className="px-4 py-2 rounded-md font-bold text-red-400 hover:bg-gray-800 ml-1">ออก</button>
        </div>
      </div>

      {/* === ส่วนเนื้อหาด้านล่าง (เปลี่ยนไปตามปุ่มที่กด) === */}

      {/* 1. หน้าจัดการโต๊ะ (Tables) */}
      {activeTab === 'tables' && (
        <div className="animate-fade-in">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-300">จัดการโต๊ะ</h2>
            <button onClick={addTable} className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg">
              + เพิ่มโต๊ะ
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {tables.map((t) => (
              <div key={t.id} className={`p-6 rounded-2xl border-2 transition-all ${t.status === 'available' ? 'bg-gray-800 border-green-500' : 'bg-gray-800 border-red-500'}`}>
                <h3 className="text-4xl font-black text-center mb-2">{t.table_number}</h3>
                <div className="text-center mb-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${t.status === 'available' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                    {t.status === 'available' ? 'ว่าง' : 'มีลูกค้า'}
                  </span>
                </div>
                <button onClick={() => toggleTable(t.id, t.status)} className={`w-full py-2 rounded-lg font-bold ${t.status === 'available' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}`}>
                  {t.status === 'available' ? 'เปิดโต๊ะ' : 'เช็คบิล'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. หน้าออเดอร์ (Orders) */}
      {activeTab === 'orders' && (
        <div className="animate-fade-in">
           <h2 className="text-xl font-bold text-gray-300 mb-4">รายการอาหารที่สั่งเข้ามา 🍳</h2>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             {orders.length === 0 && <p className="text-gray-500 col-span-3 text-center py-10">ว่างเปล่า... ยังไม่มีลูกค้าสั่งอาหาร</p>}
             {orders.map((o) => (
               <div key={o.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg">
                 <div className="flex justify-between items-center border-b border-gray-600 pb-2 mb-2">
                    <span className="text-xl font-bold text-orange-400">โต๊ะ {o.table_number}</span>
                    <span className="text-xs text-gray-400">{new Date(o.created_at).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</span>
                 </div>
                 <div className="space-y-1 mb-4 text-gray-200">
                    {o.items.map((item, i) => (
                      <div key={i} className="flex justify-between">
                        <span>- {item.name} x{item.quantity}</span>
                      </div>
                    ))}
                 </div>
                 <div className="flex gap-2">
                    {o.status === 'pending' && <button onClick={() => updateOrder(o.id, 'cooking')} className="flex-1 bg-yellow-600 py-2 rounded text-sm font-bold hover:bg-yellow-500">รับออเดอร์</button>}
                    {o.status === 'cooking' && <button onClick={() => updateOrder(o.id, 'served')} className="flex-1 bg-blue-600 py-2 rounded text-sm font-bold hover:bg-blue-500">เสิร์ฟ</button>}
                    {o.status === 'served' && <button onClick={() => updateOrder(o.id, 'completed')} className="flex-1 bg-green-600 py-2 rounded text-sm font-bold hover:bg-green-500">จบงาน</button>}
                 </div>
               </div>
             ))}
           </div>
        </div>
      )}

      {/* 3. หน้าจัดการเมนู (Menu) */}
      {activeTab === 'menu' && (
        <div className="animate-fade-in max-w-4xl mx-auto">
           <h2 className="text-xl font-bold text-gray-300 mb-4">จัดการเมนูอาหาร 📖</h2>
           {/* ฟอร์มเพิ่ม */}
           <form onSubmit={handleAddMenu} className="bg-gray-800 p-4 rounded-xl mb-6 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <input className="bg-gray-700 text-white px-3 py-2 rounded" placeholder="ชื่อเมนู" value={newMenu.name} onChange={e=>setNewMenu({...newMenu, name: e.target.value})} required />
              <input type="number" className="bg-gray-700 text-white px-3 py-2 rounded" placeholder="ราคา" value={newMenu.price} onChange={e=>setNewMenu({...newMenu, price: e.target.value})} required />
              <select className="bg-gray-700 text-white px-3 py-2 rounded" value={newMenu.category} onChange={e=>setNewMenu({...newMenu, category: e.target.value})}>
                <option value="Food">อาหาร</option><option value="Drink">เครื่องดื่ม</option><option value="Dessert">ของหวาน</option>
              </select>
              <button type="submit" className="bg-green-600 text-white px-3 py-2 rounded font-bold hover:bg-green-500">เพิ่มเมนู</button>
           </form>
           {/* ตารางเมนู */}
           <div className="bg-gray-800 rounded-xl overflow-hidden">
             {menus.map((m) => (
               <div key={m.id} className="flex justify-between items-center p-3 border-b border-gray-700 hover:bg-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-600 rounded overflow-hidden">{m.image_url ? <img src={m.image_url} className="w-full h-full object-cover"/> : '🍽️'}</div>
                    <div><p className="font-bold">{m.name}</p><p className="text-xs text-gray-400">{m.category} | {m.price} บาท</p></div>
                  </div>
                  <button onClick={() => deleteMenu(m.id)} className="text-red-400 text-sm hover:underline">ลบ</button>
               </div>
             ))}
           </div>
        </div>
      )}

      <style jsx global>{`@keyframes fade-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }`}</style>
    </div>
  );
}